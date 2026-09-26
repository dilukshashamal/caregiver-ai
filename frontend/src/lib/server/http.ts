import { HttpError } from "./repository";
import type { ChatInput } from "./chat";

export async function parseChat(request: Request): Promise<ChatInput> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new HttpError(415, "Send a JSON request.");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, "Cross-origin requests are not allowed.");
  if (!request.body) throw new HttpError(400, "A message is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) { await reader.cancel(); throw new HttpError(413, "The message is too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new HttpError(400, "Invalid JSON request."); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new HttpError(400, "Invalid request.");
  const recipient = data.recipient_id ?? data.care_recipient_id;
  if (typeof recipient !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(recipient)) throw new HttpError(400, "Choose a valid care profile.");
  if (data.recipient_id && data.care_recipient_id && data.recipient_id !== data.care_recipient_id) throw new HttpError(400, "Care profile identifiers do not match.");
  if (typeof data.message !== "string" || !data.message.trim() || data.message.length > 1000) throw new HttpError(400, "Enter a message of 1–1,000 characters.");
  if (data.conversation_id !== undefined && (typeof data.conversation_id !== "string" || data.conversation_id.length > 4000)) throw new HttpError(400, "Invalid conversation context.");
  if (data.reference_time !== undefined && (typeof data.reference_time !== "string" || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(data.reference_time) || !Number.isFinite(Date.parse(data.reference_time)))) throw new HttpError(400, "Use an ISO timestamp with a timezone.");
  return { recipient_id: recipient, message: data.message.trim(), conversation_id: data.conversation_id, reference_time: data.reference_time ? new Date(data.reference_time).toISOString() : undefined };
}
export function errorResponse(error: unknown) {
  return Response.json({ detail: error instanceof HttpError ? error.message : "This service is temporarily unavailable. Please try again." }, { status: error instanceof HttpError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}
