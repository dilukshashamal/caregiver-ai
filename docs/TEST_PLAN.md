# Verification

Run from `frontend/`:

```sh
npm ci
npm run lint
npm test
npm run seed:dry
npm run build
```

Automated coverage includes baseline mean/sample deviation, empty data, leap days, zero denominators, broken date streaks, parser idempotency/rejections, synthetic 3.1× result, two-episode detection, recipient isolation, matching-window requirements, grounding IDs, conservative safety, signed follow-up scope, malformed HTTP inputs, streamed completion, Supabase authorization with mocked HTTP, byte-split UTF-8 SSE decoding, invalid model selections, and normalized 1536-dimensional embeddings.

Browser checks: submit the Dad agitation question; watch partial response updates; open related activities and verify baseline/citation timestamps; close via Escape; switch to Mum and verify chat reset and 1× pacing; submit a medical question and verify deflection; inspect a narrow viewport for horizontal overflow.

Cloud checks require real credentials: apply `supabase/schema.sql`, run the seed, rerun to confirm idempotence, inspect vector dimensions/RPC recipient filtering, verify anonymous table/RPC calls fail, and test provider budget exhaustion. Without credentials, mocked provider/authorization tests do not constitute live integration verification.

## Local verification record

- 20 automated tests pass, including mocked provider 429 fallback, Groq stream validation, provider selection, and Groq-only budget enforcement without Gemini calls.
- Production build and lint pass; dependency installation reports zero known vulnerabilities.
- Seed dry run: 1,202 events, 37 baselines, 39 narratives; three invalid Ordonez A intervals reported.
- Browser: Dad shows 3.1× pacing and two prior sample episodes; baseline statistics and timestamps render in the existing drawer; Escape closes it; switching to Mum clears the chat and returns 1× pacing.
- At 390 × 844, document width is 390 pixels: no horizontal overflow. Screenshots are in ignored `output/playwright/`.
- Hash comparison confirms `ChatComposer`, `ChatStream`, `EvidenceDrawer`, `RecipientSelector`, and `globals.css` are unchanged from the reference. The page JSX is unchanged.
- Live schema application, Supabase vector search, real Gemini/Groq calls, and Vercel deployment remain unverified until credentials are supplied.
