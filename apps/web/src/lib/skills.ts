// Skills lexicon - flat, hand-curated list of canonical names with optional
// aliases. Extraction is a word-boundary case-insensitive scan; we deliberately
// lean toward false negatives over false positives so chips on the UI feel
// trustworthy. Add to this list rather than building cleverer matching - the
// taxonomy is the value.
//
// Names are the canonical display form. Aliases are alternate spellings or
// abbreviations that map back to the canonical name.
//
// Phase 1C: split into per-industry banks. The `SKILLS` array below stays
// as the tech bank (the original lexicon). Non-tech banks live in
// apps/web/src/lib/skills/*.ts and are routed through extractSkills via
// the inferred industry. SkillCategory grew to cover non-tech domains
// (certification, clinical, regulatory, specialty, operations, soft) -
// adding values is backwards-compatible since the UI doesn't gate render
// on the category.
import type { Industry } from "./crypto/vault";
import { HEALTHCARE_SKILLS } from "./skills/healthcare";
import { RETAIL_SKILLS } from "./skills/retail";
import { TRADES_SKILLS } from "./skills/trades";
import { GOVERNMENT_SKILLS } from "./skills/government";
import { FOOD_SERVICE_SKILLS } from "./skills/food_service";

export type SkillEntry = {
  name: string;
  aliases?: string[];
  category: SkillCategory;
};

export type SkillCategory =
  | "language"
  | "framework"
  | "runtime"
  | "database"
  | "cloud"
  | "devops"
  | "ml-ai"
  | "data"
  | "tooling"
  | "concept"
  // Non-tech categories introduced in Phase 1C. Used by the per-industry
  // banks for healthcare / retail / trades / government / food_service.
  | "certification"
  | "clinical"
  | "regulatory"
  | "specialty"
  | "operations"
  | "soft";

export const SKILLS: SkillEntry[] = [
  // Languages
  { name: "Python",           aliases: [],                                   category: "language" },
  { name: "JavaScript",       aliases: ["js"],                               category: "language" },
  { name: "TypeScript",       aliases: ["ts"],                               category: "language" },
  { name: "Go",               aliases: ["golang"],                           category: "language" },
  { name: "Rust",             aliases: [],                                   category: "language" },
  { name: "Java",             aliases: [],                                   category: "language" },
  { name: "Kotlin",           aliases: [],                                   category: "language" },
  { name: "Swift",            aliases: [],                                   category: "language" },
  { name: "Objective-C",      aliases: ["objc", "obj-c"],                    category: "language" },
  { name: "C++",              aliases: ["cpp"],                              category: "language" },
  { name: "C#",               aliases: ["csharp", "dotnet", ".net"],         category: "language" },
  { name: "Ruby",             aliases: [],                                   category: "language" },
  { name: "PHP",              aliases: [],                                   category: "language" },
  { name: "Scala",            aliases: [],                                   category: "language" },
  { name: "Elixir",           aliases: [],                                   category: "language" },
  { name: "Erlang",           aliases: [],                                   category: "language" },
  { name: "Haskell",          aliases: [],                                   category: "language" },
  { name: "Clojure",          aliases: [],                                   category: "language" },
  { name: "R",                aliases: [],                                   category: "language" },
  { name: "SQL",              aliases: [],                                   category: "language" },
  { name: "Bash",             aliases: ["shell scripting"],                  category: "language" },
  { name: "PowerShell",       aliases: [],                                   category: "language" },
  { name: "Perl",             aliases: [],                                   category: "language" },
  { name: "Dart",             aliases: [],                                   category: "language" },
  { name: "Lua",              aliases: [],                                   category: "language" },
  { name: "Solidity",         aliases: [],                                   category: "language" },
  { name: "GraphQL",          aliases: [],                                   category: "language" },

  // Frontend frameworks / libraries
  { name: "React",            aliases: ["reactjs", "react.js"],              category: "framework" },
  { name: "Vue",              aliases: ["vuejs", "vue.js"],                  category: "framework" },
  { name: "Angular",          aliases: [],                                   category: "framework" },
  { name: "Svelte",           aliases: ["sveltekit"],                        category: "framework" },
  { name: "Next.js",          aliases: ["nextjs"],                           category: "framework" },
  { name: "Nuxt",             aliases: ["nuxtjs", "nuxt.js"],                category: "framework" },
  { name: "Remix",            aliases: [],                                   category: "framework" },
  { name: "Astro",            aliases: [],                                   category: "framework" },
  { name: "Tailwind",         aliases: ["tailwindcss"],                      category: "framework" },
  { name: "Redux",            aliases: [],                                   category: "framework" },
  { name: "React Native",     aliases: [],                                   category: "framework" },
  { name: "Flutter",          aliases: [],                                   category: "framework" },

  // Backend frameworks
  { name: "Django",           aliases: [],                                   category: "framework" },
  { name: "Flask",            aliases: [],                                   category: "framework" },
  { name: "FastAPI",          aliases: [],                                   category: "framework" },
  { name: "Rails",            aliases: ["ruby on rails"],                    category: "framework" },
  { name: "Spring",           aliases: ["spring boot", "springboot"],        category: "framework" },
  { name: "Laravel",          aliases: [],                                   category: "framework" },
  { name: "Express",          aliases: ["expressjs", "express.js"],          category: "framework" },
  { name: "NestJS",           aliases: ["nest.js"],                          category: "framework" },
  { name: "Elysia",           aliases: [],                                   category: "framework" },
  { name: "Hono",             aliases: [],                                   category: "framework" },
  { name: "ASP.NET",          aliases: ["asp.net core"],                     category: "framework" },
  { name: "Phoenix",          aliases: [],                                   category: "framework" },
  { name: "Gin",              aliases: [],                                   category: "framework" },
  { name: "Echo",             aliases: [],                                   category: "framework" },
  { name: "Actix",            aliases: [],                                   category: "framework" },
  { name: "Axum",             aliases: [],                                   category: "framework" },

  // Runtimes
  { name: "Node.js",          aliases: ["nodejs", "node"],                   category: "runtime" },
  { name: "Deno",             aliases: [],                                   category: "runtime" },
  { name: "Bun",              aliases: [],                                   category: "runtime" },
  { name: "JVM",              aliases: [],                                   category: "runtime" },

  // Databases
  { name: "PostgreSQL",       aliases: ["postgres"],                         category: "database" },
  { name: "MySQL",            aliases: [],                                   category: "database" },
  { name: "MariaDB",          aliases: [],                                   category: "database" },
  { name: "SQLite",           aliases: [],                                   category: "database" },
  { name: "MongoDB",          aliases: ["mongo"],                            category: "database" },
  { name: "Redis",            aliases: [],                                   category: "database" },
  { name: "DynamoDB",         aliases: [],                                   category: "database" },
  { name: "Cassandra",        aliases: [],                                   category: "database" },
  { name: "Elasticsearch",    aliases: ["elastic search"],                   category: "database" },
  { name: "OpenSearch",       aliases: [],                                   category: "database" },
  { name: "ClickHouse",       aliases: [],                                   category: "database" },
  { name: "BigQuery",         aliases: [],                                   category: "database" },
  { name: "Snowflake",        aliases: [],                                   category: "database" },
  { name: "Redshift",         aliases: [],                                   category: "database" },
  { name: "Neo4j",            aliases: [],                                   category: "database" },
  { name: "Qdrant",           aliases: [],                                   category: "database" },
  { name: "Pinecone",         aliases: [],                                   category: "database" },
  { name: "Weaviate",         aliases: [],                                   category: "database" },
  { name: "Milvus",           aliases: [],                                   category: "database" },

  // Cloud
  { name: "AWS",              aliases: ["amazon web services"],              category: "cloud" },
  { name: "GCP",              aliases: ["google cloud", "google cloud platform"], category: "cloud" },
  { name: "Azure",            aliases: ["microsoft azure"],                  category: "cloud" },
  { name: "DigitalOcean",     aliases: [],                                   category: "cloud" },
  { name: "Cloudflare",       aliases: [],                                   category: "cloud" },
  { name: "Vercel",           aliases: [],                                   category: "cloud" },
  { name: "Netlify",          aliases: [],                                   category: "cloud" },
  { name: "Heroku",           aliases: [],                                   category: "cloud" },
  { name: "Lambda",           aliases: ["aws lambda"],                       category: "cloud" },
  { name: "S3",               aliases: ["aws s3"],                           category: "cloud" },
  { name: "EC2",              aliases: ["aws ec2"],                          category: "cloud" },
  { name: "Cloud Run",        aliases: [],                                   category: "cloud" },
  { name: "Cloud Functions",  aliases: [],                                   category: "cloud" },

  // DevOps / Infra
  { name: "Docker",           aliases: [],                                   category: "devops" },
  { name: "Kubernetes",       aliases: ["k8s"],                              category: "devops" },
  { name: "Terraform",        aliases: [],                                   category: "devops" },
  { name: "Pulumi",           aliases: [],                                   category: "devops" },
  { name: "Ansible",          aliases: [],                                   category: "devops" },
  { name: "Helm",             aliases: [],                                   category: "devops" },
  { name: "Istio",            aliases: [],                                   category: "devops" },
  { name: "Jenkins",          aliases: [],                                   category: "devops" },
  { name: "GitHub Actions",   aliases: ["github-actions"],                   category: "devops" },
  { name: "GitLab CI",        aliases: ["gitlab-ci"],                        category: "devops" },
  { name: "CircleCI",         aliases: ["circle ci"],                        category: "devops" },
  { name: "ArgoCD",           aliases: ["argo cd"],                          category: "devops" },
  { name: "Prometheus",       aliases: [],                                   category: "devops" },
  { name: "Grafana",          aliases: [],                                   category: "devops" },
  { name: "Datadog",          aliases: [],                                   category: "devops" },
  { name: "Sentry",           aliases: [],                                   category: "devops" },
  { name: "OpenTelemetry",    aliases: ["otel"],                             category: "devops" },
  { name: "Linux",            aliases: [],                                   category: "devops" },
  { name: "Nginx",            aliases: [],                                   category: "devops" },
  { name: "HAProxy",          aliases: [],                                   category: "devops" },
  { name: "Envoy",            aliases: [],                                   category: "devops" },

  // ML / AI
  { name: "PyTorch",          aliases: [],                                   category: "ml-ai" },
  { name: "TensorFlow",       aliases: [],                                   category: "ml-ai" },
  { name: "JAX",              aliases: [],                                   category: "ml-ai" },
  { name: "Keras",            aliases: [],                                   category: "ml-ai" },
  { name: "scikit-learn",     aliases: ["sklearn"],                          category: "ml-ai" },
  { name: "Hugging Face",     aliases: ["huggingface"],                      category: "ml-ai" },
  { name: "LangChain",        aliases: [],                                   category: "ml-ai" },
  { name: "LlamaIndex",       aliases: ["llama-index"],                      category: "ml-ai" },
  { name: "OpenAI",           aliases: [],                                   category: "ml-ai" },
  { name: "RAG",              aliases: ["retrieval-augmented generation"],   category: "ml-ai" },
  { name: "LLM",              aliases: ["large language model"],             category: "ml-ai" },
  { name: "Fine-tuning",      aliases: ["finetuning"],                       category: "ml-ai" },
  { name: "Embeddings",       aliases: [],                                   category: "ml-ai" },
  { name: "NLP",              aliases: ["natural language processing"],      category: "ml-ai" },
  { name: "Computer Vision",  aliases: ["cv"],                               category: "ml-ai" },
  { name: "Reinforcement Learning", aliases: ["rl"],                         category: "ml-ai" },
  { name: "MLOps",            aliases: [],                                   category: "ml-ai" },
  { name: "Pandas",           aliases: [],                                   category: "ml-ai" },
  { name: "NumPy",            aliases: [],                                   category: "ml-ai" },

  // Data engineering
  { name: "Spark",            aliases: ["apache spark"],                     category: "data" },
  { name: "Kafka",            aliases: ["apache kafka"],                     category: "data" },
  { name: "Airflow",          aliases: ["apache airflow"],                   category: "data" },
  { name: "Dagster",          aliases: [],                                   category: "data" },
  { name: "Prefect",          aliases: [],                                   category: "data" },
  { name: "dbt",              aliases: [],                                   category: "data" },
  { name: "Flink",            aliases: ["apache flink"],                     category: "data" },
  { name: "Hadoop",           aliases: [],                                   category: "data" },
  { name: "Hive",             aliases: [],                                   category: "data" },
  { name: "Trino",            aliases: ["presto"],                           category: "data" },
  { name: "ETL",              aliases: [],                                   category: "data" },

  // Tooling
  { name: "Git",              aliases: [],                                   category: "tooling" },
  { name: "GitHub",           aliases: [],                                   category: "tooling" },
  { name: "GitLab",           aliases: [],                                   category: "tooling" },
  { name: "Bitbucket",        aliases: [],                                   category: "tooling" },
  { name: "Jira",             aliases: [],                                   category: "tooling" },
  { name: "Confluence",       aliases: [],                                   category: "tooling" },
  { name: "Figma",            aliases: [],                                   category: "tooling" },
  { name: "Webpack",          aliases: [],                                   category: "tooling" },
  { name: "Vite",             aliases: [],                                   category: "tooling" },
  { name: "esbuild",          aliases: [],                                   category: "tooling" },
  { name: "Rollup",           aliases: [],                                   category: "tooling" },

  // Concepts / patterns
  { name: "Microservices",        aliases: [],                               category: "concept" },
  { name: "Event-Driven",         aliases: ["event driven"],                 category: "concept" },
  { name: "REST",                 aliases: ["restful"],                      category: "concept" },
  { name: "gRPC",                 aliases: [],                               category: "concept" },
  { name: "WebSockets",           aliases: [],                               category: "concept" },
  { name: "OAuth",                aliases: ["oauth2"],                       category: "concept" },
  { name: "JWT",                  aliases: [],                               category: "concept" },
  { name: "CI/CD",                aliases: ["continuous integration", "continuous delivery"], category: "concept" },
  { name: "TDD",                  aliases: ["test-driven development"],      category: "concept" },
  { name: "DDD",                  aliases: ["domain-driven design"],         category: "concept" },
  { name: "CQRS",                 aliases: [],                               category: "concept" },
  { name: "Distributed Systems",  aliases: [],                               category: "concept" },
  { name: "Concurrency",          aliases: [],                               category: "concept" },
  { name: "Performance Optimization", aliases: ["perf optimization"],        category: "concept" },
  { name: "System Design",        aliases: [],                               category: "concept" },
  { name: "Cryptography",         aliases: [],                               category: "concept" },
  { name: "Security",             aliases: ["infosec"],                      category: "concept" },
  { name: "Accessibility",        aliases: ["a11y"],                         category: "concept" },
  { name: "WebGL",                aliases: [],                               category: "concept" },
  { name: "WebAssembly",          aliases: ["wasm"],                         category: "concept" },
];

// Build the matcher once. For each entry, we accept the canonical name OR any
// alias as a hit. Word-boundary matching avoids "javascripty" → "JavaScript",
// but punctuation in names like "C#", "C++", "Next.js" needs the regex
// special-chars escaped. We do *not* use \b on either side of names that
// start/end with punctuation - \b is a transition between \w and non-\w, and
// "+", "#", "." are non-\w, so \b would never match next to them.
type CompiledEntry = SkillEntry & { regex: RegExp };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function leftBoundary(s: string): string {
  // Use \b only if the term starts with a word character.
  return /^\w/.test(s) ? "\\b" : "(?:^|[^\\w])";
}
function rightBoundary(s: string): string {
  return /\w$/.test(s) ? "\\b" : "(?:[^\\w]|$)";
}

function compile(entry: SkillEntry): CompiledEntry {
  const terms = [entry.name, ...(entry.aliases ?? [])];
  const parts = terms
    .map(escapeRegExp)
    .map((t) => `${leftBoundary(t)}${t}${rightBoundary(t)}`);
  const regex = new RegExp(`(?:${parts.join("|")})`, "i");
  return { ...entry, regex };
}

const COMPILED_TECH: CompiledEntry[] = SKILLS.map(compile);

// Per-industry lexicon registry. Each entry compiles its bank lazily on the
// first extractSkills call for that industry. Tech is the default fallback
// when no industry hint is provided.
const LEXICONS: Partial<Record<Industry, SkillEntry[]>> = {
  tech: SKILLS,
  healthcare: HEALTHCARE_SKILLS,
  retail: RETAIL_SKILLS,
  food_service: FOOD_SERVICE_SKILLS,
  trades: TRADES_SKILLS,
  government: GOVERNMENT_SKILLS,
};

// Compiled cache. Lazily populated so the regex compilation cost is only
// paid for industries actually consulted at runtime.
const COMPILED_CACHE: Partial<Record<Industry, CompiledEntry[]>> = {
  tech: COMPILED_TECH,
};

function compiledFor(industry: Industry): CompiledEntry[] {
  const cached = COMPILED_CACHE[industry];
  if (cached) return cached;
  const bank = LEXICONS[industry];
  if (!bank) return COMPILED_TECH; // Fallback to tech when no bank exists.
  const compiled = bank.map(compile);
  COMPILED_CACHE[industry] = compiled;
  return compiled;
}

export type ExtractedSkill = {
  name: string;
  category: SkillCategory;
};

// Returns canonical skill names found in `text`, in original order, deduped.
// `industry` (when known) selects the per-industry lexicon - for a "Registered
// Nurse" job the healthcare bank is used instead of the tech bank, so the
// SkillsPanel finds the relevant matches. Omitting `industry` defaults to
// the tech lexicon (back-compat with existing callers).
export function extractSkills(text: string, industry?: Industry): ExtractedSkill[] {
  if (!text) return [];
  const compiled = industry ? compiledFor(industry) : COMPILED_TECH;
  const seen = new Set<string>();
  const out: ExtractedSkill[] = [];
  for (const entry of compiled) {
    if (seen.has(entry.name)) continue;
    if (entry.regex.test(text)) {
      seen.add(entry.name);
      out.push({ name: entry.name, category: entry.category });
    }
  }
  return out;
}

// Compares two skill sets by name. Returns:
//  - matched: skills present in both
//  - missing: skills in `job` but not `resume`
//  - extra:   skills in `resume` but not `job` (unused here, but useful)
export function diffSkills(
  resumeSkills: ExtractedSkill[],
  jobSkills: ExtractedSkill[],
): {
  matched: ExtractedSkill[];
  missing: ExtractedSkill[];
  extra: ExtractedSkill[];
} {
  const resumeNames = new Set(resumeSkills.map((s) => s.name));
  const jobNames = new Set(jobSkills.map((s) => s.name));
  return {
    matched: jobSkills.filter((s) => resumeNames.has(s.name)),
    missing: jobSkills.filter((s) => !resumeNames.has(s.name)),
    extra: resumeSkills.filter((s) => !jobNames.has(s.name)),
  };
}
