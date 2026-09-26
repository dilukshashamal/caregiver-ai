import { readSSE } from "../../sse";
import { GroundedClaim } from "../../types";
import { SYNTHESIS_PROMPT, validateClaimStream } from "./claim-stream";
import type { LLMProvider } from "./llm-provider";

export function groqGenerationOptions(model: string, tokenLimit: number) {
  return model.startsWith("openai/gpt-oss-") ? { max_completion_tokens: 1024, reasoning_effort: "low", include_reasoning: false } : { max_completion_tokens: tokenLimit };
}

export class GroqProvider implements LLMProvider {
  readonly provider_name = "groq" as const;
  get model_name() { return process.env.GROQ_MODEL || "openai/gpt-oss-20b"; }

  async *streamClaimIds(message: string, claims: GroundedClaim[], signal: AbortSignal): AsyncGenerator<number> {
    if (!process.env.GROQ_API_KEY) throw new Error("Groq is not configured");
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: this.model_name, stream: true, temperature: 0, ...groqGenerationOptions(this.model_name, 192),
        messages: [
          { role: "system", content: SYNTHESIS_PROMPT },
          { role: "user", content: JSON.stringify({ caregiver_query: message, evidence_context: claims.map((claim, claim_id) => ({ claim_id, text: claim.claim_text, evidence_ids: claim.evidence_ids })) }) },
        ] }),
    });
    if (!response.ok || !response.body) throw new Error(`Generation provider status ${response.status}`);
    async function* chunks() {
      for await (const frame of readSSE(response.body!)) {
        if (frame.data === "[DONE]") return;
        const data = JSON.parse(frame.data);
        if (data.error) throw new Error("Generation stream failed");
        const text = data.choices?.[0]?.delta?.content;
        if (typeof text === "string") yield text;
      }
    }
    yield* validateClaimStream(chunks(), claims.length);
  }
}
