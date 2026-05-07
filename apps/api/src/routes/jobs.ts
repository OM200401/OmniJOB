import { Elysia, t } from "elysia";
import { JobIngestSchema, JobSearchSchema } from "../schemas/job";
import { getJob, searchJobs, upsertJob } from "../qdrant/client";
import { explainMatch } from "../lib/explain";

export const jobs = new Elysia({ prefix: "/jobs" })
  .post(
    "/search",
    async ({ body }) => {
      const k = body.k ?? 25;
      const hits = await searchJobs(body.vector, k, {
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
      });
      return { hits };
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
