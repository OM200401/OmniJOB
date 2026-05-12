// One-shot backfill: scroll every point in the jobs collection, run the
// industry classifier on title + description, and write back the inferred
// industry / job_family onto the payload. Safe to re-run - idempotent against
// the same classifier output. Skips points that already have an industry
// (so re-running after a future classifier refresh requires --force).
//
// Usage:
//   bun run apps/api/scripts/backfill-industry.ts            # tag missing only
//   bun run apps/api/scripts/backfill-industry.ts --force    # re-classify all
//   bun run apps/api/scripts/backfill-industry.ts --dry-run  # show counts only
//
// The scroll uses a page size of 256 and updates payloads in batches of 64
// via Qdrant's setPayload API (one network call per batch, much cheaper than
// per-point upsert with a vector).

import { qdrant, ensureIndustryIndexes } from "../src/qdrant/client";
import { config } from "../src/config";
import { classifyIndustry, type Industry } from "../src/lib/industry";

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const DRY_RUN = args.has("--dry-run");

const PAGE_SIZE = 256;
const UPDATE_BATCH = 64;

type Point = {
  id: string | number;
  payload?: Record<string, unknown> | null;
};

type Update = {
  pointId: string | number;
  industry: Industry;
  jobFamily: string | undefined;
};

async function applyBatch(updates: Update[]): Promise<void> {
  if (DRY_RUN || updates.length === 0) return;
  // setPayload merges keys onto the existing payload rather than replacing it,
  // which is exactly what we want here - we're adding industry/job_family and
  // not touching title/company/vector/etc.
  await Promise.all(
    updates.map((u) =>
      qdrant.setPayload(config.qdrant.jobsCollection, {
        payload: u.jobFamily
          ? { industry: u.industry, job_family: u.jobFamily }
          : { industry: u.industry },
        points: [u.pointId],
        wait: false,
      }),
    ),
  );
}

async function main(): Promise<void> {
  console.log(
    `backfill-industry: collection="${config.qdrant.jobsCollection}" force=${FORCE} dry-run=${DRY_RUN}`,
  );

  // Make sure the keyword indexes exist before we start writing. setPayload
  // on an indexed field is what makes server-side industry filtering O(1)
  // later; running the script before the index exists would still work but
  // we'd have to wait for index build on every later search.
  await ensureIndustryIndexes();

  let scrolled = 0;
  let updated = 0;
  let skipped = 0;
  const byIndustry = new Map<Industry, number>();
  // Qdrant scroll cursor: string | number | Record<string, unknown> | null.
  // Mirror that here so we can pass it back into the next scroll call without
  // a type narrowing.
  let cursor: string | number | Record<string, unknown> | null = null;
  const batch: Update[] = [];

  while (true) {
    const res = await qdrant.scroll(config.qdrant.jobsCollection, {
      limit: PAGE_SIZE,
      with_payload: true,
      with_vector: false,
      ...(cursor !== null ? { offset: cursor } : {}),
    });
    const points = res.points as Point[];
    if (points.length === 0) break;

    for (const p of points) {
      scrolled += 1;
      const payload = (p.payload ?? {}) as Record<string, unknown>;
      const existingIndustry = typeof payload.industry === "string" ? (payload.industry as Industry) : undefined;
      if (existingIndustry && !FORCE) {
        skipped += 1;
        continue;
      }
      const title = typeof payload.title === "string" ? payload.title : "";
      const description = typeof payload.description === "string" ? payload.description : undefined;
      if (!title) {
        skipped += 1;
        continue;
      }
      const { industry, jobFamily } = classifyIndustry(title, description);
      byIndustry.set(industry, (byIndustry.get(industry) ?? 0) + 1);
      batch.push({ pointId: p.id, industry, jobFamily });
      updated += 1;
      if (batch.length >= UPDATE_BATCH) {
        await applyBatch(batch);
        batch.length = 0;
      }
    }

    cursor = (res.next_page_offset ?? null) as typeof cursor;
    if (cursor === null) break;
    if (scrolled % 1024 === 0) {
      console.log(`  ... scrolled=${scrolled} updated=${updated} skipped=${skipped}`);
    }
  }

  // Flush the last partial batch.
  await applyBatch(batch);

  console.log("\nResult:");
  console.log(`  scrolled : ${scrolled}`);
  console.log(`  updated  : ${updated}${DRY_RUN ? " (dry-run; no writes)" : ""}`);
  console.log(`  skipped  : ${skipped}${FORCE ? "" : " (already had industry)"}`);
  console.log(`\nDistribution:`);
  const sorted = Array.from(byIndustry.entries()).sort((a, b) => b[1] - a[1]);
  for (const [industry, count] of sorted) {
    console.log(`  ${industry.padEnd(16)} ${count}`);
  }
}

await main();
