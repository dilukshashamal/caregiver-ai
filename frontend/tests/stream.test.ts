import { test } from "node:test";
import assert from "node:assert/strict";
import { readSSE } from "../src/lib/sse";
import { embed, streamClaimIds } from "../src/lib/server/gemini";

function bytes(text: string, stride = 1) {
  const encoded = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({ start(c) { for (let i = 0; i < encoded.length; i += stride) c.enqueue(encoded.slice(i, i + stride)); c.close(); } });
}
test("SSE preserves split UTF-8, CRLF and data lines", async () => {
  const result = [];
  for await (const frame of readSSE(bytes(': hello\r\nevent: delta\r\ndata: {"text":"3.1×"}\r\n\r\nevent: done\ndata: line1\ndata: line2\n\n'))) result.push(frame);
  assert.deepEqual(result, [{ event: "delta", data: '{"text":"3.1×"}' }, { event: "done", data: "line1\nline2" }]);
});
test("SSE drops incomplete frames", async () => {
  const result = [];
  for await (const frame of readSSE(bytes('event: done\ndata: {}'))) result.push(frame);
  assert.equal(result.length, 0);
});
test("Gemini returns only verified selections and rejects an invented claim", async () => {
  const original = global.fetch;
  const frame = (text: string) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`;
  try {
    global.fetch = async () => new Response(bytes(frame('{"claim_id":') + frame('0}\n{"claim_id":9}\n')));
    const received: number[] = [];
    await assert.rejects(async () => { for await (const id of streamClaimIds("test", [{ claim_text: "Recorded pacing.", evidence_ids: ["id"] }], AbortSignal.timeout(1000))) received.push(id); }, /Ungrounded/);
    assert.deepEqual(received, [0]);
  } finally { global.fetch = original; }
});
test("1536-dimensional Gemini vectors are normalized; malformed vectors fail", async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => Response.json({ embedding: { values: new Array(1536).fill(1) } });
    const values = await embed("test", AbortSignal.timeout(1000));
    assert.ok(Math.abs(values.reduce((s, v) => s + v * v, 0) - 1) < 1e-10);
    global.fetch = async () => Response.json({ embedding: { values: [1, 2] } });
    await assert.rejects(embed("test", AbortSignal.timeout(1000)), /Invalid embedding/);
  } finally { global.fetch = original; }
});
