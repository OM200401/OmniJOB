import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { config } from "./config";
import { health } from "./routes/health";
import { jobs } from "./routes/jobs";
import { users } from "./routes/users";
import { match } from "./routes/match";
import { embed } from "./routes/embed";

const app = new Elysia()
  .use(cors())
  .use(health)
  .use(embed)
  .use(jobs)
  .use(users)
  .use(match)
  .onError(({ error, code, set, path }) => {
    if (code === "VALIDATION") {
      const e = error as { all?: unknown[]; message?: string };
      const detail = e.all ?? e.message ?? String(error);
      console.error(`[VALIDATION ${path}]`, JSON.stringify(detail, null, 2));
      set.status = 400;
      return { error: "validation", detail };
    }
    console.error(`[${code} ${path}]`, error instanceof Error ? error.stack ?? error.message : error);
    set.status = code === "NOT_FOUND" ? 404 : 500;
    return { error: code, message: error instanceof Error ? error.message : String(error) };
  })
  .listen(config.port);

console.log(`OmniJob API listening on http://localhost:${config.port}`);
console.log(`  Qdrant: ${config.qdrant.url}`);
console.log(`  Ollama: ${config.ollama.url} (model=${config.ollama.embedModel})`);
console.log(`  SQLite: ${config.sqlite.path}`);

export type App = typeof app;
