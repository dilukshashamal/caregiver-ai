export interface ServerEvent { event: string; data: string }
// Incremental UTF-8 decoder handles arbitrary TCP boundaries, CRLF and multi-line SSE data.
export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<ServerEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", event = "message", lines: string[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, ""); buffer = buffer.slice(newline + 1);
        if (!line) {
          if (lines.length) yield { event, data: lines.join("\n") };
          event = "message"; lines = [];
        } else if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) lines.push(line.slice(5).replace(/^ /, ""));
      }
      if (done) break;
    }
    // An event is complete only after a blank line. Truncated frames are never accepted.
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
