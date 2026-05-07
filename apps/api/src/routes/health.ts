import { Elysia } from "elysia";
import * as qdrant from "../qdrant/client";
import * as sqlite from "../db/sqlite";
import * as ollama from "../embed/ollama";

export const health = new Elysia().get("/health", async () => {
  const [qd, ol] = await Promise.all([qdrant.isReachable(), ollama.isReachable()]);
  return {
    status: "ok",
    qdrant: qd,
    sqlite: sqlite.isReachable(),
    ollama: ol,
  };
});
