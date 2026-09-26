import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import { query } from "../src/lib/db";
import { baselineWindow } from "../src/lib/server/evidence";
import { embed } from "../src/lib/server/gemini";
import { narrativeGroups, parseADL } from "../src/lib/server/ingestion";
import { sampleDataset } from "../src/lib/server/sample";

async function writeStructuredData(dataset: ReturnType<typeof sampleDataset>) {
  await query(`insert into public.recipients (id, name, timezone, is_demo, metadata)
    select id, name, timezone, is_demo, metadata from jsonb_to_recordset($1::jsonb)
    as rows(id text, name text, timezone text, is_demo boolean, metadata jsonb)
    on conflict (id) do update set name = excluded.name, timezone = excluded.timezone, is_demo = excluded.is_demo, metadata = excluded.metadata`, [JSON.stringify(dataset.recipients)]);
  for (let i = 0; i < dataset.events.length; i += 200) {
    await query(`insert into public.events (id, recipient_id, activity, start_time, end_time, duration_minutes, metadata)
      select id::uuid, recipient_id, activity, start_time::timestamptz, end_time::timestamptz, duration_minutes, metadata
      from jsonb_to_recordset($1::jsonb)
      as rows(id text, recipient_id text, activity text, start_time text, end_time text, duration_minutes numeric, metadata jsonb)
      on conflict (id) do update set activity = excluded.activity, start_time = excluded.start_time, end_time = excluded.end_time, duration_minutes = excluded.duration_minutes, metadata = excluded.metadata`, [JSON.stringify(dataset.events.slice(i, i + 200))]);
  }
  for (let i = 0; i < dataset.baselines.length; i += 200) {
    await query(`insert into public.baselines (id, recipient_id, activity, mean_duration, std_duration, mean_frequency, window_days, updated_at, window_start, window_end, sample_count, metadata)
      select id::uuid, recipient_id, activity, mean_duration, std_duration, mean_frequency, window_days, now(), window_start::timestamptz, window_end::timestamptz, sample_count, metadata
      from jsonb_to_recordset($1::jsonb)
      as rows(id text, recipient_id text, activity text, mean_duration numeric, std_duration numeric, mean_frequency numeric, window_days int, window_start text, window_end text, sample_count int, metadata jsonb)
      on conflict (id) do nothing`, [JSON.stringify(dataset.baselines.slice(i, i + 200))]);
  }
}

export async function seed() {
  const root = resolve(__dirname, "../..");
  config({ path: resolve(root, "frontend/.env.local") });
  config({ path: resolve(root, "frontend/.env") });
  config({ path: resolve(root, ".env") });
  const dataset = sampleDataset();
  const reports = [];
  for (const id of ["OrdonezA", "OrdonezB"]) {
    const { events, rejected } = parseADL(await readFile(resolve(root, `data/raw/${id}_ADLs.txt`), "utf8"), id);
    if (!events.length) throw new Error(`No valid events found in ${id}`);
    dataset.recipients.push({ id, name: id.replace("Ordonez", "Ordonez "), timezone: "UTC", is_demo: true, metadata: { source: "UCI ADL", synthetic: false } });
    dataset.events.push(...events); dataset.baselines.push(...baselineWindow(events));
    reports.push({ recipient: id, accepted: events.length, rejected });
  }
  const narratives = narrativeGroups(dataset.events);
  console.log(JSON.stringify({ recipients: dataset.recipients.length, events: dataset.events.length, baselines: dataset.baselines.length, narratives: narratives.length, reports }, null, 2));
  if (process.argv.includes("--dry-run")) { console.log("Dry run: no database writes or Gemini calls."); return; }
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL in frontend/.env first.");
  await writeStructuredData(dataset);
  if (process.argv.includes("--skip-embeddings") || !process.env.GEMINI_API_KEY) {
    console.log("Structured data seeded. Embeddings skipped; rerun with GEMINI_API_KEY to add semantic retrieval."); return;
  }
  let generated = 0;
  const model = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
  for (const row of narratives) {
    const existing = await query<{ content: string; metadata: Record<string, unknown> }>("select content, metadata from public.activity_embeddings where recipient_id = $1 and id = $2", [row.recipient_id, row.id]);
    if (existing[0]?.content === row.content && existing[0].metadata?.embedding_model === model) continue;
    if (generated) await new Promise(resolveDelay => setTimeout(resolveDelay, 16000));
    const permitted = await query<{ permitted: boolean }>("select public.reserve_provider_budget($1::text, $2::int, $3::int) as permitted", ["gemini", 4, 50]);
    if (permitted[0]?.permitted !== true) throw new Error("Embedding budget reached. Structured data is ready; rerun later to resume embeddings.");
    const embedding = await embed(row.content, AbortSignal.timeout(15000), "RETRIEVAL_DOCUMENT");
    await query(`insert into public.activity_embeddings (id, recipient_id, content, embedding, metadata)
      values ($1::uuid, $2, $3, $4::vector, $5::jsonb)
      on conflict (id) do update set content = excluded.content, embedding = excluded.embedding, metadata = excluded.metadata`,
      [row.id, row.recipient_id, row.content, `[${embedding.join(",")}]`, JSON.stringify({ ...row.metadata, embedding_model: model, dimensions: 1536 })]);
    generated++; console.log(`Embedded ${generated}: ${row.recipient_id}`);
  }
  console.log(`Seed complete. ${generated} new embeddings; unchanged narratives reused.`);
}
