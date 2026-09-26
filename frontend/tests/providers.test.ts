import { test } from "node:test";
import assert from "node:assert/strict";
import { GroqProvider } from "../src/lib/server/providers/groq-provider";
import { configuredProviders } from "../src/lib/server/providers/llm-provider";
import { planQuestion } from "../src/lib/server/planner";
import { resolveIntent } from "../src/lib/server/intent";
import { generateNarrative } from "../src/lib/server/narrative";
import type { AnswerPlan } from "../src/lib/server/evidence";

const plan: AnswerPlan = { intro: "", claims: [{ claim_text: "Breakfast duration was 20 minutes; the baseline was 20 minutes.", evidence_ids: ["evidence-one"] }], evidence: [], limitations: [], coverage: "test", abstained: false };
const intent = resolveIntent("breakfast normal?", "2026-09-21T18:22:00.000Z");
const prose = { paragraphs: [{ text: "The recorded breakfast duration matches his usual 20 minutes.", fact_ids: [0] }] };
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
      const provider = { provider_name, model_name: "test-model" };
      const result = await planQuestion(provider, "Give me a picture of his routine", intent, memory, AbortSignal.timeout(1000));
      assert.equal(result.task, "overview"); assert.deepEqual(result.activities, []);
    }
    global.fetch = async () => new Response("private upstream error", { status: 429 });
    await assert.rejects(planQuestion(new GroqProvider(), "routine", intent, memory, AbortSignal.timeout(1000)), /^Error: Question planning unavailable$/);
  } finally { global.fetch = original; }
});
test("Gemini and Groq compose new wording with the question, memory and computed facts", async () => {
  const original = global.fetch;
  const memory = { intent, turns: [{ question: "breakfast?", answer: "20 recorded minutes" }] };
  try {
    for (const provider_name of ["gemini", "groq"] as const) {
      global.fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        const input = JSON.parse(provider_name === "groq" ? body.messages[1].content : body.contents[0].parts[0].text);
        assert.deepEqual(input.recent_conversation, memory.turns);
        assert.equal(input.question, "Is that normal?");
        assert.equal(input.facts[0].text, plan.claims[0].claim_text);
        assert.ok(!("resolved_scope" in input) && !("coverage" in input), "Retrieval boundaries must not be presented as observed start/end times");
        const content = JSON.stringify(prose);
        return Response.json(provider_name === "groq" ? { choices: [{ finish_reason: "stop", message: { content } }] } : { candidates: [{ finishReason: "STOP", content: { parts: [{ text: content }] } }] });
      };
      const result = await generateNarrative({ provider_name, model_name: "test" }, "Is that normal?", intent, plan, memory, AbortSignal.timeout(1000));
      assert.deepEqual(result, prose);
      assert.notEqual(result.paragraphs[0].text, plan.claims[0].claim_text);
    }
  } finally { global.fetch = original; }
});
test("generation rejects truncated output, invented citations and sanitized provider errors", async () => {
  const original = global.fetch;
  const consume = () => generateNarrative(new GroqProvider(), "normal?", intent, plan, undefined, AbortSignal.timeout(1000));
  try {
    global.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ paragraphs: [{ text: "Breakfast was recorded.", fact_ids: [8] }] }) } }] });
    await assert.rejects(consume(), /citation/);
    global.fetch = async () => new Response("secret-provider-message", { status: 429 });
    await assert.rejects(consume(), /^Error: Generation provider status 429$/);
    global.fetch = async () => Response.json({ choices: [{ finish_reason: "length", message: { content: JSON.stringify(prose) } }] });
    await assert.rejects(consume(), /Incomplete narrative/);
  } finally { global.fetch = original; }
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
