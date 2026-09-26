import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Intent } from "./domain";
const ephemeralSecret = randomBytes(32).toString("hex");
const secret = () => process.env.SESSION_SECRET || process.env.DATABASE_URL || ephemeralSecret;
export interface MemoryTurn { question: string; answer: string }
export interface ConversationMemory { intent: Intent; turns: MemoryTurn[] }
export const MAX_CONTEXT_LENGTH = 12000;
const signature = (value: string) => createHmac("sha256", secret()).update(value).digest("base64url");
export function signContext(recipient: string, intent: Intent, turns: MemoryTurn[] = []) {
  const bounded = turns.slice(-3).map(t => ({ question: t.question.slice(0, 400), answer: t.answer.slice(0, 1000) }));
  const encode = () => Buffer.from(JSON.stringify({ recipient, intent, turns: bounded, expires: Date.now() + 3_600_000 })).toString("base64url");
  let payload = encode();
  while (payload.length + 44 > MAX_CONTEXT_LENGTH && bounded.length) { bounded.shift(); payload = encode(); }
  return `${payload}.${signature(payload)}`;
}
export function readContext(value: string | undefined, recipient: string): Intent | undefined {
  return readMemory(value, recipient)?.intent;
}
export function readMemory(value: string | undefined, recipient: string): ConversationMemory | undefined {
  if (!value || value.length > MAX_CONTEXT_LENGTH) return;
  try {
    const pieces = value.split(".");
    if (pieces.length !== 2) return;
    const [payload, mac] = pieces;
    const expected = Buffer.from(signature(payload));
    const actual = Buffer.from(mac || "");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (parsed.recipient !== recipient || !Number.isFinite(parsed.expires) || parsed.expires < Date.now()) return;
    const intent = parsed.intent;
    if (!intent || !Array.isArray(intent.activities) || intent.activities.length > 16 || intent.activities.some((a: unknown) => typeof a !== "string" || a.length > 64)) return;
    const start = Date.parse(intent.start), end = Date.parse(intent.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 31 * 86400000) return;
    if (["behavioral", "comparison", "pattern", "coverage"].some(k => typeof intent[k] !== "boolean")) return;
    if (intent.task !== undefined && !["activity", "overview", "explanation", "calculation"].includes(intent.task)) return;
    const turns = parsed.turns ?? [];
    if (!Array.isArray(turns) || turns.length > 3 || turns.some(t => !t || typeof t.question !== "string" || t.question.length > 400 || typeof t.answer !== "string" || t.answer.length > 1000)) return;
    return { intent, turns };
  } catch { return; }
}
