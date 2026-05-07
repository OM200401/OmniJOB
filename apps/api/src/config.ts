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

export const config = {
  port: num("PORT", 3000),
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
  },
  sqlite: {
    path: env("SQLITE_PATH", "./data/omnijob.sqlite"),
  },
} as const;

export type Config = typeof config;
