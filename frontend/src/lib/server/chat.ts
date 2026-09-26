import "server-only";
import { query } from "../db";
import { GroundedAnswer } from "../types";
import { DAY, Recipient } from "./domain";
import { answerFromPlan, buildConversationPlan, validatePlan } from "./evidence";
import { embed } from "./gemini";
import { configuredProviders } from "./providers/llm-provider";
import { resolveIntent } from "./intent";
import { getBaselines, getEvents, latestTime, reserveBudget, usesDatabase } from "./repository";
import { safetyResponse } from "./safety";
import { readMemory, signContext } from "./session";
import { planQuestion } from "./planner";

export interface ChatInput { recipient_id: string; message: string; conversation_id?: string; reference_time?: string }
export type Emit = (event: string, payload: unknown) => void;
export async function processChat(input: ChatInput, recipient: Recipient, emit: Emit, signal: AbortSignal) {
  const memory = readMemory(input.conversation_id, recipient.id);
  const boundary = safetyResponse(input.message, !!memory);
  const messageId = crypto.randomUUID();
  if (boundary) {
    const answer: GroundedAnswer = { answer: boundary.message, claims: [], evidence: [], limitations: [], data_coverage_summary: "N/A", abstained: true, safety_flags: [boundary.flag], message_id: messageId };
    if (memory) answer.conversation_id = input.conversation_id;
    emit("delta", { text: answer.answer }); emit("done", answer); return;
  }
  const latest = await latestTime(recipient.id, signal);
  const anchor = input.reference_time || latest || new Date().toISOString();
  const previous = memory?.intent;
  let intent = resolveIntent(input.message, anchor, previous);
  const flags: string[] = [];
  // Clear questions and referential follow-ups need no extra model round trip.
  // Ambiguous questions can use a bounded planner; validated SQL stays server-owned.
  if (!intent.activities.length && intent.task === "activity") {
    for (const provider of configuredProviders()) {
      if (!await reserveBudget(signal, provider.provider_name)) continue;
      try {
        intent = await planQuestion(provider, input.message, intent, memory, AbortSignal.any([signal, AbortSignal.timeout(5000)]));
        flags.push("MODEL_PLANNED"); break;
      } catch { flags.push("PLANNER_FALLBACK"); }
    }
  }
  const [events, baselines, history] = await Promise.all([
    getEvents(recipient.id, intent.start, intent.end, intent.activities, signal),
    getBaselines(recipient.id, intent.start, signal),
    intent.behavioral || intent.task === "overview" || intent.task === "explanation" ? getEvents(recipient.id, new Date(Date.parse(intent.start) - 7 * DAY).toISOString(), intent.start, [], signal) : Promise.resolve([]),
  ]);
  let preferredIds: string[] = [];
  // Vectors rank narratives; exact relational records remain the source for every metric.
  if ((intent.behavioral || intent.task === "overview") && usesDatabase() && process.env.GEMINI_API_KEY && await reserveBudget(signal)) {
    try {
      const queryEmbedding = await embed(input.message, AbortSignal.any([signal, AbortSignal.timeout(5000)]));
      const vector = `[${queryEmbedding.join(",")}]`;
      const data = await query<{ recipient_id: string; metadata: { event_ids?: string[] } }>("select recipient_id, metadata from public.match_activity_embeddings($1::vector, $2::float, $3::int, $4::text)", [vector, 0.3, 4, recipient.id], signal);
      preferredIds = data.filter(row => row.recipient_id === recipient.id).flatMap(row => row.metadata?.event_ids || []).slice(0, 32);
    } catch { flags.push("SEMANTIC_SEARCH_UNAVAILABLE"); }
  }
  const plan = buildConversationPlan(recipient, intent, events, baselines, history, preferredIds);
  if (!validatePlan(plan)) throw new Error("Grounding validation failed");
  const answer = answerFromPlan(plan);
  answer.message_id = messageId;
  answer.safety_flags = flags;
  emit("evidence", { evidence: plan.evidence, claims: plan.claims });
  emit("delta", { text: plan.intro });
  const sent = new Set<number>();
  const textParts = [plan.intro];
  const sendClaim = async (id: number) => {
    if (sent.has(id)) return;
    sent.add(id);
    const text = plan.claims[id].claim_text;
    textParts.push(text);
    const tokens = (`\n\n${text}`).match(/\s*\S+\s*/g) || [];
    for (let i = 0; i < tokens.length; i += 5) {
      if (signal.aborted) throw new Error("Request cancelled");
      emit("delta", { text: tokens.slice(i, i + 5).join("") });
      await new Promise<void>(resolve => setTimeout(resolve, 8));
    }
  };
  let generated = false;
  if (plan.claims.length) {
    const providers = configuredProviders();
    for (const provider of providers) {
      if (!await reserveBudget(signal, provider.provider_name)) continue;
      try {
        const context = JSON.stringify({ current_question: input.message, recent_conversation: memory?.turns || [], resolved_intent: intent, instruction: "Answer the current question using current evidence; conversation history is context, not evidence." });
        // Validate the complete selection before emitting it; a failed provider must
        // not leave a partially accepted answer mixed with its fallback.
        const selection: number[] = [];
        for await (const id of provider.streamClaimIds(context, plan.claims, AbortSignal.any([signal, AbortSignal.timeout(12000)]))) selection.push(id);
        for (const id of selection) await sendClaim(id);
        generated = true;
        if (provider !== providers[0]) answer.safety_flags.push("SECONDARY_PROVIDER_USED");
        break;
      } catch (error) {
        answer.safety_flags.push("GROUNDED_FALLBACK");
        const status = error instanceof Error ? error.message.match(/^Generation provider status (\d{3})$/)?.[1] : undefined;
        answer.safety_flags.push(`${provider.provider_name.toUpperCase()}_${status ? `STATUS_${status}` : "UNAVAILABLE"}`);
      }
    }
  }
  if (!generated) {
    answer.safety_flags.push("DETERMINISTIC_RESPONSE");
    for (let i = 0; i < plan.claims.length; i++) await sendClaim(i);
  }
  answer.answer = textParts.join("\n\n");
  answer.claims = [...sent].map(id => plan.claims[id]);
  answer.conversation_id = signContext(recipient.id, intent, [...(memory?.turns || []), { question: input.message, answer: answer.answer }]);
  emit("done", answer);
}
