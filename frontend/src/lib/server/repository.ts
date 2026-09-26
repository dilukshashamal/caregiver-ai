import "server-only";
import { query } from "../db";
import { ActivityEvent, Baseline, Recipient } from "./domain";
import { sampleDataset } from "./sample";

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

export const usesDatabase = () => ["database", "postgres"].includes(process.env.DATA_SOURCE || "");
export const demoMode = () => process.env.DEMO_MODE !== "false";
const publicIds = ["dad-demo", "mum-demo", "OrdonezA", "OrdonezB"];

function toEvent(row: ActivityEvent) {
  return { ...row, start_time: new Date(row.start_time).toISOString(), end_time: new Date(row.end_time).toISOString(), duration_minutes: Number(row.duration_minutes) };
}

export async function allowedRecipients(_request: Request, signal: AbortSignal): Promise<Recipient[]> {
  if (!usesDatabase()) {
    if (!demoMode()) throw new HttpError(503, "Configure DATABASE_URL before enabling private mode.");
    return sampleDataset().recipients;
  }
  if (!demoMode()) throw new HttpError(503, "Private mode requires an application authentication layer.");
  try {
    return await query<Recipient>(`select id, name, timezone, is_demo, metadata from public.recipients where is_demo = true and id = any($1::text[]) order by id`, [publicIds], signal);
  } catch {
    throw new HttpError(503, "Care profiles are temporarily unavailable.");
  }
}

export async function latestTime(recipient: string, signal: AbortSignal) {
  if (!usesDatabase()) return sampleDataset().events.filter(e => e.recipient_id === recipient).map(e => e.end_time).sort().at(-1);
  try {
    const rows = await query<{ end_time: string }>(`select end_time from public.events where recipient_id = $1 order by end_time desc limit 1`, [recipient], signal);
    return rows[0]?.end_time ? new Date(rows[0].end_time).toISOString() : undefined;
  } catch {
    throw new HttpError(503, "Recorded activities are temporarily unavailable.");
  }
}

export async function getEvents(recipient: string, start: string, end: string, activities: string[], signal: AbortSignal): Promise<ActivityEvent[]> {
  if (!usesDatabase()) return sampleDataset().events.filter(e => e.recipient_id === recipient && e.start_time < end && e.end_time > start && (!activities.length || activities.includes(e.activity)));
  const result: ActivityEvent[] = [];
  for (let offset = 0; offset < 3000; offset += 500) {
    const values: unknown[] = [recipient, end, start];
    let sql = `select id, recipient_id, activity, start_time, end_time, duration_minutes, metadata from public.events where recipient_id = $1 and start_time < $2 and end_time > $3`;
    if (activities.length) { values.push(activities); sql += ` and activity = any($${values.length}::text[])`; }
    values.push(500, offset);
    sql += ` order by start_time, id limit $${values.length - 1} offset $${values.length}`;
    try {
      const rows = await query<ActivityEvent>(sql, values, signal);
      result.push(...rows.map(toEvent));
      if (rows.length < 500) return result;
    } catch {
      throw new HttpError(503, "Recorded activities are temporarily unavailable.");
    }
  }
  throw new HttpError(422, "There are too many records in this interval. Ask about a shorter period.");
}

export async function getBaselines(recipient: string, before: string, signal: AbortSignal): Promise<Baseline[]> {
  if (!usesDatabase()) return sampleDataset().baselines.filter(b => b.recipient_id === recipient && b.window_end < before);
  try {
    const rows = await query<Baseline>(`select id, recipient_id, activity, mean_duration, std_duration, mean_frequency, window_days, window_start, window_end, sample_count, metadata from public.baselines where recipient_id = $1 and window_end < $2 order by window_end desc limit 100`, [recipient, before], signal);
    return rows.filter((b, i, all) => all.findIndex(x => x.activity === b.activity) === i).map(b => ({ ...b, mean_duration: Number(b.mean_duration), mean_frequency: Number(b.mean_frequency), std_duration: b.std_duration === null ? null : Number(b.std_duration) }));
  } catch {
    throw new HttpError(503, "Baseline information is temporarily unavailable.");
  }
}

export async function reserveBudget(signal: AbortSignal, provider: "gemini" | "groq" = "gemini") {
  const prefix = provider.toUpperCase();
  if (!usesDatabase() || !process.env[`${prefix}_API_KEY`]) return false;
  const limit = (name: string, fallback: number) => { const n = Number(process.env[name] || fallback); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback; };
  const minute = limit(`${prefix}_REQUESTS_PER_MINUTE`, 4), day = limit(`${prefix}_REQUESTS_PER_DAY`, 50);
  try {
    const rows = await query<{ permitted: boolean }>(`select public.reserve_provider_budget($1::text, $2::int, $3::int) as permitted`, [provider, minute, day], signal);
    return rows[0]?.permitted === true;
  } catch {
    return false;
  }
}
