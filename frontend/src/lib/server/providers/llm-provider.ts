import { GroqProvider } from "./groq-provider";

export type ProviderName = "gemini" | "groq";
// TypeScript counterpart of the reference's vendor-independent LLMProvider abstraction.
export interface LLMProvider {
  readonly provider_name: ProviderName;
  readonly model_name: string;
}
export class GeminiProvider implements LLMProvider {
  readonly provider_name = "gemini" as const;
  get model_name() { return process.env.GEMINI_MODEL || "gemini-2.5-flash-lite"; }
}
function makeProvider(name: string): LLMProvider {
  if (name === "gemini") return new GeminiProvider();
  if (name === "groq") return new GroqProvider();
  throw new Error("LLM_PROVIDER must be gemini or groq");
}
export function configuredProviders(): LLMProvider[] {
  const primary = makeProvider(process.env.LLM_PROVIDER || "gemini");
  const fallback = process.env.LLM_FALLBACK_PROVIDER;
  if (!fallback || fallback === "none" || fallback === primary.provider_name) return [primary];
  return [primary, makeProvider(fallback)];
}
