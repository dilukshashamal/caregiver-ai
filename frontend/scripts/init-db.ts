import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import { closeDatabase, query } from "../src/lib/db";

async function initialize() {
  const root = resolve(__dirname, "../..");
  for (const path of ["frontend/.env.local", "frontend/.env", ".env"]) config({ path: resolve(root, path) });
  if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL");
  await query(await readFile(resolve(root, "supabase/schema.sql"), "utf8"));
  console.log("Database schema initialized through DATABASE_URL.");
}
initialize().catch((error: unknown) => {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "CONNECTION_OR_SCHEMA_ERROR";
  console.error(`Database initialization failed (${code}). Check connectivity and database permissions. Credentials were not logged.`);
  process.exitCode = 1;
}).finally(closeDatabase);
