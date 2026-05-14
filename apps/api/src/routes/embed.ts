import { Elysia, t } from "elysia";
import { embed as ollamaEmbed, embedBatch as ollamaEmbedBatch } from "../embed/ollama";
import { expandQuery } from "../lib/query-expansion";

// Hard cap on batch size. Keeps any single request bounded in memory and
// guards against accidental large fan-outs from the crawler. Sized to comfortably
// exceed the crawler's 16-job batch without leaving headroom for abuse.
const MAX_BATCH = 64;

// LRU cache for single-text embeds. Query embeds are the hot path
// (every keystroke through the search bar costs an Ollama round-trip
// otherwise), and Ollama can take 500ms-5s+ on CPU under crawler load.
// Caching by normalized input text means repeat queries land in <1ms
// regardless of crawler pressure. The crawler's batch path stays
// uncached - those texts are job descriptions, almost never repeated.
//
// 512 entries x ~768 floats x 4 bytes = ~1.5 MB ceiling. Trivial.
const QUERY_CACHE_MAX = 512;
const queryEmbedCache = new Map<string, number[]>();

function cacheGet(key: string): number[] | undefined {
  const hit = queryEmbedCache.get(key);
  if (!hit) return undefined;
  // Refresh recency by re-inserting at the tail of the Map's iteration
  // order, which JS Maps preserve in insertion order.
  queryEmbedCache.delete(key);
  queryEmbedCache.set(key, hit);
  return hit;
}

function cacheSet(key: string, value: number[]): void {
  if (queryEmbedCache.has(key)) queryEmbedCache.delete(key);
  queryEmbedCache.set(key, value);
  if (queryEmbedCache.size > QUERY_CACHE_MAX) {
    // Evict the oldest (first inserted / least recently used) key.
    const oldest = queryEmbedCache.keys().next().value;
    if (oldest !== undefined) queryEmbedCache.delete(oldest);
  }
}

function cacheKey(text: string, expanded: boolean): string {
  // Normalize: lowercase, collapse whitespace. expanded=true and =false
  // produce different vectors for the same raw text, so include it.
  const norm = text.toLowerCase().replace(/\s+/g, " ").trim();
  return `${expanded ? "x" : "r"}:${norm}`;
}

export const embed = new Elysia({ prefix: "/embed" }).post(
  "/",
  async ({ body, status }) => {
    try {
      // Batch form: { texts: string[] } -> { vectors, dim }. Query expansion
      // is single-text only (it folds synonyms into a prose gloss); the
      // batched path is for the crawler, which embeds raw job descriptions
      // and doesn't want expansion.
      if ("texts" in body) {
        const vectors = await ollamaEmbedBatch(body.texts);
        const dim = vectors[0]?.length ?? 0;
        return { vectors, dim };
      }

      // When the caller flags this embed as a search query, run it through
      // the synonym expander first. Short generic terms ("software",
      // "graduate") produce information-poor vectors; the expanded gloss
      // lands in a richer region of latent space and surfaces more
      // relevant matches. No-op for queries that don't hit the dictionary.
      let inputText = body.text;
      let expanded = false;
      if (body.expand === true) {
        const e = expandQuery(body.text);
        if (e) {
          inputText = e.embedText;
          expanded = true;
        }
      }

      // Cache lookup keyed by the raw user text + expansion flag (NOT the
      // expanded gloss): two users typing "embedded software engineer"
      // should share a hit even though the expander rewrites the input.
      const key = cacheKey(body.text, expanded);
      const cached = cacheGet(key);
      if (cached) {
        return { vector: cached, dim: cached.length, expanded, cached: true };
      }

      const vector = await ollamaEmbed(inputText);
      cacheSet(key, vector);
      return { vector, dim: vector.length, expanded };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return status(503, { error: msg });
    }
  },
  {
    body: t.Union([
      t.Object({
        text: t.String({ minLength: 1, maxLength: 50_000 }),
        expand: t.Optional(t.Boolean()),
      }),
      t.Object({
        texts: t.Array(t.String({ minLength: 1, maxLength: 50_000 }), {
          minItems: 1,
          maxItems: MAX_BATCH,
        }),
      }),
    ]),
  },
);
