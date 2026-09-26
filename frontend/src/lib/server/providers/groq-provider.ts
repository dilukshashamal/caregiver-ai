import type { LLMProvider } from "./llm-provider";

export function groqGenerationOptions(model: string, tokenLimit: number) {
  return model.startsWith("openai/gpt-oss-") ? { max_completion_tokens: 1024, reasoning_effort: "low", include_reasoning: false } : { max_completion_tokens: tokenLimit };
}

export class GroqProvider implements LLMProvider {
  readonly provider_name = "groq" as const;
  get model_name() { return process.env.GROQ_MODEL || "openai/gpt-oss-20b"; }

}
