import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { closeDatabase } from "../src/lib/db";
import { processChat } from "../src/lib/server/chat";
import { sampleDataset } from "../src/lib/server/sample";
import type { GroundedAnswer } from "../src/lib/types";

const dataset = sampleDataset();
async function withDatabase(run: () => Promise<void>) {
  const keys = ["DATA_SOURCE", "DATABASE_URL", "GROQ_API_KEY", "GEMINI_API_KEY", "LLM_PROVIDER", "LLM_FALLBACK_PROVIDER"];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  const originalFetch = global.fetch;
  Object.assign(process.env, { DATA_SOURCE: "database", DATABASE_URL: "postgresql://mock:mock@localhost/mock", GROQ_API_KEY: "mock", LLM_PROVIDER: "groq", LLM_FALLBACK_PROVIDER: "none" });
  delete process.env.GEMINI_API_KEY;
  const database = mock.method(Pool.prototype, "query", async (config: { text: string; values: unknown[] }) => {
    const { text, values } = config;
    if (text.includes("reserve_provider_budget")) return { rows: [{ permitted: true }] };
    if (text.includes("select end_time")) return { rows: [{ end_time: new Date("2026-09-21T18:22:00.000Z") }] };
    if (text.includes("public.events")) {
      const [recipient, end, start] = values as string[];
      const activities = Array.isArray(values[3]) ? values[3] as string[] : [];
      return { rows: dataset.events.filter(e => e.recipient_id === recipient && e.start_time < end && e.end_time > start && (!activities.length || activities.includes(e.activity))) };
    }
    if (text.includes("public.baselines")) return { rows: dataset.baselines.filter(b => b.recipient_id === values[0] && b.window_end < String(values[1])).map(b => ({ ...b, window_start: new Date(b.window_start), window_end: new Date(b.window_end) })) };
    throw new Error("Unexpected database query in test");
  });
  try { await run(); }
  finally {
    database.mock.restore(); global.fetch = originalFetch; await closeDatabase();
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}

async function ask(message: string, conversation_id?: string) {
  let answer: GroundedAnswer | undefined;
  let stream = "";
  await processChat({ recipient_id: "dad-demo", message, conversation_id }, dataset.recipients[0], (event, value) => {
    if (event === "done") answer = value as GroundedAnswer;
    if (event === "delta") stream += (value as { text: string }).text;
  }, AbortSignal.timeout(5000));
  assert.ok(answer); assert.equal(answer.answer, stream);
  return answer;
}
const output = (text: string) => JSON.stringify({ paragraphs: [{ text, fact_ids: [0] }] });
function plannerReply(input: { rule_based_scope?: { task: string; activities: string[] } }) {
  if (!input.rule_based_scope) return undefined;
  return Response.json({ choices: [{ message: { content: JSON.stringify({ task: input.rule_based_scope.task, activities: input.rule_based_scope.activities, comparison: true, period: "keep" }) } }] });
}

test("assistant introduction still works when budget storage is unavailable", async () => withDatabase(async () => {
  const database = mock.method(Pool.prototype, "query", () => { throw new Error("Introduction must not query records"); });
  const cloud = mock.method(global, "fetch", async () => { throw new Error("Introduction must not call a model"); });
  try {
    const answer = await ask("what is NAAI?");
    assert.equal(answer.abstained, false);
    assert.match(answer.answer, /NAAI is GENNAAI/);
    assert.ok(database.mock.calls.every(call => (call.arguments[0] as unknown as { text: string }).text.includes("reserve_provider_budget")));
    assert.equal(cloud.mock.callCount(), 0);
  } finally { database.mock.restore(); cloud.mock.restore(); }
}));

test("orchestrator interprets and writes breakfast, calculation, and thanks with the model", async () => withDatabase(async () => {
  let calls = 0;
  global.fetch = async (_url, init) => {
    const input = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
    const planned = plannerReply(input); if (planned) return planned;
    calls++;
    if (calls === 2) assert.equal(input.recent_conversation.at(-1).question, "is it normal breakfast pattern?");
    const text = input.question.includes("thanks") ? "You’re welcome. I’m here if you need help." : input.question.includes("20min") ? "The breakfast record runs from 08:00 to 08:20 UTC, giving 20 minutes." : "His recorded breakfast duration matches his usual 20 minutes. A longer record would help assess the broader pattern.";
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: output(text) } }] });
  };
  const first = await ask("is it normal breakfast pattern?");
  assert.ok(first.safety_flags.includes("LLM_COMPOSED"));
  assert.doesNotMatch(first.answer, /Here is what|1 breakfast event/);
  assert.equal(first.evidence.length, 2);
  const second = await ask("why this is get 20min?", first.conversation_id);
  assert.match(second.answer, /08:00 to 08:20/);
  assert.equal(second.evidence.length, 1);
  const thanks = await ask("okay thanks", second.conversation_id);
  assert.equal(calls, 3); assert.equal(thanks.abstained, false);
  assert.match(thanks.answer, /welcome/);
  assert.ok(thanks.safety_flags.includes("LLM_COMPOSED"));
}));

test("LLM routes a contextual label paraphrase and composes a definition without activity retrieval", async () => withDatabase(async () => {
  const { signContext } = await import("../src/lib/server/session");
  const { resolveIntent } = await import("../src/lib/server/intent");
  const context = signContext("dad-demo", resolveIntent("daily overview", "2026-09-21T18:22:00.000Z"), [{ question: "daily overview", answer: "The timeline includes an environmental observation." }]);
  const originalQuery = Pool.prototype.query;
  const database = mock.method(Pool.prototype, "query", function (this: Pool, ...args: unknown[]) {
    assert.ok((args[0] as { text: string }).text.includes("reserve_provider_budget"), "A definition must not retrieve activity records");
    return Reflect.apply(originalQuery, this, args);
  });
  let calls = 0;
  global.fetch = async (_url, init) => {
    calls++;
    const input = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
    if (input.rule_based_scope) {
      assert.match(input.previous.turns[0].answer, /environmental/);
      return Response.json({ choices: [{ message: { content: JSON.stringify({ task: "conversation", activities: [], period: "keep", comparison: false }) } }] });
    }
    assert.match(input.recent_conversation[0].answer, /environmental/);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ paragraphs: [{ text: "That label refers to a record of the surroundings, such as temperature or light, rather than something your loved one did. Its duration is the observation interval.", fact_ids: [1] }] }) } }] });
  };
  try {
    const answer = await ask("Could you unpack that observation label for me?", context);
    assert.equal(calls, 2);
    assert.ok(answer.safety_flags.includes("MODEL_PLANNED"));
    assert.ok(answer.safety_flags.includes("LLM_COMPOSED"));
    assert.match(answer.answer, /surroundings/);
    assert.deepEqual(answer.evidence, []);
    assert.doesNotMatch(answer.answer, /sleeping|Synthetic/);
  } finally { database.mock.restore(); }
}));

test("invalid generated prose never leaks into SSE and failure uses computed evidence", async () => withDatabase(async () => {
  global.fetch = async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: output("Breakfast took 99 hours. There is nothing to worry about.") } }] });
  const answer = await ask("breakfast normal?");
  assert.ok(answer.safety_flags.includes("DETERMINISTIC_RESPONSE"));
  assert.doesNotMatch(answer.answer, /99 hours|nothing to worry/);
  assert.match(answer.answer, /20 minutes/);
}));

test("provider failure switches to configured fallback without exposing upstream detail", async () => withDatabase(async () => {
  process.env.LLM_FALLBACK_PROVIDER = "gemini"; process.env.GEMINI_API_KEY = "mock";
  global.fetch = async url => String(url).includes("api.groq.com") ? new Response("private upstream detail", { status: 429 }) : Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: output("The recorded breakfast duration matches his usual 20 minutes.") }] } }] });
  const answer = await ask("breakfast normal?");
  assert.ok(answer.safety_flags.includes("GROQ_STATUS_429"));
  assert.ok(answer.safety_flags.includes("SECONDARY_PROVIDER_USED"));
  assert.ok(answer.safety_flags.includes("LLM_COMPOSED"));
  assert.doesNotMatch(answer.answer, /private upstream/);
}));

test("one budgeted repair can correct a rejected draft before any prose is emitted", async () => withDatabase(async () => {
  let calls = 0;
  global.fetch = async (_url, init) => {
    const input = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
    const planned = plannerReply(input); if (planned) return planned;
    calls++;
    if (calls === 2) { assert.equal(input.validation_error, "Unsupported narrative number"); assert.ok(input.rejected_draft); }
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: output(calls === 1 ? "Breakfast lasted 99 minutes." : "The recorded breakfast duration matches his usual 20 minutes.") } }] });
  };
  const answer = await ask("breakfast normal?");
  assert.equal(calls, 2); assert.ok(answer.safety_flags.includes("NARRATIVE_REPAIRED"));
  assert.ok(answer.safety_flags.includes("LLM_COMPOSED"));
  assert.doesNotMatch(answer.answer, /99/);
}));
