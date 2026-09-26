import { readSSE } from "../sse";
import { GroundedClaim } from "../types";
import { SYNTHESIS_PROMPT, validateClaimStream } from "./providers/claim-stream";

const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/";
function headers() { return { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY || "" }; }
export async function embed(text: string, signal: AbortSignal, taskType = "RETRIEVAL_QUERY") {
  const model = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
  const res = await fetch(`${endpoint}${encodeURIComponent(model)}:embedContent`, { method: "POST", headers: headers(), signal,
    body: JSON.stringify({ model: `models/${model}`, content: { parts: [{ text: text.slice(0, 1600) }] }, taskType, outputDimensionality: 1536 }) });
  if (!res.ok) throw new Error(`Embedding provider status ${res.status}`);
  const data = await res.json();
  const vector: unknown = data.embedding?.values;
  if (!Array.isArray(vector) || vector.length !== 1536 || vector.some(v => typeof v !== "number" || !Number.isFinite(v))) throw new Error("Invalid embedding");
  const norm = Math.sqrt(vector.reduce((sum: number, n: number) => sum + n * n, 0));
  if (!norm) throw new Error("Empty embedding");
  return vector.map((n: number) => n / norm);
}

// The LLM streams sentence selections. Only exact, verified sentences may reach the UI.
// This is deliberately stricter than validating arbitrary numeric substrings after streaming.
export async function* streamClaimIds(message: string, claims: GroundedClaim[], signal: AbortSignal): AsyncGenerator<number> {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const res = await fetch(`${endpoint}${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: "POST", headers: headers(), signal,
    body: JSON.stringify({ systemInstruction: { parts: [{ text: SYNTHESIS_PROMPT }] }, contents: [{ role: "user", parts: [{ text: JSON.stringify({ caregiver_query: message, evidence_context: claims.map((c, i) => ({ claim_id: i, text: c.claim_text, evidence_ids: c.evidence_ids })) }) }] }], generationConfig: { temperature: 0, maxOutputTokens: 192, thinkingConfig: { thinkingBudget: 0 } } })
  });
  if (!res.ok || !res.body) throw new Error(`Generation provider status ${res.status}`);
  async function* chunks() {
    for await (const frame of readSSE(res.body!)) {
      const data = JSON.parse(frame.data);
      if (data.error) throw new Error("Generation stream failed");
      for (const part of data.candidates?.[0]?.content?.parts || []) {
        if (!part.thought && typeof part.text === "string") yield part.text as string;
      }
    }
  }
  yield* validateClaimStream(chunks(), claims.length);
}
