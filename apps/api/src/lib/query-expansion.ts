// Static synonym dictionary for query expansion. Job-search queries are
// dominated by a small set of compact terms ("new grad", "software", "ml")
// whose embeddings are information-poor relative to a longer phrase. We
// expand each known key into a natural-language gloss that we pass to the
// embedder instead of the raw query - the resulting vector lives in a
// richer region of latent space and pulls back more relevant matches.
//
// This is intentionally hand-curated rather than learned. A future iteration
// can swap in an LLM-driven expander; for now the static map covers the bulk
// of failing queries with zero added latency.

type Expansion = {
  // The text we actually send to the embedder. Joins canonical synonyms
  // as a fluent gloss so the embedder treats it as one semantic unit
  // rather than a bag of tokens.
  embedText: string;
  // Tokens used by the hybrid keyword pass. Lowercase, no duplicates,
  // ordered by specificity (most specific first - helps when the keyword
  // backend caps at one token).
  keywords: string[];
};

const RAW: Record<string, { embedText: string; keywords: string[] }> = {
  "new grad": {
    embedText:
      "new grad entry level junior graduate early career software engineer position with no prior industry experience required, 0-2 years experience",
    keywords: ["new grad", "graduate", "entry level", "junior", "associate", "early career"],
  },
  "newgrad": {
    embedText:
      "new grad entry level junior graduate early career position with no prior industry experience, 0-2 years experience",
    keywords: ["new grad", "graduate", "entry level", "junior", "early career"],
  },
  "grad": {
    embedText:
      "new grad graduate entry level junior early career role for recent university graduates",
    keywords: ["graduate", "new grad", "junior", "entry level"],
  },
  "graduate": {
    embedText:
      "graduate new grad entry level junior early career role for recent university graduates",
    keywords: ["graduate", "new grad", "junior", "entry level"],
  },
  "entry level": {
    embedText:
      "entry level junior new grad graduate associate early career role with 0-2 years experience",
    keywords: ["entry level", "junior", "new grad", "graduate", "associate"],
  },
  "entry-level": {
    embedText:
      "entry level junior new grad graduate associate early career role with 0-2 years experience",
    keywords: ["entry level", "junior", "new grad", "graduate", "associate"],
  },
  "junior": {
    embedText:
      "junior associate entry level new grad early career software engineer developer",
    keywords: ["junior", "associate", "entry level", "new grad"],
  },
  "intern": {
    embedText:
      "intern internship co-op summer internship student program early career",
    keywords: ["intern", "internship", "co-op"],
  },
  "internship": {
    embedText:
      "internship intern co-op summer internship student program early career",
    keywords: ["intern", "internship", "co-op"],
  },
  "senior": {
    embedText:
      "senior engineer staff principal lead experienced software engineer with 5+ years experience",
    keywords: ["senior", "staff", "lead", "principal"],
  },
  "staff": {
    embedText: "staff engineer senior principal lead experienced software engineer",
    keywords: ["staff", "principal", "senior", "lead"],
  },
  "principal": {
    embedText:
      "principal engineer staff senior lead distinguished experienced software engineer",
    keywords: ["principal", "distinguished", "staff", "senior"],
  },
  "software": {
    embedText:
      "software engineer software developer programmer coder backend frontend full stack",
    keywords: ["software", "engineer", "developer"],
  },
  "software engineer": {
    embedText:
      "software engineer software developer backend frontend full stack programmer",
    keywords: ["software engineer", "software", "developer", "engineer"],
  },
  "developer": {
    embedText:
      "developer software engineer programmer coder backend frontend full stack",
    keywords: ["developer", "software", "engineer"],
  },
  "backend": {
    embedText:
      "backend engineer back-end software engineer server-side platform infrastructure distributed systems API",
    keywords: ["backend", "back-end", "server", "platform"],
  },
  "frontend": {
    embedText:
      "frontend engineer front-end software engineer web ui react vue javascript typescript",
    keywords: ["frontend", "front-end", "ui", "web"],
  },
  "fullstack": {
    embedText:
      "full stack engineer fullstack software engineer frontend and backend web developer",
    keywords: ["full stack", "fullstack", "full-stack"],
  },
  "full stack": {
    embedText:
      "full stack engineer fullstack software engineer frontend and backend web developer",
    keywords: ["full stack", "fullstack", "full-stack"],
  },
  "ml": {
    embedText:
      "machine learning engineer ML AI artificial intelligence deep learning research scientist",
    keywords: ["machine learning", "ml", "ai"],
  },
  "ai": {
    embedText:
      "artificial intelligence AI machine learning ML deep learning research scientist",
    keywords: ["ai", "artificial intelligence", "machine learning"],
  },
  "machine learning": {
    embedText:
      "machine learning engineer ML AI artificial intelligence deep learning research scientist",
    keywords: ["machine learning", "ml", "ai"],
  },
  "data scientist": {
    embedText:
      "data scientist data science analytics statistics machine learning research",
    keywords: ["data scientist", "data science", "analytics"],
  },
  "data engineer": {
    embedText:
      "data engineer data platform ETL pipeline warehouse analytics infrastructure",
    keywords: ["data engineer", "data platform", "etl"],
  },
  "devops": {
    embedText:
      "devops engineer site reliability SRE platform infrastructure cloud kubernetes",
    keywords: ["devops", "sre", "platform", "infrastructure"],
  },
  "sre": {
    embedText:
      "site reliability engineer SRE devops platform infrastructure cloud reliability",
    keywords: ["sre", "site reliability", "devops"],
  },
  "security": {
    embedText:
      "security engineer cybersecurity application security infosec offensive defensive penetration",
    keywords: ["security", "infosec", "cybersecurity"],
  },
  "mobile": {
    embedText:
      "mobile engineer iOS Android Swift Kotlin React Native mobile app developer",
    keywords: ["mobile", "ios", "android"],
  },
  "ios": {
    embedText: "iOS engineer Swift Objective-C mobile apple iphone ipad developer",
    keywords: ["ios", "swift", "mobile"],
  },
  "android": {
    embedText: "Android engineer Kotlin Java mobile google developer",
    keywords: ["android", "kotlin", "mobile"],
  },
  "product manager": {
    embedText:
      "product manager PM technical product manager product owner roadmap strategy",
    keywords: ["product manager", "pm", "product"],
  },
  "designer": {
    embedText:
      "designer UX UI product designer visual graphic design researcher",
    keywords: ["designer", "design", "ux", "ui"],
  },
  "qa": {
    embedText: "QA quality assurance test engineer SDET automation tester",
    keywords: ["qa", "quality", "test"],
  },
};

// Normalize: lowercase, collapse whitespace, strip punctuation that ATS
// listings tend to inject around the same words ("/", ",", quotes).
function normalize(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+\-#.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Look up an expansion for the given user query. Returns null if the query
// isn't in the dictionary - callers should embed the raw query in that case.
//
// Match strategy: exact normalized key first, then longest substring match
// across all keys. This catches "search for new grad jobs" -> expansion for
// "new grad" without needing to enumerate every prefix/suffix.
export function expandQuery(query: string): Expansion | null {
  const norm = normalize(query);
  if (!norm) return null;
  const direct = RAW[norm];
  if (direct) return direct;

  // Prefer the longest matching key so "machine learning" wins over "ml"
  // when both appear in the query.
  let best: { key: string; entry: { embedText: string; keywords: string[] } } | null = null;
  for (const [key, entry] of Object.entries(RAW)) {
    const padded = ` ${norm} `;
    if (padded.includes(` ${key} `)) {
      if (!best || key.length > best.key.length) best = { key, entry };
    }
  }
  return best?.entry ?? null;
}

// Convenience helper for the search route: returns the text we should embed
// (expanded if known, raw otherwise) along with the keyword set for the
// hybrid pass (empty if no expansion matched).
export function expansionFor(query: string): { embedText: string; keywords: string[] } {
  const e = expandQuery(query);
  if (e) return e;
  // Pass the raw (normalized) query through. Keywords default to a single
  // entry so the hybrid pass still has something to match on.
  const norm = normalize(query);
  return { embedText: norm || query, keywords: norm ? [norm] : [] };
}
