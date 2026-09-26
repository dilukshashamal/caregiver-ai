import { test } from "node:test";
import assert from "node:assert/strict";
import { narrativeClaims, validateNarrative } from "../src/lib/server/narrative";
import { buildConversationPlan } from "../src/lib/server/evidence";
import { resolveIntent } from "../src/lib/server/intent";
import { sampleDataset } from "../src/lib/server/sample";

const data = sampleDataset();
const intent = resolveIntent("is it normal breakfast pattern?", "2026-09-21T18:22:00.000Z");
const plan = buildConversationPlan(data.recipients[0], intent, data.events, data.baselines, []);
const reply = (text: string, fact_ids = [0]) => ({ paragraphs: [{ text, fact_ids }] });

test("natural paraphrases preserve citations without requiring verbatim fact sentences", () => {
  const result = validateNarrative(reply("His recorded breakfast duration matches his usual 20 minutes. The record doesn’t say how much he ate."), plan);
  const claims = narrativeClaims(result, plan);
  assert.deepEqual(claims[0].evidence_ids, plan.claims[0].evidence_ids);
  assert.notEqual(claims[0].claim_text, plan.claims[0].claim_text);
});

test("generated invented values, citations, unsafe assurances and actions fail closed", () => {
  for (const invalid of [reply("Breakfast lasted 90 minutes."), reply("Breakfast lasted 20 hours."), reply("Breakfast lasted ninety minutes."), reply("Breakfast happened.", [999]), reply("Breakfast happened.", []), reply("There is nothing to worry about."), reply("Dad has dementia."), reply("Give his medication."), reply("I'll monitor Dad."), reply("See https://untrusted.example"), { paragraphs: [], extra: true }]) {
    assert.throws(() => validateNarrative(invalid, plan), JSON.stringify(invalid));
  }
});

test("calculation citations support actual clock endpoints and elapsed minutes", () => {
  const follow = resolveIntent("why this is get 20min?", intent.end, intent);
  const calculation = buildConversationPlan(data.recipients[0], follow, data.events, data.baselines, []);
  assert.doesNotThrow(() => validateNarrative(reply("The breakfast record runs from 08:00 to 08:20 UTC, so the elapsed time is 20 minutes."), calculation));
  assert.throws(() => validateNarrative(reply("Breakfast ran from 08:00 to 09:30, so it lasted 90 minutes."), calculation));
});

test("valid duration qualifiers and written counts are accepted; reassurance is not inferred", () => {
  const behavior = resolveIntent("Is Dad agitated?", "2026-09-21T18:22:00.000Z");
  const facts = buildConversationPlan(data.recipients[0], behavior, data.events, data.baselines, data.events);
  assert.doesNotThrow(() => validateNarrative(reply("Over the last 22 minutes, recorded pacing was 12.4 minutes, or 3.1 times the matched baseline.", [0]), facts));
  const prior = facts.claims.findIndex(c => c.claim_text.includes("previous sample episodes"));
  assert.doesNotThrow(() => validateNarrative(reply("Similar changes occurred in two previous episodes.", [prior]), facts));
  for (const text of ["These patterns do not indicate a crisis.", "Seated activity shows a return to a calmer state.", "This is a recurring but not abnormal trend."]) assert.throws(() => validateNarrative(reply(text, [prior]), facts));
});

test("different baseline and observed values cannot be described as matching", () => {
  const sleep = resolveIntent("was sleep normal last night?", "2026-09-21T18:22:00.000Z");
  const facts = buildConversationPlan(data.recipients[0], sleep, data.events, data.baselines, []);
  assert.throws(() => validateNarrative(reply("The 420 minutes of sleep matches the baseline of 436.07 minutes."), facts), /comparison/);
  assert.doesNotThrow(() => validateNarrative(reply("Recorded sleep was 420 minutes, below the baseline of 436.07 minutes."), facts));
});
