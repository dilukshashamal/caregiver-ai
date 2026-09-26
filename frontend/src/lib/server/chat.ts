import "server-only";
import { getSupabase } from "../supabase";
import { GroundedAnswer } from "../types";
import { DAY, Recipient } from "./domain";
import { answerFromPlan, buildAnswerPlan, validatePlan } from "./evidence";
import { embed } from "./gemini";
import { configuredProviders } from "./providers/llm-provider";
import { resolveIntent } from "./intent";
import { getBaselines, getEvents, latestTime, reserveBudget, usesSupabase } from "./repository";
import { safetyResponse } from "./safety";
import { readContext, signContext } from "./session";

export interface ChatInput { recipient_id: string; message: string; conversation_id?: string; reference_time?: string }
export type Emit = (event: string, payload: unknown) => void;
export async function processChat(input: ChatInput, recipient: Recipient, emit: Emit, signal: AbortSignal) {
  const boundary = safetyResponse(input.message);
  const messageId = crypto.randomUUID();
  if (boundary) {
    const answer: GroundedAnswer = { answer: boundary.message, claims: [], evidence: [], limitations: [], data_coverage_summary: "N/A", abstained: true, safety_flags: [boundary.flag], message_id: messageId };
    emit("delta", { text: answer.answer }); emit("done", answer); return;
  }
  const latest = await latestTime(recipient.id, signal);
  const anchor = input.reference_time || latest || new Date().toISOString();
  const previous = readContext(input.conversation_id, recipient.id);
  const intent = resolveIntent(input.message, anchor, previous);
  const [events, baselines, history] = await Promise.all([
    getEvents(recipient.id, intent.start, intent.end, intent.activities, signal),
    getBaselines(recipient.id, intent.start, signal),
    intent.behavioral ? getEvents(recipient.id, new Date(Date.parse(intent.start) - 7 * DAY).toISOString(), intent.start, [], signal) : Promise.resolve([]),
  ]);
  const flags: string[] = [];
  let preferredIds: string[] = [];
  // Vectors rank narratives; exact relational records remain the source for every metric.
  if (usesSupabase() && process.env.GEMINI_API_KEY && await reserveBudget(signal)) {
    try {
      const queryEmbedding = await embed(input.message, AbortSignal.any([signal, AbortSignal.timeout(5000)]));
      const { data, error } = await getSupabase(signal).rpc("match_activity_embeddings", { query_embedding: queryEmbedding, match_threshold: 0.3, match_count: 4, filter_recipient_id: recipient.id });
      if (error) throw error;
      preferredIds = (data || []).filter((row: { recipient_id: string }) => row.recipient_id === recipient.id).flatMap((row: { metadata: { event_ids?: string[] } }) => row.metadata.event_ids || []).slice(0, 32);
    } catch { flags.push("SEMANTIC_SEARCH_UNAVAILABLE"); }
  }
  const plan = buildAnswerPlan(recipient, intent, events, baselines, history, preferredIds);
  if (!validatePlan(plan)) throw new Error("Grounding validation failed");
  const answer = answerFromPlan(plan);
  answer.message_id = messageId;
  answer.conversation_id = signContext(recipient.id, intent);
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
        for await (const id of provider.streamClaimIds(input.message, plan.claims, AbortSignal.any([signal, AbortSignal.timeout(12000)]))) await sendClaim(id);
        generated = true;
        if (provider !== providers[0]) answer.safety_flags.push("SECONDARY_PROVIDER_USED");
        break;
      } catch { answer.safety_flags.push("GROUNDED_FALLBACK"); }
    }
  }
  if (!generated) answer.safety_flags.push("DETERMINISTIC_RESPONSE");
  for (let i = 0; i < plan.claims.length; i++) await sendClaim(i);
  answer.answer = textParts.join("\n\n");
  answer.claims = [...sent].map(id => plan.claims[id]);
  emit("done", answer);
}
