import { Elysia, t } from "elysia";
import { embed as ollamaEmbed } from "../embed/ollama";

export const embed = new Elysia({ prefix: "/embed" }).post(
  "/",
  async ({ body, status }) => {
    try {
      const vector = await ollamaEmbed(body.text);
      return { vector, dim: vector.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return status(503, { error: msg });
    }
  },
  {
    body: t.Object({
      text: t.String({ minLength: 1, maxLength: 50_000 }),
    }),
  },
);
