import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { baselineWindow } from "../src/lib/server/evidence";
import { embed } from "../src/lib/server/gemini";
import { narrativeGroups, parseADL } from "../src/lib/server/ingestion";
import { sampleDataset } from "../src/lib/server/sample";

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
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in frontend/.env.local first.");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) } });
  for (const [table, rows] of [["recipients", dataset.recipients], ["events", dataset.events], ["baselines", dataset.baselines]] as const) {
    for (let i = 0; i < rows.length; i += 200) {
      // Immutable deterministic IDs preserve baseline versions and make retries idempotent.
      const { error } = await db.from(table).upsert<(typeof rows)[number]>(rows.slice(i, i + 200), { onConflict: "id", ignoreDuplicates: table === "baselines" });
      if (error) throw new Error(`Cannot seed ${table}. Verify schema.sql was applied (${error.code}).`);
    }
  }
  if (process.argv.includes("--skip-embeddings") || !process.env.GEMINI_API_KEY) {
    console.log("Structured data seeded. Embeddings skipped; rerun with GEMINI_API_KEY to add semantic retrieval."); return;
  }
  let generated = 0;
  const model = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
  for (const row of narratives) {
    const { data, error } = await db.from("activity_embeddings").select("id,content,metadata").eq("recipient_id", row.recipient_id).eq("id", row.id).maybeSingle();
    if (error) throw new Error(`Cannot read embedding checkpoint (${error.code}).`);
    if (data?.content === row.content && data.metadata?.embedding_model === model) continue;
    if (generated) await new Promise(resolveDelay => setTimeout(resolveDelay, 16000));
    const { data: permitted, error: budgetError } = await db.rpc("reserve_gemini_budget", { minute_limit: 4, day_limit: 50 });
    if (budgetError || !permitted) throw new Error("Embedding budget reached. Structured data is ready; rerun later to resume embeddings.");
    const embedding = await embed(row.content, AbortSignal.timeout(15000), "RETRIEVAL_DOCUMENT");
    const { error: insertError } = await db.from("activity_embeddings").upsert({ ...row, embedding, metadata: { ...row.metadata, embedding_model: model, dimensions: 1536 } });
    if (insertError) throw new Error(`Cannot save embedding (${insertError.code}).`);
    generated++; console.log(`Embedded ${generated}: ${row.recipient_id}`);
  }
  console.log(`Seed complete. ${generated} new embeddings; unchanged narratives reused.`);
}
