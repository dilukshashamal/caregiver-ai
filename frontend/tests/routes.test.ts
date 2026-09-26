import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../src/app/api/recipients/route";
import { POST } from "../src/app/api/chat/route";
import { readSSE } from "../src/lib/sse";
import { GroundedAnswer } from "../src/lib/types";
import { allowedRecipients } from "../src/lib/server/repository";
import { processChat } from "../src/lib/server/chat";
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
  await processChat({ recipient_id: "dad-demo", message: "Does he have dementia?" }, sampleDataset().recipients[0], (event, payload) => emitted.push({ event, payload }), AbortSignal.timeout(2000));
  const answer = emitted.find(e => e.event === "done")!.payload as GroundedAnswer;
  assert.equal(answer.abstained, true); assert.deepEqual(answer.evidence, []); assert.ok(answer.safety_flags.includes("UNSUPPORTED_MEDICAL_REDIRECT"));
});
test("Supabase private mode requires a verified token and filters memberships", async () => {
  const original = global.fetch;
  process.env.DATA_SOURCE = "supabase"; process.env.DEMO_MODE = "false";
  process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  try {
    await assert.rejects(allowedRecipients(new Request("http://localhost/api/recipients"), AbortSignal.timeout(1000)), /Sign in/);
    const urls: string[] = [];
    global.fetch = async input => {
      const url = String(input); urls.push(url);
      if (url.includes("/auth/v1/user")) return Response.json({ id: "user-one", aud: "authenticated", role: "authenticated", email: "test@example.com" });
      if (url.includes("recipient_access")) return Response.json([{ recipient_id: "authorized-person" }]);
      return Response.json([{ id: "authorized-person", name: "Authorized person", timezone: "UTC", is_demo: false, metadata: {} }]);
    };
    const recipients = await allowedRecipients(new Request("http://localhost/api/recipients", { headers: { Authorization: "Bearer valid-token" } }), AbortSignal.timeout(2000));
    assert.equal(recipients[0].id, "authorized-person");
    assert.ok(urls.some(url => url.includes("user_id=eq.user-one")));
    assert.ok(urls.some(url => decodeURIComponent(url).includes("id=in.(authorized-person)")));
  } finally { global.fetch = original; process.env.DATA_SOURCE = "demo"; process.env.DEMO_MODE = "true"; delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; }
});

test("provider 429 errors preserve a complete grounded answer without leaking provider details", async () => {
  const original = global.fetch;
  const sample = sampleDataset();
  process.env.DATA_SOURCE = "supabase"; process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  try {
    global.fetch = async input => {
      const url = new URL(String(input));
      if (url.hostname === "generativelanguage.googleapis.com") return Response.json({ error: "sensitive-provider-detail" }, { status: 429 });
      if (url.pathname.endsWith("/rpc/reserve_gemini_budget")) return Response.json(true);
      if (url.pathname.endsWith("/baselines")) return Response.json(sample.baselines.filter(b => b.recipient_id === "dad-demo"));
      if (url.searchParams.get("select") === "end_time") return Response.json([{ end_time: "2026-09-21T18:22:00.000Z" }]);
      const start = (url.searchParams.get("end_time") || "gt.0000").slice(3);
      const end = (url.searchParams.get("start_time") || "lt.9999").slice(3);
      return Response.json(sample.events.filter(e => e.recipient_id === "dad-demo" && e.end_time > start && e.start_time < end));
    };
    let final: GroundedAnswer | undefined;
    await processChat({ recipient_id: "dad-demo", message: "Is Dad agitated?" }, sample.recipients[0], (event, payload) => { if (event === "done") final = payload as GroundedAnswer; }, AbortSignal.timeout(4000));
    assert.ok(final); assert.match(final.answer, /3\.1×/);
    assert.ok(final.safety_flags.includes("SEMANTIC_SEARCH_UNAVAILABLE"));
    assert.ok(final.safety_flags.includes("GROUNDED_FALLBACK"));
    assert.doesNotMatch(JSON.stringify(final), /sensitive-provider-detail|test-gemini-key|test-key/);
  } finally { global.fetch = original; process.env.DATA_SOURCE = "demo"; delete process.env.GEMINI_API_KEY; delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; }
});

test("Groq-only chat uses an independent budget without any Gemini request", async () => {
  const original = global.fetch, sample = sampleDataset();
  process.env.DATA_SOURCE = "supabase"; process.env.LLM_PROVIDER = "groq";
  process.env.GROQ_API_KEY = "mock-groq-key"; delete process.env.GEMINI_API_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  try {
    for (const permitted of [true, false]) {
      let providerCalls = 0, final: GroundedAnswer | undefined;
      global.fetch = async (input, init) => {
        const url = new URL(String(input));
        assert.notEqual(url.hostname, "generativelanguage.googleapis.com");
        if (url.hostname === "api.groq.com") {
          providerCalls++;
          return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: '{"claim_id":0}\n' } }] })}\n\ndata: [DONE]\n\n`);
        }
        if (url.pathname.endsWith("/rpc/reserve_provider_budget")) {
          assert.equal(JSON.parse(String(init?.body)).provider_name, "groq");
          return Response.json(permitted);
        }
        if (url.pathname.endsWith("/baselines")) return Response.json(sample.baselines.filter(b => b.recipient_id === "dad-demo"));
        if (url.searchParams.get("select") === "end_time") return Response.json([{ end_time: "2026-09-21T18:22:00.000Z" }]);
        const start = (url.searchParams.get("end_time") || "gt.0000").slice(3), end = (url.searchParams.get("start_time") || "lt.9999").slice(3);
        return Response.json(sample.events.filter(e => e.recipient_id === "dad-demo" && e.end_time > start && e.start_time < end));
      };
      await processChat({ recipient_id: "dad-demo", message: "Is Dad agitated?" }, sample.recipients[0], (event, payload) => { if (event === "done") final = payload as GroundedAnswer; }, AbortSignal.timeout(4000));
      assert.ok(final); assert.match(final.answer, /3\.1×/);
      assert.equal(providerCalls, permitted ? 1 : 0);
      assert.equal(final.safety_flags.includes("DETERMINISTIC_RESPONSE"), !permitted);
    }
  } finally { global.fetch = original; process.env.DATA_SOURCE = "demo"; process.env.LLM_PROVIDER = "gemini"; delete process.env.GROQ_API_KEY; delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; }
});
