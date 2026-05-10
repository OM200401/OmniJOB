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
  vector: VectorSchema,
  k: t.Optional(t.Integer({ minimum: 1, maximum: 200 })),
  // Raw user query text. When supplied, the server runs a hybrid keyword
  // pass alongside the vector search (RRF-fused) using tokens drawn from
  // the synonym dictionary in lib/query-expansion. Omit to fall back to
  // pure cosine ranking.
  query: t.Optional(t.String({ maxLength: 512 })),
  remote_status: t.Optional(t.Array(RemoteStatus)),
  experience_level: t.Optional(t.Array(Level)),
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
