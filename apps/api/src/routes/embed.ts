import { Elysia, t } from "elysia";
import { embed as ollamaEmbed, embedBatch as ollamaEmbedBatch } from "../embed/ollama";
import { expandQuery } from "../lib/query-expansion";

// Hard cap on batch size. Keeps any single request bounded in memory and
// guards against accidental large fan-outs from the crawler. Sized to comfortably
// exceed the crawler's 16-job batch without leaving headroom for abuse.
const MAX_BATCH = 64;

// In-process concurrency cap for Ollama single-text embeds. Without this,
// a burst of concurrent /embed requests (e.g. five saved-search evaluations
// firing on Feed mount) all hit Ollama in parallel; Ollama then 503s some
// of them, which the API surfaces to the client as a generic failure. With
// the semaphore, the third+ caller waits its turn instead - latency goes
// up by tens of ms, but the success rate goes to ~100%. 2 in-flight matches
// the crawler's EMBED_CONCURRENCY=2 systemd setting, so the API and crawler
// together never exceed Ollama's tolerated parallelism.
const EMBED_INFLIGHT_MAX = 2;
let embedInflight = 0;
const embedWaitQueue: Array<() => void> = [];

async function acquireEmbedSlot(): Promise<void> {
  if (embedInflight < EMBED_INFLIGHT_MAX) {
    embedInflight += 1;
    return;
  }
  await new Promise<void>((resolve) => embedWaitQueue.push(resolve));
  embedInflight += 1;
}

function releaseEmbedSlot(): void {
  embedInflight -= 1;
  const next = embedWaitQueue.shift();
  if (next) next();
}

async function gatedEmbed(text: string): Promise<number[]> {
  await acquireEmbedSlot();
  try {
    return await ollamaEmbed(text);
  } finally {
    releaseEmbedSlot();
  }
}

// Boot-time pre-warm: issue one dummy embed so Ollama mmaps the model file
// before the first real user query. Without this, the first /embed after
// process start pays a 2-10s model-load tax that times out for the user
// and looks identical to a rate-limit failure. Fire-and-forget; if Ollama
// is down at boot the API still serves cached results and the next real
// embed will surface the error.
export async function prewarmEmbed(): Promise<void> {
  await gatedEmbed("warmup");
}

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
  // Normalize aggressively so functionally-identical queries share a cache
  // slot. Lowercase, strip punctuation that doesn't change meaning, then
  // sort tokens alphabetically - "Software Engineer", "software engineer",
  // and "engineer, software" all collapse to "engineer software". The
  // expander runs on the same raw text upstream, so two callers asking
  // for the same expansion get the same expanded gloss; we cache the
  // resulting vector under the normalized key for both.
  //
  // We preserve a small set of non-alphanumeric chars that DO carry meaning
  // in tech titles: +, #, ., /, - (so "c++", "c#", ".net", "front-end",
  // "node.js" survive normalization rather than collapsing to "c", "net",
  // "front end"). expanded=true and =false produce different vectors for
  // the same raw text, so the flag still gates the key.
  const norm = text
    .toLowerCase()
    .replace(/[^\w\s+#./-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
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

      const vector = await gatedEmbed(inputText);
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
