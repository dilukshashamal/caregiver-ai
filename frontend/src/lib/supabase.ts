import "server-only";
import { createClient } from "@supabase/supabase-js";

export function getSupabase(signal?: AbortSignal) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase configuration is missing");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: signal || AbortSignal.timeout(8000), cache: "no-store" }) } });
}
