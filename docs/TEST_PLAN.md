# Verification

Run from `frontend/`:

```sh
npm ci
npm run lint
npm test
npm run seed:dry
npm run build
```

Automated coverage includes baseline calculations, ingestion, synthetic 3.1× comparisons, matching-window requirements, recipient isolation, citation IDs, safety, bounded signed memory, expiry/tampering, the reported sleep → overview → reason conversation, restricted model plans and both planner transports, malformed HTTP inputs, streamed completion, byte-split UTF-8 SSE decoding, invalid model selections, and normalized embeddings.

Browser checks: submit the Dad agitation question; watch partial response updates; open related activities and verify baseline/citation timestamps; close via Escape; switch to Mum and verify chat reset and 1× pacing; submit a medical question and verify deflection; inspect a narrow viewport for horizontal overflow.

Cloud checks require real credentials: apply `supabase/schema.sql`, run the seed, rerun to confirm idempotence, inspect vector dimensions/RPC recipient filtering, verify anonymous table/RPC calls fail, and test provider budget exhaustion. Without credentials, mocked provider/authorization tests do not constitute live integration verification.

## LLM composition verification — September 26, 2026

- Final lint, TypeScript (`--incremental false`), and isolated production build passed.
- 35 automated tests passed, covering new model-written prose, memory, calculation explanations, social replies, both generation providers, safety, numeric/unit/time/citation rejection, and provider failure fallback.
- Live synthetic breakfast → “why 20min?” → thanks passed. Groq composed the first two responses; the calculation used the actual 08:00–08:20 UTC timestamps. Thanks made no LLM request and retained context.
- A broader live check exposed generated use of retrieval-boundary timestamps as if they were observations. Removing those timestamps from the composition prompt fixed the single sleep check; the consistency gate rejected the earlier outputs before display.
- Later overview checks exposed unsupported interpretations and numeric paraphrases. Added comparison checks, broader quantity parsing, unsafe-reassurance rejection, and one budgeted corrective generation. These pass mocked regression tests; final broader live LLM verification was limited by provider budget availability. Deterministic fallback still completed the conversation.
- Use `npm run check:chat -- --breakfast --require-llm` to require live composition; without that flag the smoke check also accepts disclosed factual fallback.
- The prior exact-sentence selection transport was removed. Tests now verify that model wording differs from fact sentences while citations map back to the corresponding records.
- The only UI change is the social-response status caption (“Here to help”); layouts, styles, and interaction controls remain unchanged.

## Earlier conversation and direct-database verification — September 26, 2026

- 25 automated tests passed; lint and TypeScript checks passed.
- Production build passed using `NEXT_DIST_DIR=.next-production` to avoid the active dev server's output directory.
- `npm ci --dry-run --ignore-scripts --no-audit --no-fund` accepted the lockfile. This is lockfile validation, not a fresh installation.
- `npm run db:init` initialized the schema using the configured `DATABASE_URL`; sample seeding completed with 1,202 events and 37 baselines. Existing embeddings were reused.
- The exact four-message conversation passed against the live database, first with deterministic fallback and then with successful Groq synthesis on all four turns after selecting an available model. Gemini's application budget was unavailable during those checks.
- Repeat the cloud conversation check with `npm run check:chat`. It uses only the synthetic Dad profile, consumes the configured provider budgets, and prints whether each answer used fallback. To probe providers alone: `node --conditions=react-server --import tsx scripts/check-chat.ts --providers`.
- Private-user authentication and durable cross-device conversation history are not implemented. Vercel deployment remains unverified.

## Earlier UI verification record (not rerun for the conversation change)

- Seed dry run: 1,202 events, 37 baselines, 39 narratives; three invalid Ordonez A intervals reported.
- Browser: Dad shows 3.1× pacing and two prior sample episodes; baseline statistics and timestamps render in the existing drawer; Escape closes it; switching to Mum clears the chat and returns 1× pacing.
- At 390 × 844, document width is 390 pixels: no horizontal overflow. Screenshots are in ignored `output/playwright/`.
- Hash comparison confirms `ChatComposer`, `ChatStream`, `EvidenceDrawer`, `RecipientSelector`, and `globals.css` are unchanged from the reference. The page JSX is unchanged.

## LLM routing follow-up — September 26, 2026

- 39 tests pass, including model routing/composition of a contextual label paraphrase, no activity retrieval for definitions, scoped environmental event requests, and clarification when scope is unresolved. Lint, TypeScript, and production build pass.
- The live local environmental-definition request returned the correct local explanation with no event evidence. Its flags showed DETERMINISTIC_RESPONSE, so live LLM routing/composition is not verified in this run. Mocked provider tests verify both stages and context delivery.
- Social replies now use the LLM when available and retain dialogue as well as prior evidence scope; earlier records describing social turns as model-free refer to the previous implementation.
- Read-only budget inspection confirmed Gemini and Groq each used 50/50 configured daily calls on September 26. This explains the live fallback; budgets were not changed or reset.

## Yesterday summary follow-up — September 26, 2026

- 41 tests, lint, and TypeScript checks pass. Added the exact yesterday-to-summary sequence, clarification date retention, explicit today override, and model-planned overview inheritance after a focused activity.
- The running local API returned recorded overviews for both messages, with identical recording-relative intervals (September 20 00:00 to September 21 00:00 UTC) and 12 supporting evidence records. Both used disclosed deterministic fallback; this was not live LLM verification.

## Meal-pattern memory follow-up — September 26, 2026

- 43 tests, lint, and TypeScript checks pass. Regression coverage includes yesterday → meals → misspelled pattern → correction, topic/date switching, and recovery after a clarification.
- The running API retained the September 20 interval across all four messages. Pattern and correction answers used only meal events and meal baselines and disclosed the single-day pattern limitation. All four responses were factual fallback; live model wording remains unverified under the exhausted configured budgets.
- Clarifications now retain the last activity scope rather than replacing it with an empty topic. Pattern follow-ups set comparison and pattern analysis in both local and inherited model plans.

## Sleep-duration evaluation follow-up — September 26, 2026

- 44 tests, lint, and TypeScript checks pass. Short evaluative follow-ups retain sleep scope and date, enable baseline comparison, and distinguish measured duration from sleep quality or adequacy. With no prior context, the assistant requests context. Explicit unrelated-topic and emergency boundaries still apply.
- The exact sleep-yesterday → is-it-good-time sequence passed against the local API. The follow-up cited only the sleep record and baseline, comparing 450 with 436.07 minutes and stating the limitation. Both replies used factual fallback; live LLM wording is not verified.
- The generic lexical relevance check no longer rejects a context-bearing turn before the model planner sees it.
