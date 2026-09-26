import { processChat } from "@/lib/server/chat";
import { errorResponse, parseChat } from "@/lib/server/http";
import { allowedRecipients, HttpError } from "@/lib/server/repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 48000);
  const signal = AbortSignal.any([controller.signal, request.signal]);
  try {
    const input = await parseChat(request);
    const recipient = (await allowedRecipients(request, signal)).find(r => r.id === input.recipient_id);
    if (!recipient) throw new HttpError(403, "This care profile is not available to you.");
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(streamController) {
        let closed = false;
        const emit = (event: string, data: unknown) => {
          if (!closed && !signal.aborted) streamController.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        const heartbeat = setInterval(() => emit("status", { state: "working" }), 5000);
        try {
          emit("status", { state: "retrieving" });
          await processChat(input, recipient, emit, signal);
        } catch {
          if (!signal.aborted) emit("error", { detail: "We couldn’t complete this answer. Please try again." });
        } finally {
          closed = true; clearInterval(heartbeat); clearTimeout(deadline);
          try { streamController.close(); } catch { /* Client disconnected. */ }
        }
      },
      cancel() { controller.abort(); clearTimeout(deadline); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
  } catch (error) { clearTimeout(deadline); return errorResponse(error); }
}
