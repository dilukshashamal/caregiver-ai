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
import { generateNarrative, narrativeClaims, NarrativeRejection } from "./narrative";

export interface ChatInput { recipient_id: string; message: string; conversation_id?: string; reference_time?: string }
export type Emit = (event: string, payload: unknown) => void;
export async function processChat(input: ChatInput, recipient: Recipient, emit: Emit, signal: AbortSignal) {
  const memory = readMemory(input.conversation_id, recipient.id);
  const boundary = safetyResponse(input.message, !!memory);
  const messageId = crypto.randomUUID();
  if (boundary) {
    const social = ["CONVERSATIONAL_RESPONSE", "GREETING_RESPONSE"].includes(boundary.flag);
    const answer: GroundedAnswer = { answer: boundary.message, claims: [], evidence: [], limitations: [], data_coverage_summary: "N/A", abstained: !social, safety_flags: [boundary.flag], message_id: messageId };
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
  let generated = false;
  let repairUsed = false;
  if (plan.claims.length) {
    emit("status", { state: "composing" });
    const providers = configuredProviders();
    for (const provider of providers) {
      if (!await reserveBudget(signal, provider.provider_name)) continue;
      try {
        // Let the model compose language, then check references, numeric consistency,
        // and unsafe assertions before any generated text reaches the caregiver.
        let narrative;
        try { narrative = await generateNarrative(provider, input.message, intent, plan, memory, AbortSignal.any([signal, AbortSignal.timeout(12000)])); }
        catch (error) {
          if (!(error instanceof NarrativeRejection) || repairUsed || !await reserveBudget(signal, provider.provider_name)) throw error;
          repairUsed = true;
          narrative = await generateNarrative(provider, input.message, intent, plan, memory, AbortSignal.any([signal, AbortSignal.timeout(8000)]), error);
          answer.safety_flags.push("NARRATIVE_REPAIRED");
        }
        answer.claims = narrativeClaims(narrative, plan);
        answer.answer = `${recipient.metadata.synthetic ? "Synthetic demonstration. " : ""}${narrative.paragraphs.map(p => p.text).join("\n\n")}`;
        const used = new Set(answer.claims.flatMap(c => c.evidence_ids));
        answer.evidence = plan.evidence.filter(e => used.has(e.evidence_id));
        answer.safety_flags.push("LLM_COMPOSED");
        generated = true;
        if (provider !== providers[0]) answer.safety_flags.push("SECONDARY_PROVIDER_USED");
        break;
      } catch (error) {
        answer.safety_flags.push("GROUNDED_FALLBACK");
        const status = error instanceof Error ? error.message.match(/^Generation provider status (\d{3})$/)?.[1] : undefined;
        answer.safety_flags.push(`${provider.provider_name.toUpperCase()}_${status ? `STATUS_${status}` : "UNAVAILABLE"}`);
        if (error instanceof Error && /^(?:Unsupported narrative (?:number|unit|timestamp|format|comparison)|Invalid narrative (?:shape|length|citation)|Unsafe narrative assertion|Incomplete narrative)$/.test(error.message)) answer.safety_flags.push(error.message.toUpperCase().replaceAll(" ", "_"));
      }
    }
  }
  if (!generated) {
    answer.safety_flags.push("DETERMINISTIC_RESPONSE");
    if (plan.claims.length) answer.limitations.unshift("AI narration was unavailable for this response; the answer uses computed activity facts.");
  }
  emit("evidence", { evidence: answer.evidence, claims: answer.claims });
  // Keep the existing SSE contract. Do not expose unvalidated partial model prose
  // or add artificial per-token delays to a metered serverless invocation.
  const chunks = answer.answer.match(/\s*\S+\s*/g) || [];
  for (let i = 0; i < chunks.length; i += 5) {
    if (signal.aborted) throw new Error("Request cancelled");
    emit("delta", { text: chunks.slice(i, i + 5).join("") });
  }
  answer.conversation_id = signContext(recipient.id, intent, [...(memory?.turns || []), { question: input.message, answer: answer.answer }]);
  emit("done", answer);
}
