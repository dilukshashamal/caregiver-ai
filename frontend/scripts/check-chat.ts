import assert from "node:assert/strict";
import { resolve } from "node:path";
import { config } from "dotenv";
import { closeDatabase } from "../src/lib/db";
import { processChat } from "../src/lib/server/chat";
import { allowedRecipients, reserveBudget } from "../src/lib/server/repository";
import { configuredProviders } from "../src/lib/server/providers/llm-provider";
import type { GroundedAnswer } from "../src/lib/types";

async function check() {
  const root = resolve(__dirname, "../..");
  for (const path of ["frontend/.env.local", "frontend/.env", ".env"]) config({ path: resolve(root, path) });
  const signal = AbortSignal.timeout(90000);
  if (process.argv.includes("--providers")) {
    for (const provider of configuredProviders()) {
      if (!process.env[`${provider.provider_name.toUpperCase()}_API_KEY`]) { console.log(`${provider.provider_name}: API key missing`); continue; }
      if (!await reserveBudget(signal, provider.provider_name)) { console.log(`${provider.provider_name}: budget unavailable`); continue; }
      try {
        const ids = [];
        for await (const id of provider.streamClaimIds("How long was recorded sleep?", [{ claim_text: "Recorded sleep totaled 7 hours.", evidence_ids: ["synthetic-check"] }], AbortSignal.any([signal, AbortSignal.timeout(12000)]))) ids.push(id);
        assert.deepEqual(ids, [0]);
        console.log(`${provider.provider_name}: live synthesis passed`);
      } catch (error) {
        const message = error instanceof Error && /^(Generation provider status \d{3}|Empty model response|Ungrounded model selection|Oversized model response|Generation stream failed)$/.test(error.message) ? error.message : "transport, timeout, or invalid JSON response";
        console.log(`${provider.provider_name}: ${message}`);
      }
    }
    return;
  }
  const recipient = (await allowedRecipients(new Request("http://localhost/api/recipients"), signal)).find(r => r.id === "dad-demo");
  assert.ok(recipient?.is_demo && recipient.metadata.synthetic, "Only the synthetic Dad profile can be smoke-tested.");
  let context: string | undefined;
  for (const [message, expected] of [
    ["How long did they sleep last night?", /420 minutes/],
    ["Explain Dad's current day-to-day life, is it normal, or any unbehaviour things?", /3\.1×/],
    ["what the resaon?", /do not establish a cause/],
    ["what the reason about above behaviour?", /routine or surroundings/],
  ] as const) {
    let answer: GroundedAnswer | undefined;
    await processChat({ recipient_id: recipient.id, message, conversation_id: context }, recipient, (event, value) => { if (event === "done") answer = value as GroundedAnswer; }, signal);
    assert.ok(answer);
    assert.match(answer.answer, expected);
    assert.ok(answer.conversation_id);
    context = answer.conversation_id;
    console.log(JSON.stringify({ question: message, claims: answer.claims.length, evidence: answer.evidence.length, flags: answer.safety_flags }));
  }
  console.log("Conversation smoke test passed. DETERMINISTIC_RESPONSE indicates no successful cloud synthesis on that turn.");
}
check().catch(() => {
  console.error("Conversation smoke test failed. Check database configuration, sample data, and provider availability; no credentials were logged.");
  process.exitCode = 1;
}).finally(closeDatabase);
