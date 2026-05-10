import { Elysia, t } from "elysia";
import { embed as ollamaEmbed } from "../embed/ollama";
import { expandQuery } from "../lib/query-expansion";

export const embed = new Elysia({ prefix: "/embed" }).post(
  "/",
  async ({ body, status }) => {
    try {
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
    body: t.Object({
      text: t.String({ minLength: 1, maxLength: 50_000 }),
      expand: t.Optional(t.Boolean()),
    }),
  },
);
