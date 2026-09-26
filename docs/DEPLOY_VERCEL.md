# Deploy caregiver-ai to Vercel

The app is self-contained in `frontend/`. The repository also keeps SQL migrations, the local seed entrypoint, source data, documentation and tests. Those files do not require a Python service or prevent deployment. Vercel builds the selected application and traces the runtime files it needs.

## 1. Put the commit on GitHub

From the repository root, after the local commit has been created:

```sh
git push -u origin main
```

Remote: `https://github.com/dilukshashamal/caregiver-ai.git`.

`.gitignore` excludes real `.env` files, `node_modules`, `.next`, `.vercel`, the downloaded reference repository, browser artifacts and generated caches. Commit `package-lock.json`, `.env.example`, source code, schema, seed scripts and documentation. Do not force-add `frontend/.env`.

## 2. Prepare Supabase once

1. In your Supabase project, open **SQL Editor** and run the full `supabase/schema.sql`. If you ran an earlier copy, rerun the updated file to add Groq's independent budget function/rows; existing data and Gemini counters are preserved.
2. Fill the ignored local `frontend/.env` with the direct `DATABASE_URL` connection string.
3. Seed from your computer, not during the Vercel build:

```sh
cd frontend
npm ci
npm run seed:dry
npm run seed -- --skip-embeddings
```

For semantic search, also set `GEMINI_API_KEY` and run `npm run seed` to generate/resume the compact embeddings. Groq generation does not require a Gemini key; without it, the app uses its structured event queries and baselines.

## 3. Import the repository

In Vercel, choose **Add New → Project**, import `dilukshashamal/caregiver-ai`, and set:

| Setting | Value |
| --- | --- |
| Framework preset | Next.js |
| Root Directory | `frontend` |
| Node.js | `22.x` |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | Default Next.js setting (`.next`); do not use `out` or `.next/standalone` |
| Production branch | `main` |

The Root Directory is important: there is deliberately no root-level `package.json`. [Vercel documents selecting the application root here](https://vercel.com/docs/monorepos).

## 4. Add environment variables in Vercel

Choose Production (and Preview if desired). Local `.env` values are not automatically committed or supplied to Vercel.

For **Groq chat with Supabase PostgreSQL**:

```dotenv
DEMO_MODE=true
DATA_SOURCE=database
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.qvnmtgtqtktuqrmmhqtq.supabase.co:5432/postgres
LLM_PROVIDER=groq
GROQ_API_KEY=<real Groq key>
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_REQUESTS_PER_MINUTE=4
GROQ_REQUESTS_PER_DAY=50
LLM_FALLBACK_PROVIDER=none
```

`GROQ_MODEL` retains the reference repository's default. It is documented in [Groq's model catalog](https://console.groq.com/docs/model/llama-3.3-70b-versatile). Availability and quotas depend on your account.

Optional **Gemini embeddings and/or Gemini chat**:

```dotenv
GEMINI_API_KEY=<real Gemini key>
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_REQUESTS_PER_MINUTE=4
GEMINI_REQUESTS_PER_DAY=50
```

- Set `LLM_PROVIDER=gemini` to select Gemini instead of Groq.
- To use Groq if Gemini is unavailable, set `LLM_PROVIDER=gemini`, `LLM_FALLBACK_PROVIDER=groq`, and both keys.
- The reverse is supported too. Secondary-provider calls happen only when explicitly configured and within that provider's separate budget. There are no automatic repeated retries.
- Both providers use the same evidence validation and streaming contract. No additional SDK is needed.
- `SESSION_SECRET` is optional; use a random value of at least 32 characters for signed follow-up context.
- Percent-encode special characters in the `DATABASE_URL` password. Keep the connection string server-only.

For a **no-key preview only**, use `DATA_SOURCE=demo` and `DEMO_MODE=true`. This shows the bundled synthetic profiles and deterministic answers, with no external LLM calls. Select `DATA_SOURCE=database` to enable budgeted cloud generation.

## 5. Deploy and check

Click **Deploy**. Then:

1. Select Dad and ask “Is Dad becoming agitated?”; expect the synthetic 3.1× comparison.
2. Open related activities; inspect baseline details and timestamps.
3. Switch to Mum; the conversation should reset and pacing should be 1× baseline.
4. Check Vercel's function logs if profiles fail to load. Confirm the schema was run and the direct database connection string is correct. A missing or failed provider returns the grounded deterministic answer, so a successful answer alone does not prove the provider was used.
5. Redeploy after changing environment variables. Future pushes to `main` trigger deployments once the Git integration is connected.

There is no build-time seeding, external FastAPI URL, Redis, or local database. `frontend/vercel.json` configures the chat function for up to 60 seconds; the application imposes a shorter overall deadline.

The existing UI is a public sample experience. Keep `DEMO_MODE=true` only for the known sample profiles. Private records require the authenticated API mode and a separate sign-in UI integration described in the README. Vercel Hobby's [usage rules](https://vercel.com/docs/plans/hobby) and the bundled UCI dataset's non-commercial terms still apply.
