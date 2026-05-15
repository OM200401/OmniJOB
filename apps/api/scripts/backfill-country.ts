// One-shot backfill: scroll every point in the jobs collection, run the
// country classifier on `payload.location`, and rewrite `payload.country`
// when the classifier output disagrees with the stored value. Idempotent:
// re-running finds zero divergences.
//
// Motivation: the sitemap crawler used to stamp `feed.Country` onto every
// posting in 47 CA-labelled feeds (Dollar Tree, FedEx, Marriott, Walmart
// Canada, etc.) BEFORE running classifyCountry on the actual location
// string. The fix in sitemap.go swaps the priority going forward; this
// script cleans the rows already in Qdrant. Also catches Ukraine, Hungary,
// etc., which the classifier dictionaries didn't recognize before today's
// additions to apps/api/src/lib/location.ts.
//
// Behaviour per point:
//   1. If stored country == classifier output                    → skip
//   2. If classifier returns null and stored country is non-empty → skip
//      (the stored value is our only signal; don't blank it)
//   3. If classifier returns non-null and disagrees with stored   → UPDATE
//      to the classifier's value
//   4. If both empty                                              → skip
//
// Usage:
//   bun run apps/api/scripts/backfill-country.ts             # apply updates
//   bun run apps/api/scripts/backfill-country.ts --dry-run   # show counts only
//
// Scroll uses 1000-point pages; setPayload batches group all points sharing
// the same new country code into one HTTP call, so the typical
// "CA -> US: 600 points" transition runs as a single round-trip.

import { qdrant } from "../src/qdrant/client";
import { config } from "../src/config";
import { classifyCountry } from "../src/lib/location";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");

const PAGE_SIZE = 1000;

type Point = {
  id: string | number;
  payload?: Record<string, unknown> | null;
};

async function applyBatch(
  newCountry: string,
  ids: Array<string | number>,
): Promise<void> {
  if (DRY_RUN || ids.length === 0) return;
  // Single setPayload call covers all points transitioning to the same new
  // country. wait:false because per-point durability isn't critical here -
  // any failure surfaces in the next scroll pass.
  await qdrant.setPayload(config.qdrant.jobsCollection, {
    payload: { country: newCountry },
    points: ids,
    wait: false,
  });
}

async function main(): Promise<void> {
  console.log(
    `backfill-country: collection="${config.qdrant.jobsCollection}" dry-run=${DRY_RUN}`,
  );

  let scrolled = 0;
  let updated = 0;
  let skipped = 0;
  let unresolvable = 0; // classifier returned null, no stored country either
  // Tally transitions for the post-run summary, e.g. "CA -> US" -> 612.
  const transitions = new Map<string, number>();
  // Accumulate setPayload batches keyed by the destination country. When a
  // bucket fills (or scroll exhausts) it's flushed in one HTTP call.
  const BATCH_FLUSH = 256;
  const pending = new Map<string, Array<string | number>>();

  async function flushBucket(country: string): Promise<void> {
    const ids = pending.get(country);
    if (!ids || ids.length === 0) return;
    await applyBatch(country, ids);
    pending.set(country, []);
  }

  async function flushAll(): Promise<void> {
    await Promise.all(Array.from(pending.keys()).map(flushBucket));
  }

  let cursor: string | number | Record<string, unknown> | null = null;

  while (true) {
    const res = await qdrant.scroll(config.qdrant.jobsCollection, {
      limit: PAGE_SIZE,
      with_payload: ["country", "location"],
      with_vector: false,
      ...(cursor !== null ? { offset: cursor } : {}),
    });
    const points = res.points as Point[];
    if (points.length === 0) break;

    for (const p of points) {
      scrolled += 1;
      const payload = (p.payload ?? {}) as Record<string, unknown>;
      const stored =
        typeof payload.country === "string" && payload.country.length > 0
          ? payload.country
          : "";
      const location =
        typeof payload.location === "string" ? payload.location : "";

      const classified = classifyCountry(location);

      if (!classified) {
        if (!stored) unresolvable += 1;
        else skipped += 1;
        continue;
      }
      if (stored === classified) {
        skipped += 1;
        continue;
      }

      const key = `${stored || "(empty)"} -> ${classified}`;
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

  // Flush remaining buckets before printing the summary.
  await flushAll();

  console.log("\nResult:");
  console.log(`  scrolled     : ${scrolled}`);
  console.log(`  updated      : ${updated}${DRY_RUN ? " (dry-run; no writes)" : ""}`);
  console.log(`  skipped      : ${skipped}`);
  console.log(`  unresolvable : ${unresolvable} (no location signal AND no stored country)`);
  console.log(`\nTransitions:`);
  const sorted = Array.from(transitions.entries()).sort((a, b) => b[1] - a[1]);
  for (const [transition, count] of sorted) {
    console.log(`  ${transition.padEnd(24)} ${count}`);
  }
}

await main();
