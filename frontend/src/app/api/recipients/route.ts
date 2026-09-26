import { allowedRecipients } from "@/lib/server/repository";
import { errorResponse } from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const recipients = await allowedRecipients(request, AbortSignal.any([request.signal, AbortSignal.timeout(8000)]));
    return Response.json(recipients.map(r => ({ id: r.id, full_name: r.name, timezone: r.timezone, metadata: r.metadata })), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
