import { Pool, type QueryResultRow } from "pg";

type GlobalWithPool = typeof globalThis & { __gennaai_pool__?: Pool };

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is missing");
  const globalScope = globalThis as GlobalWithPool;
  if (globalScope.__gennaai_pool__) return globalScope.__gennaai_pool__;

  const pool = new Pool({
    connectionString,
    // Supabase's direct endpoint uses TLS. This keeps the connection reusable
    // across warm serverless invocations without creating a large pool.
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    statement_timeout: 8_000,
    query_timeout: 8_000,
    keepAlive: true,
    application_name: "gennaai-caregiver",
    options: "-c search_path=public,extensions",
  });
  globalScope.__gennaai_pool__ = pool;
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = [], signal?: AbortSignal): Promise<T[]> {
  if (signal?.aborted) throw new Error("Database request cancelled");
  const result = await getPool().query<T>({ text, values });
  return result.rows;
}

export async function closeDatabase() {
  const globalScope = globalThis as GlobalWithPool;
  const pool = globalScope.__gennaai_pool__;
  if (pool) {
    delete globalScope.__gennaai_pool__;
    await pool.end();
  }
}
