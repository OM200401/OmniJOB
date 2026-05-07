// Diff `discovered.jsonl` against the slugs already present in
// `internal/sources/companies.go`. Emits a per-adapter list of NEW slugs
// (those discovered but not yet in companies.go), formatted as Go-syntax
// quoted strings ready to paste.
//
// Run: bun run cmd/discover/diff.ts <path/to/discovered.jsonl>

import { readFileSync } from "node:fs";
import { join } from "node:path";

const discoveredPath = process.argv[2] ?? "discovered.jsonl";
const companiesPath = process.argv[3] ?? join("internal", "sources", "companies.go");

type Hit = { company: string; adapter: string; slug: string; url: string };

const hits: Hit[] = readFileSync(discoveredPath, "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const companiesGo = readFileSync(companiesPath, "utf8");

// Extract slug strings between `var DefaultX = []string{` and the matching
// `}`. Crude but correct because every slug in companies.go is double-quoted.
const blockRe = /var\s+(Default\w+)\s*=\s*\[\]string\{([^}]+)\}/gs;
const slugRe = /"([^"]+)"/g;

const existing: Record<string, Set<string>> = {};
for (const m of companiesGo.matchAll(blockRe)) {
  const name = m[1]!.replace(/^Default/, "").toLowerCase();
  const slugs = new Set<string>();
  for (const s of m[2]!.matchAll(slugRe)) slugs.add(s[1]!.toLowerCase());
  existing[name] = slugs;
}

const byAdapter: Record<string, Hit[]> = {};
for (const h of hits) {
  byAdapter[h.adapter] ??= [];
  byAdapter[h.adapter]!.push(h);
}

let totalNew = 0;
for (const adapter of Object.keys(byAdapter).sort()) {
  const known = existing[adapter] ?? new Set<string>();
  const novel = byAdapter[adapter]!
    .filter((h) => !known.has(h.slug.toLowerCase()))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  if (novel.length === 0) continue;
  console.log(`\n// === ${adapter} (${novel.length} new) ===`);
  console.log(novel.map((h) => `\t"${h.slug}",`).join("\n"));
  totalNew += novel.length;
}
console.log(`\n// total NEW slugs: ${totalNew}`);
