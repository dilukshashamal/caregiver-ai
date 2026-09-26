import assert from "node:assert/strict";
import { resolve } from "node:path";
import { config } from "dotenv";
import { closeDatabase } from "../src/lib/db";
import { processChat } from "../src/lib/server/chat";
import { allowedRecipients, reserveBudget } from "../src/lib/server/repository";
import { configuredProviders } from "../src/lib/server/providers/llm-provider";
import type { GroundedAnswer } from "../src/lib/types";
import { generateNarrative } from "../src/lib/server/narrative";
import { resolveIntent } from "../src/lib/server/intent";
import { buildConversationPlan } from "../src/lib/server/evidence";
import { sampleDataset } from "../src/lib/server/sample";

async function check() {
  const root = resolve(__dirname, "../..");
  for (const path of ["frontend/.env.local", "frontend/.env", ".env"]) config({ path: resolve(root, path) });
  const signal = AbortSignal.timeout(90000);
  if (process.argv.includes("--providers")) {
    for (const provider of configuredProviders()) {
      if (!process.env[`${provider.provider_name.toUpperCase()}_API_KEY`]) { console.log(`${provider.provider_name}: API key missing`); continue; }
      if (!await reserveBudget(signal, provider.provider_name)) { console.log(`${provider.provider_name}: budget unavailable`); continue; }
      try {
        const data = sampleDataset();
        const intent = resolveIntent("breakfast normal?", "2026-09-21T18:22:00.000Z");
        const plan = buildConversationPlan(data.recipients[0], intent, data.events, data.baselines, []);
        const narrative = await generateNarrative(provider, "Is his breakfast duration usual?", intent, plan, undefined, AbortSignal.any([signal, AbortSignal.timeout(12000)]));
        assert.ok(narrative.paragraphs.length);
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
  const questions: [string, RegExp][] = process.argv.includes("--breakfast") ? [
    ["is it normal breakfast pattern?", /20.*minutes/i],
    ["why this is get 20min?", /08:00.*08:20/],
    ["okay thanks", /welcome/i],
  ] : [
    ["How long did they sleep last night?", /(?:420 minutes|7 hours)/],
    ["Explain Dad's current day-to-day life, is it normal, or any unbehaviour things?", /3\.1/],
    ["what the resaon?", /cause|why|reason/i],
    ["what the reason about above behaviour?", /cause|why|reason/i],
  ];
  for (const [message, expected] of process.argv.includes("--one") ? questions.slice(0, 1) : questions) {
    let answer: GroundedAnswer | undefined;
    await processChat({ recipient_id: recipient.id, message, conversation_id: context }, recipient, (event, value) => { if (event === "done") answer = value as GroundedAnswer; }, signal);
    assert.ok(answer);
    assert.match(answer.answer, expected);
    assert.ok(answer.conversation_id);
    if (process.argv.includes("--require-llm") && !answer.safety_flags.includes("CONVERSATIONAL_RESPONSE")) {
      assert.ok(answer.safety_flags.includes("LLM_COMPOSED"), "Live LLM composition was required but unavailable or rejected.");
    }
    context = answer.conversation_id;
    console.log(JSON.stringify({ question: message, answer: answer.answer, claims: answer.claims.length, evidence: answer.evidence.length, flags: answer.safety_flags }));
  }
  console.log("Conversation smoke test passed. DETERMINISTIC_RESPONSE indicates no successful cloud synthesis on that turn.");
}
check().catch(() => {
  console.error("Conversation smoke test failed. Check database configuration, sample data, and provider availability; no credentials were logged.");
  process.exitCode = 1;
}).finally(closeDatabase);
