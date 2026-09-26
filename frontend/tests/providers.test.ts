import { test } from "node:test";
import assert from "node:assert/strict";
import { GroqProvider } from "../src/lib/server/providers/groq-provider";
import { configuredProviders } from "../src/lib/server/providers/llm-provider";
import { planQuestion } from "../src/lib/server/planner";
import { resolveIntent } from "../src/lib/server/intent";

const claims = [{ claim_text: "Recorded pacing.", evidence_ids: ["evidence-one"] }];
const frame = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
test("both planner transports receive bounded memory and validate structured scope", async () => {
  const original = global.fetch;
  const intent = resolveIntent("sleep last night", "2026-09-21T18:22:00.000Z");
  const memory = { intent, turns: [{ question: "sleep last night", answer: "7 recorded hours" }] };
  const content = JSON.stringify({ task: "overview", activities: [], period: "day", comparison: true });
  try {
    for (const provider_name of ["gemini", "groq"] as const) {
      global.fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        const request = provider_name === "groq" ? JSON.parse(body.messages[1].content) : JSON.parse(body.contents[0].parts[0].text);
        assert.deepEqual(request.previous, memory);
        assert.equal(request.question, "Give me a picture of his routine");
        return Response.json(provider_name === "groq" ? { choices: [{ message: { content } }] } : { candidates: [{ content: { parts: [{ text: content }] } }] });
      };
      const provider = { provider_name, model_name: "test-model", async *streamClaimIds() { yield 0; } };
      const result = await planQuestion(provider, "Give me a picture of his routine", intent, memory, AbortSignal.timeout(1000));
      assert.equal(result.task, "overview"); assert.deepEqual(result.activities, []);
    }
    global.fetch = async () => new Response("private upstream error", { status: 429 });
    await assert.rejects(planQuestion(new GroqProvider(), "routine", intent, memory, AbortSignal.timeout(1000)), /^Error: Question planning unavailable$/);
  } finally { global.fetch = original; }
});
test("Groq streams split claim IDs, deduplicates, and uses the original model setting", async () => {
  const original = global.fetch;
  process.env.GROQ_API_KEY = "mock-key";
  process.env.GROQ_MODEL = "llama-3.3-70b-versatile";
  try {
    global.fetch = async (url, init) => {
      assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "llama-3.3-70b-versatile");
      assert.equal(body.stream, true); assert.equal(body.max_completion_tokens, 192);
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer mock-key");
      return new Response(frame('{"claim_') + frame('id":0}\n{"claim_id":0}\n') + "data: [DONE]\n\n");
    };
    const ids = [];
    for await (const id of new GroqProvider().streamClaimIds("pacing?", claims, AbortSignal.timeout(1000))) ids.push(id);
    assert.deepEqual(ids, [0]);
  } finally { global.fetch = original; delete process.env.GROQ_API_KEY; delete process.env.GROQ_MODEL; }
});
test("Groq rejects invented claims and 429 without exposing upstream detail", async () => {
  const original = global.fetch;
  process.env.GROQ_API_KEY = "mock-key";
  const consume = async () => { for await (const id of new GroqProvider().streamClaimIds("question", claims, AbortSignal.timeout(1000))) void id; };
  try {
    global.fetch = async () => new Response(frame('{"claim_id":8}\n'));
    await assert.rejects(consume(), /Ungrounded/);
    global.fetch = async () => new Response("secret-provider-message", { status: 429 });
    await assert.rejects(consume(), /^Error: Generation provider status 429$/);
    global.fetch = async () => new Response("data: [DONE]\n\n");
    await assert.rejects(consume(), /Empty model response/);
  } finally { global.fetch = original; delete process.env.GROQ_API_KEY; }
});
test("provider factory preserves selection and makes cross-provider fallback explicit", () => {
  try {
    process.env.LLM_PROVIDER = "groq"; process.env.LLM_FALLBACK_PROVIDER = "gemini";
    assert.deepEqual(configuredProviders().map(p => p.provider_name), ["groq", "gemini"]);
    process.env.LLM_FALLBACK_PROVIDER = "none";
    assert.deepEqual(configuredProviders().map(p => p.provider_name), ["groq"]);
    process.env.LLM_PROVIDER = "invalid";
    assert.throws(configuredProviders, /LLM_PROVIDER/);
  } finally { delete process.env.LLM_PROVIDER; delete process.env.LLM_FALLBACK_PROVIDER; }
});
