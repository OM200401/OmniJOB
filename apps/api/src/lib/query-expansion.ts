// Static synonym dictionary for query expansion. Job-search queries are
// dominated by a small set of compact terms ("new grad", "software", "ml")
// whose embeddings are information-poor relative to a longer phrase. We
// expand each known key into a natural-language gloss that we pass to the
// embedder instead of the raw query - the resulting vector lives in a
// richer region of latent space and pulls back more relevant matches.
//
// Phase 1B change: dictionaries are now scoped by industry. The pre-1B
// behaviour - where "new grad" expanded into software-engineer keywords -
// was actively broken for a nurse typing "new grad" who wanted nursing
// roles. classifyIndustry is used to infer the industry from the query
// itself; per-industry banks then provide the right gloss. A "common" bank
// holds level-only expansions (intern / senior / staff) that mean the same
// thing across every vertical.

import { classifyIndustry, type Industry } from "./industry";

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

type Bank = Record<string, Expansion>;

// Common bank: level terms that apply regardless of industry. These are
// looked up FIRST so a query like "senior" (no domain hint) gets a sane
// expansion even when classifyIndustry returns "other".
const COMMON: Bank = {
  intern: {
    embedText: "intern internship co-op summer internship student program early career",
    keywords: ["intern", "internship", "co-op"],
  },
  internship: {
    embedText: "internship intern co-op summer internship student program early career",
    keywords: ["intern", "internship", "co-op"],
  },
  senior: {
    embedText: "senior staff principal lead experienced professional with 5+ years experience",
    keywords: ["senior", "staff", "lead", "principal"],
  },
  staff: {
    embedText: "staff principal lead senior experienced professional",
    keywords: ["staff", "principal", "senior", "lead"],
  },
  principal: {
    embedText: "principal staff senior lead distinguished experienced professional",
    keywords: ["principal", "distinguished", "staff", "senior"],
  },
  manager: {
    embedText: "manager people lead supervisor team lead department head",
    keywords: ["manager", "people lead", "supervisor"],
  },
  director: {
    embedText: "director senior leadership executive department head",
    keywords: ["director", "head"],
  },
};

// Tech bank (the original Phase-1-pre-1B dictionary, unchanged content).
const TECH: Bank = {
  "new grad": {
    embedText:
      "new grad entry level junior graduate early career software engineer position with no prior industry experience required, 0-2 years experience",
    keywords: ["new grad", "graduate", "entry level", "junior", "associate", "early career"],
  },
  newgrad: {
    embedText:
      "new grad entry level junior graduate early career software engineer position with no prior industry experience, 0-2 years experience",
    keywords: ["new grad", "graduate", "entry level", "junior", "early career"],
  },
  grad: {
    embedText:
      "new grad graduate entry level junior early career software engineering role for recent university graduates",
    keywords: ["graduate", "new grad", "junior", "entry level"],
  },
  graduate: {
    embedText:
      "graduate new grad entry level junior early career software engineering role for recent university graduates",
    keywords: ["graduate", "new grad", "junior", "entry level"],
  },
  "entry level": {
    embedText:
      "entry level junior new grad graduate associate early career software role with 0-2 years experience",
    keywords: ["entry level", "junior", "new grad", "graduate", "associate"],
  },
  "entry-level": {
    embedText:
      "entry level junior new grad graduate associate early career software role with 0-2 years experience",
    keywords: ["entry level", "junior", "new grad", "graduate", "associate"],
  },
  junior: {
    embedText: "junior associate entry level new grad early career software engineer developer",
    keywords: ["junior", "associate", "entry level", "new grad"],
  },
  software: {
    embedText:
      "software engineer software developer programmer coder backend frontend full stack",
    keywords: ["software", "engineer", "developer"],
  },
  "software engineer": {
    embedText: "software engineer software developer backend frontend full stack programmer",
    keywords: ["software engineer", "software", "developer", "engineer"],
  },
  developer: {
    embedText: "developer software engineer programmer coder backend frontend full stack",
    keywords: ["developer", "software", "engineer"],
  },
  backend: {
    embedText:
      "backend engineer back-end software engineer server-side platform infrastructure distributed systems API",
    keywords: ["backend", "back-end", "server", "platform"],
  },
  frontend: {
    embedText:
      "frontend engineer front-end software engineer web ui react vue javascript typescript",
    keywords: ["frontend", "front-end", "ui", "web"],
  },
  fullstack: {
    embedText:
      "full stack engineer fullstack software engineer frontend and backend web developer",
    keywords: ["full stack", "fullstack", "full-stack"],
  },
  "full stack": {
    embedText:
      "full stack engineer fullstack software engineer frontend and backend web developer",
    keywords: ["full stack", "fullstack", "full-stack"],
  },
  ml: {
    embedText:
      "machine learning engineer ML AI artificial intelligence deep learning research scientist",
    keywords: ["machine learning", "ml", "ai"],
  },
  ai: {
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
  devops: {
    embedText:
      "devops engineer site reliability SRE platform infrastructure cloud kubernetes",
    keywords: ["devops", "sre", "platform", "infrastructure"],
  },
  sre: {
    embedText:
      "site reliability engineer SRE devops platform infrastructure cloud reliability",
    keywords: ["sre", "site reliability", "devops"],
  },
  security: {
    embedText:
      "security engineer cybersecurity application security infosec offensive defensive penetration",
    keywords: ["security", "infosec", "cybersecurity"],
  },
  mobile: {
    embedText: "mobile engineer iOS Android Swift Kotlin React Native mobile app developer",
    keywords: ["mobile", "ios", "android"],
  },
  ios: {
    embedText: "iOS engineer Swift Objective-C mobile apple iphone ipad developer",
    keywords: ["ios", "swift", "mobile"],
  },
  android: {
    embedText: "Android engineer Kotlin Java mobile google developer",
    keywords: ["android", "kotlin", "mobile"],
  },
  "product manager": {
    embedText:
      "product manager PM technical product manager product owner roadmap strategy",
    keywords: ["product manager", "pm", "product"],
  },
  designer: {
    embedText: "designer UX UI product designer visual graphic design researcher",
    keywords: ["designer", "design", "ux", "ui"],
  },
  qa: {
    embedText: "QA quality assurance test engineer SDET automation tester",
    keywords: ["qa", "quality", "test"],
  },
};

const HEALTHCARE: Bank = {
  "new grad": {
    embedText:
      "new grad nurse graduate nurse new graduate RN entry level nursing 0-2 years experience early career nursing",
    keywords: ["new grad nurse", "graduate nurse", "new grad rn", "entry level nursing"],
  },
  newgrad: {
    embedText:
      "new grad nurse graduate nurse new graduate RN entry level nursing 0-2 years experience",
    keywords: ["new grad nurse", "graduate nurse", "new grad rn"],
  },
  "graduate nurse": {
    embedText: "graduate nurse new grad RN entry level nursing early career nursing 0-2 years",
    keywords: ["graduate nurse", "new grad nurse", "new grad rn"],
  },
  nurse: {
    embedText:
      "nurse registered nurse RN LPN licensed practical nurse healthcare clinical patient care",
    keywords: ["nurse", "rn", "registered nurse", "lpn"],
  },
  nursing: {
    embedText:
      "nurse registered nurse RN LPN nursing healthcare clinical patient care nursing role",
    keywords: ["nurse", "rn", "registered nurse", "nursing"],
  },
  rn: {
    embedText:
      "registered nurse RN BSN clinical nursing patient care hospital staff nurse",
    keywords: ["rn", "registered nurse", "nurse"],
  },
  lpn: {
    embedText: "LPN licensed practical nurse LVN clinical nursing patient care",
    keywords: ["lpn", "lvn", "licensed practical nurse"],
  },
  cna: {
    embedText: "CNA certified nursing assistant nurse aide patient care entry level nursing",
    keywords: ["cna", "certified nursing assistant", "nurse aide"],
  },
  pharmacy: {
    embedText:
      "pharmacy pharmacist pharmacy technician retail pharmacy hospital pharmacy clinical pharmacy",
    keywords: ["pharmacy", "pharmacist", "pharmacy technician"],
  },
  pharmacist: {
    embedText:
      "pharmacist clinical pharmacist retail pharmacist hospital pharmacist pharmacy",
    keywords: ["pharmacist", "pharmacy"],
  },
  "pharmacy tech": {
    embedText: "pharmacy technician pharmacy tech retail pharmacy hospital pharmacy support",
    keywords: ["pharmacy tech", "pharmacy technician"],
  },
  physician: {
    embedText:
      "physician doctor MD medical doctor attending hospitalist clinical practitioner",
    keywords: ["physician", "doctor", "md", "attending"],
  },
  doctor: {
    embedText:
      "doctor physician MD medical doctor attending hospitalist clinical practitioner",
    keywords: ["doctor", "physician", "md"],
  },
  "medical assistant": {
    embedText: "medical assistant MA clinical assistant healthcare support patient care",
    keywords: ["medical assistant", "ma", "clinical assistant"],
  },
  therapist: {
    embedText:
      "therapist physical therapist occupational therapist speech therapist mental health therapist clinical therapy",
    keywords: ["therapist", "therapy", "clinical therapy"],
  },
  hospital: {
    embedText: "hospital healthcare clinical medical center inpatient ICU emergency department",
    keywords: ["hospital", "healthcare", "clinical"],
  },
};

const RETAIL: Bank = {
  cashier: {
    embedText:
      "cashier sales associate retail associate front end retail register checkout customer service",
    keywords: ["cashier", "sales associate", "front end"],
  },
  "sales associate": {
    embedText:
      "sales associate retail associate store associate customer service merchandiser retail floor",
    keywords: ["sales associate", "retail associate", "store associate"],
  },
  retail: {
    embedText:
      "retail sales associate cashier store associate customer service merchandiser store lead",
    keywords: ["retail", "sales associate", "store associate"],
  },
  "store manager": {
    embedText:
      "store manager retail manager store director general manager retail leadership multi-unit",
    keywords: ["store manager", "retail manager", "store director"],
  },
  barista: {
    embedText: "barista coffee shop cafe espresso customer service hospitality",
    keywords: ["barista", "coffee", "cafe"],
  },
  server: {
    embedText: "server waiter waitress restaurant hospitality customer service food service",
    keywords: ["server", "waiter", "waitress"],
  },
  "line cook": {
    embedText:
      "line cook prep cook kitchen kitchen line restaurant culinary food preparation cook",
    keywords: ["line cook", "prep cook", "cook"],
  },
  chef: {
    embedText: "chef sous chef executive chef head chef culinary kitchen leadership restaurant",
    keywords: ["chef", "sous chef", "executive chef"],
  },
};

const GOVERNMENT: Bank = {
  "civil service": {
    embedText:
      "civil service public sector federal state municipal government public administration",
    keywords: ["civil service", "public sector", "government"],
  },
  federal: {
    embedText:
      "federal government public sector federal agency GS civil service USAJobs federal contractor",
    keywords: ["federal", "government", "public sector"],
  },
  "police officer": {
    embedText:
      "police officer patrolman patrol officer law enforcement sheriff deputy peace officer",
    keywords: ["police officer", "law enforcement", "patrol"],
  },
  sheriff: {
    embedText:
      "sheriff deputy sheriff law enforcement peace officer county police patrol",
    keywords: ["sheriff", "deputy sheriff", "law enforcement"],
  },
  firefighter: {
    embedText: "firefighter fire department EMT paramedic emergency services fire rescue",
    keywords: ["firefighter", "fire department", "emergency services"],
  },
};

const TRADES: Bank = {
  electrician: {
    embedText:
      "electrician electrical apprentice journeyman master electrician licensed electrician residential commercial",
    keywords: ["electrician", "journeyman", "apprentice"],
  },
  plumber: {
    embedText:
      "plumber plumbing apprentice journeyman master plumber licensed plumber residential commercial",
    keywords: ["plumber", "plumbing", "journeyman"],
  },
  hvac: {
    embedText:
      "HVAC technician heating ventilation air conditioning refrigeration installation service repair",
    keywords: ["hvac", "hvac technician", "refrigeration"],
  },
  carpenter: {
    embedText:
      "carpenter carpentry apprentice journeyman finish carpentry framing residential commercial",
    keywords: ["carpenter", "carpentry", "journeyman"],
  },
  welder: {
    embedText: "welder welding fabricator mig tig stick welding fabrication ironworker",
    keywords: ["welder", "welding", "fabricator"],
  },
  apprentice: {
    embedText:
      "apprentice trainee skilled trades electrician plumber carpenter union apprenticeship",
    keywords: ["apprentice", "trainee", "skilled trades"],
  },
};

const EDUCATION: Bank = {
  teacher: {
    embedText:
      "teacher educator classroom teacher elementary teacher secondary teacher K-12 instructor",
    keywords: ["teacher", "educator", "instructor"],
  },
  professor: {
    embedText:
      "professor assistant professor associate professor full professor university lecturer tenure track faculty",
    keywords: ["professor", "faculty", "lecturer"],
  },
  "substitute teacher": {
    embedText: "substitute teacher sub teacher K-12 classroom relief",
    keywords: ["substitute teacher", "sub teacher"],
  },
};

const LOGISTICS: Bank = {
  "truck driver": {
    embedText:
      "truck driver CDL Class A Class B OTR over the road local route delivery driver freight",
    keywords: ["truck driver", "cdl", "otr driver"],
  },
  cdl: {
    embedText: "CDL truck driver Class A Class B commercial driver tractor trailer freight",
    keywords: ["cdl", "truck driver", "commercial driver"],
  },
  warehouse: {
    embedText:
      "warehouse associate worker order picker forklift operator fulfillment shipping receiving",
    keywords: ["warehouse", "warehouse associate", "fulfillment"],
  },
  "delivery driver": {
    embedText:
      "delivery driver courier last mile package delivery local route delivery van driver",
    keywords: ["delivery driver", "courier"],
  },
};

// Map each industry to its expansion bank. Industries without an entry fall
// through to the COMMON bank.
const BANKS_BY_INDUSTRY: Partial<Record<Industry, Bank>> = {
  tech: TECH,
  healthcare: HEALTHCARE,
  retail: RETAIL,
  food_service: RETAIL,
  government: GOVERNMENT,
  trades: TRADES,
  education: EDUCATION,
  logistics: LOGISTICS,
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

function lookupInBank(bank: Bank, norm: string): Expansion | null {
  const direct = bank[norm];
  if (direct) return direct;
  // Prefer the longest matching key so "machine learning" wins over a bare
  // "ml" substring inside a longer query.
  let best: { key: string; entry: Expansion } | null = null;
  for (const [key, entry] of Object.entries(bank)) {
    const padded = ` ${norm} `;
    if (padded.includes(` ${key} `)) {
      if (!best || key.length > best.key.length) best = { key, entry };
    }
  }
  return best?.entry ?? null;
}

// Look up an expansion for the given user query. Returns null if no bank has
// a match. When `industry` is supplied, that industry's bank is checked first;
// otherwise we infer the industry from the query text via classifyIndustry.
// The COMMON bank (universal level terms) is also consulted as a fallback so
// raw "intern" / "senior" queries still expand even when the industry is
// unknown.
export function expandQuery(query: string, industry?: Industry): Expansion | null {
  const norm = normalize(query);
  if (!norm) return null;

  const targetIndustry = industry ?? classifyIndustry(query).industry;
  const industryBank = BANKS_BY_INDUSTRY[targetIndustry];
  if (industryBank) {
    const hit = lookupInBank(industryBank, norm);
    if (hit) return hit;
  }
  // Fall back to the COMMON bank for universal level terms.
  const common = lookupInBank(COMMON, norm);
  if (common) return common;
  // Final fallback: if industry inference returned something other than tech
  // but the query is short, try tech (the bulk of legacy queries are tech).
  if (targetIndustry !== "tech") {
    const techHit = lookupInBank(TECH, norm);
    if (techHit) return techHit;
  }
  return null;
}

// Convenience helper for the search route: returns the text we should embed
// (expanded if known, raw otherwise) along with the keyword set for the
// hybrid pass (empty if no expansion matched).
export function expansionFor(query: string, industry?: Industry): { embedText: string; keywords: string[] } {
  const e = expandQuery(query, industry);
  if (e) return e;
  // Pass the raw (normalized) query through. Keywords default to a single
  // entry so the hybrid pass still has something to match on.
  const norm = normalize(query);
  return { embedText: norm || query, keywords: norm ? [norm] : [] };
}
