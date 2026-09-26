import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../src/app/api/recipients/route";
import { POST } from "../src/app/api/chat/route";
import { readSSE } from "../src/lib/sse";
import { GroundedAnswer } from "../src/lib/types";
import { sampleDataset } from "../src/lib/server/sample";

process.env.DATA_SOURCE = "demo";
process.env.DEMO_MODE = "true";
process.env.LLM_PROVIDER = "gemini";
process.env.LLM_FALLBACK_PROVIDER = "none";
const request = (body: unknown) => new Request("http://localhost/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("route streams incremental text, complete evidence, and signed follow-up context", async () => {
  const profiles = await GET(new Request("http://localhost/api/recipients"));
  assert.equal(profiles.status, 200); assert.equal((await profiles.json()).length, 2);
  const response = await POST(request({ recipient_id: "dad-demo", message: "Is Dad becoming agitated?" }));
  assert.match(response.headers.get("content-type") || "", /text\/event-stream/);
  let text = "", deltas = 0, answer: GroundedAnswer | undefined;
  for await (const event of readSSE(response.body!)) {
    const data = JSON.parse(event.data);
    if (event.event === "delta") { text += data.text; deltas++; }
    if (event.event === "done") answer = data;
    assert.notEqual(event.event, "error");
  }
  assert.ok(answer); assert.equal(text, answer.answer); assert.ok(deltas > 10);
  assert.match(answer.answer, /3\.1×/); assert.match(answer.answer, /2 previous sample episodes/);
  assert.ok(answer.conversation_id);
  for (const claim of answer.claims) for (const id of claim.evidence_ids) assert.ok(answer.evidence.some(e => e.evidence_id === id));
});

test("routes reject malformed, oversized and unauthorized requests before retrieval", async () => {
  assert.equal((await POST(request({ recipient_id: "not-mine", message: "sleep" }))).status, 403);
  assert.equal((await POST(request({ recipient_id: "dad-demo", message: "a".repeat(1001) }))).status, 400);
  assert.equal((await POST(request({ recipient_id: "dad-demo", message: "a".repeat(9000) }))).status, 413);
  assert.equal((await POST(request({ recipient_id: "dad-demo", care_recipient_id: "mum-demo", message: "sleep" }))).status, 400);
  assert.equal((await POST(new Request("http://localhost/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: "bad" }))).status, 400);
});

test("medical requests do not invoke Gemini or claim supporting evidence", async () => {
  const emitted: { event: string; payload: unknown }[] = [];
  await (await import("../src/lib/server/chat")).processChat({ recipient_id: "dad-demo", message: "Does he have dementia?" }, sampleDataset().recipients[0], (event, payload) => emitted.push({ event, payload }), AbortSignal.timeout(2000));
  const answer = emitted.find(e => e.event === "done")!.payload as GroundedAnswer;
  assert.equal(answer.abstained, true); assert.deepEqual(answer.evidence, []); assert.ok(answer.safety_flags.includes("UNSUPPORTED_MEDICAL_REDIRECT"));
});

test("database mode fails clearly when the direct connection is not configured", async () => {
  const originalSource = process.env.DATA_SOURCE, originalUrl = process.env.DATABASE_URL;
  process.env.DATA_SOURCE = "database"; delete process.env.DATABASE_URL;
  try { assert.equal((await GET(new Request("http://localhost/api/recipients"))).status, 503); }
  finally { process.env.DATA_SOURCE = originalSource; if (originalUrl) process.env.DATABASE_URL = originalUrl; else delete process.env.DATABASE_URL; }
});
