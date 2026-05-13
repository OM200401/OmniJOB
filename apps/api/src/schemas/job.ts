import { t } from "elysia";

export const RemoteStatus = t.Union([
  t.Literal("remote"),
  t.Literal("hybrid"),
  t.Literal("onsite"),
  t.Literal("unknown"),
]);

export const Level = t.Union([
  t.Literal("intern"),
  t.Literal("junior"),
  t.Literal("mid"),
  t.Literal("senior"),
  t.Literal("staff"),
  t.Literal("principal"),
  t.Literal("manager"),
  t.Literal("director"),
  t.Literal("executive"),
]);

export const Source = t.Union([
  t.Literal("greenhouse"),
  t.Literal("lever"),
  t.Literal("ashby"),
  t.Literal("smartrecruiters"),
  t.Literal("workable"),
  t.Literal("recruitee"),
]);

// Industry rollup. Kept stable; new verticals add literals here rather than
// invent ad-hoc strings. "other" is the explicit catch-all so callers can
// tell "we don't know" apart from "we forgot to classify".
export const Industry = t.Union([
  t.Literal("tech"),
  t.Literal("healthcare"),
  t.Literal("retail"),
  t.Literal("food_service"),
  t.Literal("trades"),
  t.Literal("government"),
  t.Literal("education"),
  t.Literal("finance"),
  t.Literal("manufacturing"),
  t.Literal("logistics"),
  t.Literal("legal"),
  t.Literal("nonprofit"),
  t.Literal("media"),
  t.Literal("science"),
  t.Literal("other"),
]);

// Job family is a finer rollup than industry. Free string but normalized
// snake_case slug ("registered_nurse", "software_engineering", "cashier"); see
// JOB_FAMILY_RULES in lib/industry.ts for the canonical bank.
const JobFamily = t.String({ minLength: 1, maxLength: 64, pattern: "^[a-z0-9_]+$" });

// Adapter-emitted period strings vary ("annual" vs "year" vs "yearly" vs
// "per year"). Accept the common aliases at the API boundary; the salary
// library maps every accepted form to its canonical multiplier.
export const SalaryPeriod = t.Union([
  t.Literal("annual"),
  t.Literal("year"),
  t.Literal("yearly"),
  t.Literal("monthly"),
  t.Literal("month"),
  t.Literal("weekly"),
  t.Literal("week"),
  t.Literal("biweek"),
  t.Literal("biweekly"),
  t.Literal("daily"),
  t.Literal("day"),
  t.Literal("hourly"),
  t.Literal("hour"),
]);

const Country = t.String({ pattern: "^[A-Z]{2}$" });
const Currency = t.String({ pattern: "^[A-Z]{3}$" });

export const JobMetadataSchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 512 }),
  company: t.String({ minLength: 1, maxLength: 256 }),
  location: t.String({ maxLength: 512 }),
  country: t.Optional(Country),
  salary_range: t.Optional(t.String({ maxLength: 128 })),
  salary_min: t.Optional(t.Number({ minimum: 0 })),
  salary_max: t.Optional(t.Number({ minimum: 0 })),
  salary_currency: t.Optional(Currency),
  salary_period: t.Optional(SalaryPeriod),
  remote_status: t.Optional(RemoteStatus),
  experience_level: t.Optional(Level),
  // Industry / job_family are derived server-side at ingest if absent (see
  // upsertJob calling classifyIndustry). Crawlers MAY pre-fill them, but the
  // canonical labelling lives in apps/api/src/lib/industry.ts.
  industry: t.Optional(Industry),
  job_family: t.Optional(JobFamily),
  source: t.Optional(t.String({ maxLength: 64 })),
  source_url: t.String({ maxLength: 2048 }),
  scraped_at: t.Number(),
  posted_at: t.Optional(t.Number()),
  description: t.Optional(t.String({ maxLength: 100_000 })),
});

const VectorSchema = t.Array(t.Number());

export const JobIngestSchema = t.Object({
  id: t.String({ minLength: 1 }),
  vector: VectorSchema,
  metadata: JobMetadataSchema,
});

export const JobSearchSchema = t.Object({
  // Optional: omit for "browse" mode where the server returns recent jobs
  // ordered by scraped_at desc instead of doing ANN ranking. Used when the
  // caller has neither a résumé embedding nor a typed query.
  vector: t.Optional(VectorSchema),
  k: t.Optional(t.Integer({ minimum: 1, maximum: 200 })),
  // Page offset into the post-filter result pool. Default 0 (first page).
  // Bounded by max candidate pool (fetchK ceiling is 300, but the filtered
  // total is what matters; the route clamps an out-of-range offset to an
  // empty hits array while preserving `total` for the UI page math.
  offset: t.Optional(t.Integer({ minimum: 0, maximum: 200, default: 0 })),
  // Raw user query text. When supplied, the server runs a hybrid keyword
  // pass alongside the vector search (RRF-fused) using tokens drawn from
  // the synonym dictionary in lib/query-expansion. Omit to fall back to
  // pure cosine ranking.
  query: t.Optional(t.String({ maxLength: 512 })),
  remote_status: t.Optional(t.Array(RemoteStatus)),
  experience_level: t.Optional(t.Array(Level)),
  industry: t.Optional(t.Array(Industry)),
  job_family: t.Optional(t.Array(JobFamily)),
  source: t.Optional(t.Array(Source)),
  country: t.Optional(t.Array(Country)),
  location: t.Optional(t.String({ maxLength: 256 })),
  company: t.Optional(t.String({ maxLength: 256 })),
  // USD-annual equivalents - server normalizes per-job before filtering.
  salary_min_usd: t.Optional(t.Number({ minimum: 0 })),
  salary_max_usd: t.Optional(t.Number({ minimum: 0 })),
  require_salary: t.Optional(t.Boolean()),
  max_age_days: t.Optional(t.Integer({ minimum: 1, maximum: 3650 })),
});
