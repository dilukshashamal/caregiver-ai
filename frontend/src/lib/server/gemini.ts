const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/";
function headers() { return { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY || "" }; }
export async function embed(text: string, signal: AbortSignal, taskType = "RETRIEVAL_QUERY") {
  const model = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
  const res = await fetch(`${endpoint}${encodeURIComponent(model)}:embedContent`, { method: "POST", headers: headers(), signal,
    body: JSON.stringify({ model: `models/${model}`, content: { parts: [{ text: text.slice(0, 1600) }] }, taskType, outputDimensionality: 1536 }) });
  if (!res.ok) throw new Error(`Embedding provider status ${res.status}`);
  const data = await res.json();
  const vector: unknown = data.embedding?.values;
  if (!Array.isArray(vector) || vector.length !== 1536 || vector.some(v => typeof v !== "number" || !Number.isFinite(v))) throw new Error("Invalid embedding");
  const norm = Math.sqrt(vector.reduce((sum: number, n: number) => sum + n * n, 0));
  if (!norm) throw new Error("Empty embedding");
  return vector.map((n: number) => n / norm);
}
