// Merge newly-discovered slugs into companies.go. For each adapter, finds the
// `var Default<Name> = []string{ ... }` block and appends the new slugs
// inside the brace, with a per-run section header so the provenance is
// visible in the diff.
//
// Run: bun run cmd/discover/merge.ts <discovered.jsonl> [<companies.go>]

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const discoveredPath = process.argv[2] ?? "discovered.jsonl";
const companiesPath = process.argv[3] ?? join("internal", "sources", "companies.go");

type Hit = { company: string; adapter: string; slug: string; url: string };

const hits: Hit[] = readFileSync(discoveredPath, "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));

let companiesGo = readFileSync(companiesPath, "utf8");

const blockRe = /(var\s+(Default\w+)\s*=\s*\[\]string\{)([^}]+)(\})/gs;
const slugRe = /"([^"]+)"/g;

const today = new Date().toISOString().slice(0, 10);

const byAdapter: Record<string, Hit[]> = {};
for (const h of hits) {
  byAdapter[h.adapter] ??= [];
  byAdapter[h.adapter]!.push(h);
}

let totalAdded = 0;
companiesGo = companiesGo.replace(blockRe, (_, head, name, body, tail) => {
  const adapter = String(name).replace(/^Default/, "").toLowerCase();
  const found = byAdapter[adapter];
  if (!found || found.length === 0) return head + body + tail;

  const existing = new Set<string>();
  for (const m of String(body).matchAll(slugRe)) {
    existing.add(m[1]!.toLowerCase());
  }
  const novel = found
    .filter((h) => !existing.has(h.slug.toLowerCase()))
    .map((h) => h.slug)
    .sort();
  // De-dupe within the novel set in case slugVariants happened to find the
  // same slug for two different seed names.
  const novelUnique = [...new Set(novel)];
  if (novelUnique.length === 0) return head + body + tail;

  const insertion =
    `\n\n\t// auto-discovered ${today} (${novelUnique.length})\n` +
    novelUnique.map((s) => `\t"${s}",`).join("\n") +
    `\n`;

  totalAdded += novelUnique.length;
  // Trim trailing whitespace from body so the insertion lands cleanly.
  const trimmed = String(body).replace(/\s+$/, "");
  return `${head}${trimmed}${insertion}${tail}`;
});

writeFileSync(companiesPath, companiesGo);
console.log(`merged ${totalAdded} new slugs into ${companiesPath}`);
