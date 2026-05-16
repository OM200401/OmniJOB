// One-shot backfill: scroll every point in the jobs collection, run the
// new body-first seniority classifier, and rewrite `payload.experience_level`
// when the live classifier disagrees with the stored value (or fills in a
// previously-unset one).
//
// Motivation: the pre-2026-05-15 classifier was title-first with a narrow
// body-fallback regex. Many real postings have explicit YOE statements in
// the Experience/Qualifications section that the old classifier missed.
// The new body-first section-aware classifier (apps/api/src/lib/seniority.ts)
// gives the right answer at read time but stored payload values are stale;
// this script syncs them.
//
// Behaviour per point:
//   1. If classifier output matches stored                       → skip
//   2. If classifier returns null AND stored is set              → skip
//      (don't clear a stored value just because the live classifier can't
//      reproduce it; the stored one is the only signal left)
//   3. If classifier returns non-null AND disagrees with stored  → UPDATE
//   4. If both empty                                             → skip
//
// Usage:
//   bun run apps/api/scripts/backfill-level.ts             # apply updates
//   bun run apps/api/scripts/backfill-level.ts --dry-run   # show counts only
//
// Pattern mirrors apps/api/scripts/backfill-country.ts - scroll 1000 at a
// time, batch setPayload calls per destination value so a typical run
// dispatches one HTTP call per (old -> new) transition group.

import { qdrant } from "../src/qdrant/client";
import { config } from "../src/config";
import { classifyTitleOrBody, type Level } from "../src/lib/seniority";
import type { Industry } from "../src/lib/industry";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");

const PAGE_SIZE = 1000;

type Point = {
  id: string | number;
  payload?: Record<string, unknown> | null;
};

async function applyBatch(newLevel: Level, ids: Array<string | number>): Promise<void> {
  if (DRY_RUN || ids.length === 0) return;
  await qdrant.setPayload(config.qdrant.jobsCollection, {
    payload: { experience_level: newLevel },
    points: ids,
    wait: false,
  });
}

async function main(): Promise<void> {
  console.log(
    `backfill-level: collection="${config.qdrant.jobsCollection}" dry-run=${DRY_RUN}`,
  );

  let scrolled = 0;
  let updated = 0;
  let skipped = 0;
  let stillUnranked = 0; // both stored and classifier returned null
  const transitions = new Map<string, number>();
  const BATCH_FLUSH = 256;
  const pending = new Map<Level, Array<string | number>>();

  async function flushBucket(level: Level): Promise<void> {
    const ids = pending.get(level);
    if (!ids || ids.length === 0) return;
    await applyBatch(level, ids);
    pending.set(level, []);
  }
  async function flushAll(): Promise<void> {
    await Promise.all(Array.from(pending.keys()).map(flushBucket));
  }

  let cursor: string | number | Record<string, unknown> | null = null;

  while (true) {
    const res = await qdrant.scroll(config.qdrant.jobsCollection, {
      limit: PAGE_SIZE,
      with_payload: ["experience_level", "title", "description", "industry"],
      with_vector: false,
      ...(cursor !== null ? { offset: cursor } : {}),
    });
    const points = res.points as Point[];
    if (points.length === 0) break;

    for (const p of points) {
      scrolled += 1;
      const payload = (p.payload ?? {}) as Record<string, unknown>;
      const stored =
        typeof payload.experience_level === "string"
          ? (payload.experience_level as Level)
          : null;
      const title = typeof payload.title === "string" ? payload.title : "";
      const description =
        typeof payload.description === "string" ? payload.description : undefined;
      const industry =
        typeof payload.industry === "string" ? (payload.industry as Industry) : undefined;

      const classified = classifyTitleOrBody(title, description, industry);

      if (classified === null && stored === null) {
        stillUnranked += 1;
        continue;
      }
      if (classified === null) {
        // Don't clear a stored value when the classifier can't reproduce it -
        // the stored value is our only signal.
        skipped += 1;
        continue;
      }
      if (stored === classified) {
        skipped += 1;
        continue;
      }

      const key = `${stored ?? "(null)"} -> ${classified}`;
      transitions.set(key, (transitions.get(key) ?? 0) + 1);
      updated += 1;

      const bucket = pending.get(classified);
      if (bucket) bucket.push(p.id);
      else pending.set(classified, [p.id]);
      if ((pending.get(classified)?.length ?? 0) >= BATCH_FLUSH) {
        await flushBucket(classified);
      }
    }

    cursor = (res.next_page_offset ?? null) as typeof cursor;
    if (cursor === null) break;
    if (scrolled % (PAGE_SIZE * 5) === 0) {
      console.log(`  ... scrolled=${scrolled} updated=${updated} skipped=${skipped}`);
    }
  }

  await flushAll();

  console.log("\nResult:");
  console.log(`  scrolled        : ${scrolled}`);
  console.log(`  updated         : ${updated}${DRY_RUN ? " (dry-run; no writes)" : ""}`);
  console.log(`  skipped         : ${skipped} (stored value retained)`);
  console.log(`  still unranked  : ${stillUnranked} (neither stored nor classifier returned a level)`);
  console.log(`\nTransitions:`);
  const sorted = Array.from(transitions.entries()).sort((a, b) => b[1] - a[1]);
  for (const [transition, count] of sorted) {
    console.log(`  ${transition.padEnd(24)} ${count}`);
  }
}

await main();
