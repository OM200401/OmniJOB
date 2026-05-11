import { Elysia, t } from "elysia";
import { JobIngestSchema, JobSearchSchema } from "../schemas/job";
import { getJob, getJobSources, jobExists, searchJobs, upsertJob } from "../qdrant/client";
import { explainMatch } from "../lib/explain";
import { expansionFor } from "../lib/query-expansion";

export const jobs = new Elysia({ prefix: "/jobs" })
  .post(
    "/search",
    async ({ body }) => {
      const k = body.k ?? 25;
      // Pull keyword tokens from the synonym dictionary when the caller
      // forwards the raw query text. Unknown queries fall through to a
      // single-token keyword pass on the raw string, which still helps
      // for ATS-canonical terms ("rust", "kubernetes") not in the dict.
      const keywords = body.query ? expansionFor(body.query).keywords : [];
      const result = await searchJobs(
        body.vector,
        k,
        {
          ...(body.remote_status ? { remote_status: body.remote_status } : {}),
          ...(body.experience_level ? { experience_level: body.experience_level } : {}),
          ...(body.source ? { source: body.source } : {}),
          ...(body.country ? { country: body.country } : {}),
          ...(body.location ? { location: body.location } : {}),
          ...(body.company ? { company: body.company } : {}),
          ...(body.salary_min_usd !== undefined ? { salary_min_usd: body.salary_min_usd } : {}),
          ...(body.salary_max_usd !== undefined ? { salary_max_usd: body.salary_max_usd } : {}),
          ...(body.require_salary !== undefined ? { require_salary: body.require_salary } : {}),
          ...(body.max_age_days !== undefined ? { max_age_days: body.max_age_days } : {}),
        },
        { keywords },
      );
      return { hits: result.hits, total: result.total };
    },
    { body: JobSearchSchema },
  )
  .get(
    "/:id",
    async ({ params, status }) => {
      const meta = await getJob(params.id);
      if (!meta) return status(404, { error: "job not found" });
      return { id: params.id, payload: meta };
    },
    { params: t.Object({ id: t.String({ minLength: 1, maxLength: 256 }) }) },
  )
  // Cheap pre-embed check for the crawler. Lets a worker skip jobs
  // already in Qdrant before paying the Ollama embed roundtrip.
  .get(
    "/:id/exists",
    async ({ params }) => {
      const exists = await jobExists(params.id);
      return { exists };
    },
    { params: t.Object({ id: t.String({ minLength: 1, maxLength: 256 }) }) },
  )
  // Surface every source the dedupe pass merged into this canonical, plus
  // the canonical's own source. Powers the "Verified across N sources" panel.
  .get(
    "/:id/sources",
    async ({ params, status }) => {
      const sources = await getJobSources(params.id);
      if (!sources) return status(404, { error: "job not found" });
      return sources;
    },
    { params: t.Object({ id: t.String({ minLength: 1, maxLength: 256 }) }) },
  )
  .post(
    "/:id/match-explain",
    async ({ params, body, status }) => {
      const meta = await getJob(params.id);
      if (!meta) return status(404, { error: "job not found" });
      const jobText = [meta.title, meta.description ?? ""].filter(Boolean).join("\n\n");
      const pairs = await explainMatch(body.resume_text, jobText);
      return { id: params.id, pairs };
    },
    {
      params: t.Object({ id: t.String({ minLength: 1, maxLength: 256 }) }),
      body: t.Object({
        resume_text: t.String({ minLength: 50, maxLength: 50_000 }),
      }),
    },
  )
  .post(
    "/ingest",
    async ({ body }) => {
      await upsertJob(body.id, body.vector, body.metadata);
      return { id: body.id, status: "ingested" };
    },
    { body: JobIngestSchema },
  );
