import { Elysia, t } from "elysia";
import { embed as ollamaEmbed, embedBatch as ollamaEmbedBatch } from "../embed/ollama";
import { expandQuery } from "../lib/query-expansion";

// Hard cap on batch size. Keeps any single request bounded in memory and
// guards against accidental large fan-outs from the crawler. Sized to comfortably
// exceed the crawler's 16-job batch without leaving headroom for abuse.
const MAX_BATCH = 64;

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
      const vector = await ollamaEmbed(inputText);
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
