import { config } from "../config";

type OllamaEmbedResponse = {
  embeddings?: number[][];
  embedding?: number[]; // legacy /api/embeddings shape
  error?: string;
};

export async function embed(text: string): Promise<number[]> {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) throw new Error("embed: empty text");
  const [vec] = await embedBatch([trimmed]);
  if (!vec) throw new Error("embed: no vector returned");
  return vec;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const cleaned = texts.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (cleaned.length === 0) return [];

  const res = await fetch(`${config.ollama.url}/api/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: config.ollama.embedModel, input: cleaned }),
    // Fail fast if Ollama wedges. Without a timeout, the API's worker pool
    // can be exhausted by a single hung model load.
    signal: AbortSignal.timeout(config.ollama.timeoutMs),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ollama embed failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as OllamaEmbedResponse;
  const vectors = data.embeddings ?? (data.embedding ? [data.embedding] : []);
  if (vectors.length === 0) {
    throw new Error(`ollama embed returned no vectors: ${JSON.stringify(data)}`);
  }
  // Ollama 0.3+ returns one embedding per input string. A length mismatch
  // means the server silently dropped or duplicated rows; failing loudly here
  // keeps the crawler from associating the wrong vector with a job.
  if (vectors.length !== cleaned.length) {
    throw new Error(
      `ollama embed count mismatch: sent ${cleaned.length} inputs, got ${vectors.length} vectors`,
    );
  }
  for (const v of vectors) {
    if (v.length !== config.qdrant.embeddingDim) {
      throw new Error(
        `embedding dim mismatch: model=${config.ollama.embedModel} returned ${v.length}, expected ${config.qdrant.embeddingDim}`,
      );
    }
  }
  return vectors;
}

export async function isReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${config.ollama.url}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
