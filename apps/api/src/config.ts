const env = (key: string, fallback?: string): string => {
  const v = process.env[key];
  if (v !== undefined && v !== "") return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env var: ${key}`);
};

const num = (key: string, fallback: number): number => {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Env var ${key} is not a number: ${v}`);
  return n;
};

const list = (key: string, fallback: string[]): string[] => {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  return v.split(",").map((s) => s.trim()).filter(Boolean);
};

const isProd = process.env["NODE_ENV"] === "production";

export const config = {
  port: num("PORT", 3000),
  isProd,
  qdrant: {
    url: env("QDRANT_URL", "http://localhost:6333"),
    apiKey: process.env["QDRANT_API_KEY"] || undefined,
    jobsCollection: env("JOBS_COLLECTION", "jobs"),
    usersCollection: env("USERS_COLLECTION", "users"),
    embeddingDim: num("EMBEDDING_DIM", 768),
  },
  ollama: {
    url: env("OLLAMA_URL", "http://localhost:11434"),
    embedModel: env("OLLAMA_EMBED_MODEL", "nomic-embed-text"),
    // Hard cap on Ollama request time. The B2s VM running nomic-embed-text
    // serves a normal request in ~200ms; >30s means the model is wedged or
    // the queue is overwhelmed and clients should fail fast.
    timeoutMs: num("OLLAMA_TIMEOUT_MS", 30_000),
  },
  sqlite: {
    // Local dev default is relative — production sets SQLITE_PATH=
    // /var/lib/omnijob/users.db via infra/docker-compose.prod.yml so the
    // file lives on the host bind-mount rather than container CWD.
    path: env("SQLITE_PATH", "./data/omnijob.sqlite"),
  },
  security: {
    // Browser origins permitted to call the API. Prod must set this; in dev
    // the empty list lets @elysiajs/cors reflect the request origin (Vite
    // dev server, localhost variants).
    allowedOrigins: list("ALLOWED_ORIGINS", []),
    // Hard ceiling on request bodies. Largest legitimate payload is a job
    // ingest (768-dim vector + ~100 KB description ≈ 100 KB JSON). 1 MB
    // gives margin without inviting abuse.
    maxBodyBytes: num("MAX_BODY_BYTES", 1024 * 1024),
    // Append-only audit log for auth events. Defaults under the Azure VM's
    // host bind-mount so the file survives container restarts.
    auditLogPath: env("AUDIT_LOG_PATH", isProd ? "/var/lib/omnijob/audit.log" : "./data/audit.log"),
  },
} as const;

export type Config = typeof config;
