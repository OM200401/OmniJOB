import {
  qdrant,
  ensureCountryIndex,
  ensureIndustryIndexes,
  ensureScrapedAtIndex,
  ensureTitleFullTextIndex,
} from "../src/qdrant/client";
import { config } from "../src/config";

async function ensureCollection(name: string, dim: number) {
  const existing = await qdrant.getCollections();
  const found = existing.collections.find((c) => c.name === name);

  if (found) {
    const info = await qdrant.getCollection(name);
    const vec = info.config?.params?.vectors;
    const currentDim =
      typeof vec === "object" && vec !== null && "size" in vec
        ? (vec as { size: number }).size
        : undefined;

    if (currentDim === dim) {
      console.log(`✓ collection "${name}" already correct (dim=${dim})`);
      return;
    }

    console.log(
      `! collection "${name}" exists with dim=${currentDim}, recreating at dim=${dim}`,
    );
    await qdrant.deleteCollection(name);
  }

  await qdrant.createCollection(name, {
    vectors: { size: dim, distance: "Cosine" },
  });
  console.log(`+ created collection "${name}" (dim=${dim}, cosine)`);
}

await ensureCollection(config.qdrant.jobsCollection, config.qdrant.embeddingDim);
await ensureCollection(config.qdrant.usersCollection, config.qdrant.embeddingDim);
// Full-text payload index on title powers the hybrid keyword pass in
// /jobs/search. Idempotent; safe to re-run on already-migrated indexes.
await ensureTitleFullTextIndex();
console.log(`+ ensured full-text payload index on "${config.qdrant.jobsCollection}.title"`);
// Keyword payload indexes on industry + job_family so industry filters in
// /jobs/search use Qdrant's hash lookup instead of full-scan.
await ensureIndustryIndexes();
console.log(`+ ensured keyword payload indexes on "${config.qdrant.jobsCollection}.{industry,job_family}"`);
// Integer payload index on scraped_at so the vectorless browse path can
// scroll points ordered by recency.
await ensureScrapedAtIndex();
console.log(`+ ensured integer payload index on "${config.qdrant.jobsCollection}.scraped_at"`);
// Keyword payload index on country so the country filter is a Qdrant hash
// lookup rather than a full-collection scroll + in-memory match.
await ensureCountryIndex();
console.log(`+ ensured keyword payload index on "${config.qdrant.jobsCollection}.country"`);
console.log("Qdrant init complete.");
