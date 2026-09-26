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

## Conversation and direct-database verification — September 26, 2026

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
