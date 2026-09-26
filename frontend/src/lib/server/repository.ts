import "server-only";
import { getSupabase } from "../supabase";
import { ActivityEvent, Baseline, Recipient } from "./domain";
import { sampleDataset } from "./sample";

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export const usesSupabase = () => process.env.DATA_SOURCE === "supabase";
export const demoMode = () => process.env.DEMO_MODE !== "false";
const publicIds = ["dad-demo", "mum-demo", "OrdonezA", "OrdonezB"];

export async function allowedRecipients(request: Request, signal: AbortSignal): Promise<Recipient[]> {
  if (!usesSupabase()) {
    if (!demoMode()) throw new HttpError(503, "Configure Supabase before enabling private mode.");
    return sampleDataset().recipients;
  }
  const db = getSupabase(signal);
  if (demoMode()) {
    const { data, error } = await db.from("recipients").select("*").eq("is_demo", true).in("id", publicIds).order("id");
    if (error) throw new HttpError(503, "Care profiles are temporarily unavailable.");
    return data as Recipient[];
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!token) throw new HttpError(401, "Sign in to access care profiles.");
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) throw new HttpError(401, "Please sign in again.");
  const { data: access, error: accessError } = await db.from("recipient_access").select("recipient_id").eq("user_id", auth.user.id);
  if (accessError) throw new HttpError(503, "Care profiles are temporarily unavailable.");
  const ids = (access || []).map(row => row.recipient_id as string);
  if (!ids.length) return [];
  const { data, error } = await db.from("recipients").select("*").in("id", ids);
  if (error) throw new HttpError(503, "Care profiles are temporarily unavailable.");
  return data as Recipient[];
}
export async function latestTime(recipient: string, signal: AbortSignal) {
  if (!usesSupabase()) return sampleDataset().events.filter(e => e.recipient_id === recipient).map(e => e.end_time).sort().at(-1);
  const { data, error } = await getSupabase(signal).from("events").select("end_time").eq("recipient_id", recipient).order("end_time", { ascending: false }).limit(1);
  if (error) throw new HttpError(503, "Recorded activities are temporarily unavailable.");
  return data?.[0]?.end_time as string | undefined;
}
export async function getEvents(recipient: string, start: string, end: string, activities: string[], signal: AbortSignal): Promise<ActivityEvent[]> {
  if (!usesSupabase()) return sampleDataset().events.filter(e => e.recipient_id === recipient && e.start_time < end && e.end_time > start && (!activities.length || activities.includes(e.activity)));
  const result: ActivityEvent[] = [];
  // Bounded pagination avoids PostgREST's default 1,000-row truncation being mistaken for a total.
  for (let offset = 0; offset < 3000; offset += 500) {
    let query = getSupabase(signal).from("events").select("*").eq("recipient_id", recipient).lt("start_time", end).gt("end_time", start).order("start_time").order("id").range(offset, offset + 499);
    if (activities.length) query = query.in("activity", activities);
    const { data, error } = await query;
    if (error) throw new HttpError(503, "Recorded activities are temporarily unavailable.");
    result.push(...(data as ActivityEvent[]).map(e => ({ ...e, start_time: new Date(e.start_time).toISOString(), end_time: new Date(e.end_time).toISOString(), duration_minutes: Number(e.duration_minutes) })));
    if (data.length < 500) return result;
  }
  throw new HttpError(422, "There are too many records in this interval. Ask about a shorter period.");
}
export async function getBaselines(recipient: string, before: string, signal: AbortSignal): Promise<Baseline[]> {
  if (!usesSupabase()) return sampleDataset().baselines.filter(b => b.recipient_id === recipient && b.window_end < before);
  const { data, error } = await getSupabase(signal).from("baselines").select("*").eq("recipient_id", recipient).lt("window_end", before).order("window_end", { ascending: false }).limit(100);
  if (error) throw new HttpError(503, "Baseline information is temporarily unavailable.");
  return (data as Baseline[]).filter((b, i, all) => all.findIndex(x => x.activity === b.activity) === i).map(b => ({ ...b, mean_duration: Number(b.mean_duration), mean_frequency: Number(b.mean_frequency), std_duration: b.std_duration === null ? null : Number(b.std_duration) }));
}
export async function reserveBudget(signal: AbortSignal, provider: "gemini" | "groq" = "gemini") {
  const prefix = provider.toUpperCase();
  if (!usesSupabase() || !process.env[`${prefix}_API_KEY`]) return false;
  const limit = (name: string, fallback: number) => { const n = Number(process.env[name] || fallback); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback; };
  const limits = { minute_limit: limit(`${prefix}_REQUESTS_PER_MINUTE`, 4), day_limit: limit(`${prefix}_REQUESTS_PER_DAY`, 50) };
  const { data, error } = await getSupabase(signal).rpc(provider === "gemini" ? "reserve_gemini_budget" : "reserve_provider_budget", provider === "gemini" ? limits : { ...limits, provider_name: provider });
  return !error && data === true;
}
