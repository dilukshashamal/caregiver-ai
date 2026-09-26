import { createHmac, timingSafeEqual } from "node:crypto";
import { Intent } from "./domain";
const secret = () => process.env.SESSION_SECRET || "bundled-synthetic-demo-only-context-v1";
const signature = (value: string) => createHmac("sha256", secret()).update(value).digest("base64url");
export function signContext(recipient: string, intent: Intent) {
  const payload = Buffer.from(JSON.stringify({ recipient, intent, expires: Date.now() + 3_600_000 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function readContext(value: string | undefined, recipient: string): Intent | undefined {
  if (!value || value.length > 4000) return;
  try {
    const [payload, mac] = value.split(".");
    const expected = Buffer.from(signature(payload));
    const actual = Buffer.from(mac || "");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (parsed.recipient !== recipient || !Number.isFinite(parsed.expires) || parsed.expires < Date.now()) return;
    const intent = parsed.intent;
    if (!intent || !Array.isArray(intent.activities) || intent.activities.length > 16 || intent.activities.some((a: unknown) => typeof a !== "string" || a.length > 64)) return;
    const start = Date.parse(intent.start), end = Date.parse(intent.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 31 * 86400000) return;
    return parsed.intent;
  } catch { return; }
}
