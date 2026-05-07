// "Why this match" - chunked cosine between résumé and job description.
// We embed N chunks of each side via Ollama in one batch and surface the
// top-K résumé↔job phrase pairs by cosine similarity.

import { embedBatch } from "../embed/ollama";

const MAX_CHUNKS_PER_SIDE = 25;
const CHUNK_MIN_CHARS = 40;
const CHUNK_MAX_CHARS = 280;

export type Pair = {
  resume: string;
  job: string;
  score: number;
};

// Splits text into sentence-ish chunks within (CHUNK_MIN_CHARS, CHUNK_MAX_CHARS).
// Sentences are merged when too short and split when too long.
export function chunk(text: string): string[] {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) return [];

  // Split on terminal punctuation + bullet-style line breaks. Keep
  // non-ASCII em-dashes / colons as soft splits when needed.
  const pieces = collapsed
    .split(/(?<=[.!?])\s+|\s*[••]\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const out: string[] = [];
  let buf = "";
  for (const p of pieces) {
    if (p.length > CHUNK_MAX_CHARS) {
      if (buf) {
        out.push(buf);
        buf = "";
      }
      // Hard-window long pieces.
      for (let i = 0; i < p.length; i += CHUNK_MAX_CHARS) {
        out.push(p.slice(i, i + CHUNK_MAX_CHARS).trim());
      }
      continue;
    }
    if (buf.length + p.length + 1 <= CHUNK_MAX_CHARS) {
      buf = buf ? `${buf} ${p}` : p;
    } else {
      if (buf.length >= CHUNK_MIN_CHARS) out.push(buf);
      buf = p;
    }
  }
  if (buf.length >= CHUNK_MIN_CHARS) out.push(buf);
  return out;
}

// Cosine similarity of two vectors.
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Return the top-K résumé/job phrase pairs by cosine similarity.
 * Constraints: each résumé chunk and each job chunk can appear at most once
 * across the result set, so the surfaced pairs span the full match instead
 * of clustering on a single sentence.
 */
export async function explainMatch(
  resumeText: string,
  jobText: string,
  topK = 4,
): Promise<Pair[]> {
  const rChunks = chunk(resumeText).slice(0, MAX_CHUNKS_PER_SIDE);
  const jChunks = chunk(jobText).slice(0, MAX_CHUNKS_PER_SIDE);
  if (rChunks.length === 0 || jChunks.length === 0) return [];

  const all = await embedBatch([...rChunks, ...jChunks]);
  const rVecs = all.slice(0, rChunks.length);
  const jVecs = all.slice(rChunks.length);

  // All-pairs similarity, then greedy top-K with row/col deduplication.
  type Cell = { i: number; j: number; score: number };
  const cells: Cell[] = [];
  for (let i = 0; i < rVecs.length; i++) {
    for (let j = 0; j < jVecs.length; j++) {
      cells.push({ i, j, score: cosine(rVecs[i]!, jVecs[j]!) });
    }
  }
  cells.sort((a, b) => b.score - a.score);

  const usedI = new Set<number>();
  const usedJ = new Set<number>();
  const out: Pair[] = [];
  for (const c of cells) {
    if (out.length >= topK) break;
    if (usedI.has(c.i) || usedJ.has(c.j)) continue;
    usedI.add(c.i);
    usedJ.add(c.j);
    out.push({ resume: rChunks[c.i]!, job: jChunks[c.j]!, score: Math.round(c.score * 1000) / 1000 });
  }
  return out;
}
