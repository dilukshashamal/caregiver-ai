import { CareRecipient, ChatRequestPayload, GroundedAnswer } from "./types";
import { readSSE } from "./sse";

export class ApiError extends Error {
  constructor(message: string, public status?: number, public detail?: unknown) { super(message); this.name = "ApiError"; }
}
async function checked(response: Response) {
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new ApiError(error?.detail || "The request could not be completed.", response.status);
  }
  return response;
}
export async function fetchRecipients(): Promise<CareRecipient[]> {
  return (await checked(await fetch("/api/recipients", { cache: "no-store" }))).json();
}
export async function sendChatMessage(payload: ChatRequestPayload, onDelta?: (text: string) => void, signal?: AbortSignal): Promise<GroundedAnswer> {
  const response = await checked(await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify(payload), signal }));
  if (!response.body) throw new ApiError("The answer stream was unavailable.");
  for await (const frame of readSSE(response.body)) {
    const data = JSON.parse(frame.data);
    if (frame.event === "delta") onDelta?.(data.text);
    if (frame.event === "error") throw new ApiError(data.detail);
    if (frame.event === "done") return data as GroundedAnswer;
  }
  throw new ApiError("The answer was interrupted. Please try again.");
}
