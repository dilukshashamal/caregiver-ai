# GENNAAI · standalone caregiver app

A Next.js application with the original [pilot-caregiver](https://github.com/dilukshashamal/pilot-caregiver) interface, internal streaming API routes, Supabase PostgreSQL/pgvector, and selectable Gemini or Groq assistance. No Python service, Redis, SQLite, Docker, or local database is required.

For the exact GitHub → Supabase → Vercel setup, see [Deploy to Vercel](docs/DEPLOY_VERCEL.md).

## Run immediately

Requires Node.js 22 LTS and npm.

```sh
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. The bundled mode needs no credentials. Choose **Dad · synthetic demo**, then ask **“Is Dad becoming agitated?”**. Select **View related activities** for the chronological evidence and baseline summaries. **More about this answer** contains individual claim citations, including the comparison with previous episodes. Switching to Mum clears the conversation and uses a separate, stable sample.

The existing layout, branding, styles, composer, evidence drawer, recipient selector, and chat component are preserved. Only the page's asynchronous message state and API transport changed to support incremental responses. The interface deliberately retains the reference's NurseAssist branding.

## Your environment file

`frontend/.env` has been created locally with placeholders and is ignored by Git. For a fresh checkout:

```sh
cp .env.example frontend/.env
```

Edit these values:

```dotenv
DEMO_MODE=true
DATA_SOURCE=database
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.qvnmtgtqtktuqrmmhqtq.supabase.co:5432/postgres
GEMINI_API_KEY=your-gemini-api-key
```

The database password and Gemini key stay server-side. Next.js automatically reads `frontend/.env`; `.env.local` and deployment environment variables take precedence. The seed script also reads these files. Never paste real secrets into source files.

Your optional direct database connection is included as:

```text
postgresql://postgres:[YOUR-PASSWORD]@db.qvnmtgtqtktuqrmmhqtq.supabase.co:5432/postgres
```

Host: `db.qvnmtgtqtktuqrmmhqtq.supabase.co`; port: `5432`; database/user: `postgres`. Percent-encode special characters in the **password only**, for example `@` becomes `%40`. The application and seed script use this direct PostgreSQL connection with a single small pool per warm serverless instance.

## Initialize Supabase

1. Run [`supabase/schema.sql`](supabase/schema.sql) in your project's SQL Editor. It creates the tables, vector index, scoped search function, and atomic provider budgets. It does not delete existing rows.
2. Fill in `frontend/.env` with `DATABASE_URL` and the optional Gemini key.
3. From `frontend/`, run:

```sh
npm run seed:dry
npm run seed -- --skip-embeddings
# Optional: adds/resumes real Gemini embeddings, reusing unchanged narratives.
npm run seed
```

The public entrypoint is `scripts/seed_supabase.ts`, also runnable with `npx tsx scripts/seed_supabase.ts` from the repository root. `npm run seed` uses the locally installed, locked version of tsx.

4. Set `DATA_SOURCE=database` and restart the app. Four sample recipients become available: Dad, Mum, Ordonez A, and Ordonez B. A database error is reported as an error; it never silently substitutes the bundled dataset.

The seed dry run produces **1,202 events, 37 baselines, and 39 compact narratives**. It reports three invalid Ordonez A rows (72, 81, 83: reversed timestamps). Raw data is preserved byte-for-byte. Baselines use sample standard deviation, zero-count calendar days, and the first 65% of each Ordonez recording span. Synthetic baselines use a separate 14-day training period. UTC is the explicit timestamp convention for these sample imports.

Embedding generation is checkpointed per narrative and throttled to one call every 16 seconds; a complete first seed takes roughly ten minutes. A quota or provider error stops embedding generation without undoing structured data; rerun later to resume. `--skip-embeddings` makes zero Gemini calls.

## Sample scenario

All Dad/Mum data is explicitly synthetic; it is not attributed to the UCI recordings.

| Observation, 18:00–18:22 UTC on September 21, 2026 | Dad | Baseline, September 1–14 |
| --- | ---: | ---: |
| Pacing duration | 12.4 minutes | 4 minutes |
| Bedroom/living-room transitions | 9 | 3 |
| Vocal activity duration | 6 minutes | 2 minutes |

Pacing is **3.1×** baseline. September 16 and 19 contain similar sample episodes, followed by recorded seated activity. Similarity requires all three metrics to be within 25% of the current window. Environmental observations supply context. This is a demonstration of observed trajectories, not an emotion detector or crisis prediction model. “Today” and “last night” are relative to the latest recording, and every answer states its actual interval.

## Provider selection, cost and grounding controls

The original `LLM_PROVIDER`, `GROQ_API_KEY`, and `GROQ_MODEL` settings are supported through a shared TypeScript `LLMProvider` interface. Set `LLM_PROVIDER=groq` and `GROQ_API_KEY` to use Groq; `GROQ_MODEL` defaults to `openai/gpt-oss-20b`. The former Llama model was unavailable for the configured account. Set `LLM_PROVIDER=gemini` to use Gemini. `LLM_FALLBACK_PROVIDER=groq` or `gemini` explicitly enables one secondary provider; it defaults to `none`. Both providers share the same grounding gate. Each has separate `*_REQUESTS_PER_MINUTE` and `*_REQUESTS_PER_DAY` limits.

Gemini remains the embedding provider. Groq-only operation needs no Gemini key and uses structured retrieval; supplying a Gemini key adds semantic narrative ranking. Rerun the updated schema if you applied it before Groq was added.

- Default model: `gemini-2.5-flash-lite`; configurable through `GEMINI_MODEL`.
- Ambiguous questions can use one bounded planning call per configured provider; explicit questions use local intent resolution. Behavioral questions can use one query embedding. Each synthesis provider is attempted at most once. Secondary providers require explicit configuration, and every call reserves budget.
- Providers receive the current question, up to three bounded recent question/answer excerpts, and compact evidence sentences. No raw audio, video or full event histories are sent. Retrieval and all arithmetic run locally against scoped records.
- The model **writes natural answers** using the question, conversation memory and server-computed facts. Structured paragraph citations, numeric values/units, timestamps and selected safety checks are validated before SSE delivery. These checks reduce errors but do not guarantee semantic correctness. Provider failure uses factual fallback.
- Up to eight source facts for a focused answer, or twelve for an overview; generated responses have at most five short paragraphs. Groq GPT-OSS calls allow 1,024 completion tokens including low-effort reasoning; other Groq composition calls allow 700. Gemini composition allows 1,000. Query text is limited to 1,000 characters. Social acknowledgments need no model call.
- Atomic Supabase counters default to **4 requests/minute and 50/day per provider**, shared across serverless instances. Gemini seeding and chat share its budget. These are conservative application budgets, not promises of provider quotas.
- No key, exhausted budget, malformed provider output, provider error, or embedding failure leaves deterministic evidence-backed answers available. Built-in demo mode never calls a cloud provider, even if a key is present, because it has no persistent budget store.
- Model streams have a 12-second timeout; embeddings have a 5-second timeout. The chat request has an overall 48-second deadline and a 60-second function configuration.

See Google's [embedding guidance](https://ai.google.dev/gemini-api/docs/embeddings), [model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite), and [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) for your project's current availability and quotas.

## Deploy to Vercel

1. Import this repository into Vercel.
2. Set **Root Directory: `frontend`**, framework **Next.js**, Node.js **22.x**. Keep the normal `npm run build` and `.next` output settings.
3. For a no-key demo, set `DATA_SOURCE=demo`, `DEMO_MODE=true` (these are also the defaults).
4. For database operation, set `DATABASE_URL`, apply the schema, and seed **before** enabling `DATA_SOURCE=database`. `.env` is intentionally not committed or uploaded.
5. Deploy. No backend URL, background worker, scheduled task, Python runtime, or persistent filesystem is used.

The two API handlers are Node.js serverless functions. [`frontend/vercel.json`](frontend/vercel.json) sets chat duration to 60 seconds. Check [Vercel's current function limits](https://vercel.com/docs/functions/limitations). Hobby eligibility is subject to [Vercel's personal/non-commercial usage rules](https://vercel.com/docs/plans/hobby); a commercial product launch may require a different plan. Bundled UCI data also has a non-commercial restriction in [`data/raw/README.txt`](data/raw/README.txt).

## Access boundaries

`DEMO_MODE=true` exposes only the four known public sample IDs, and only when the Supabase recipient has `is_demo=true`. Never add personal health records to those sample profiles. Tables and RPCs are inaccessible to browser/anonymous database keys.

With `DEMO_MODE=false`, the API refuses access until an application authentication layer is added. The preserved reference interface has no login screen; this repository's ready-to-run interface is the public sample experience, not a complete authenticated clinical product.

## Verify

```sh
cd frontend
npm run lint
npm test
npm run seed:dry
npm run build
```

Tests cover calculations, ingestion, date windows, sample isolation, safety, exact citations, signed conversation memory, the sleep → overview → reason regression, restricted model planning, malformed requests, SSE chunk boundaries, streamed route completion, and normalized embeddings. Live PostgreSQL/Gemini/Groq verification is separate; no live cloud schema or deployment is created by local build/test commands.

Details: [source audit](docs/SOURCE_AUDIT.md), [architecture](docs/ARCHITECTURE.md), [safety](docs/SAFETY.md), [verification](docs/TEST_PLAN.md).
