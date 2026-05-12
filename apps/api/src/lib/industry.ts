// Heuristic title + description → industry classifier (Tier 1, regex).
//
// The system has been tech-only since launch; every existing job lives in an
// undifferentiated semantic vector + a handful of flat enums. To support the
// non-tech verticals (healthcare, retail, government, etc.) we need a coarse
// industry tag on every payload so filters / per-industry quality weights /
// per-industry seniority banks have something concrete to key off.
//
// This is Tier 1: keyword regex on the title + first 300 chars of description.
// Cheap (one pass per job at ingest), deterministic, no model dependency.
// Tier 2 (per-industry embedding centroids for ambiguous cases) is deferred
// to a follow-up - run the centroid match only when Tier 1 returns "other".

export type Industry =
  | "tech"
  | "healthcare"
  | "retail"
  | "food_service"
  | "trades"
  | "government"
  | "education"
  | "finance"
  | "manufacturing"
  | "logistics"
  | "legal"
  | "nonprofit"
  | "media"
  | "science"
  | "other";

export const ALL_INDUSTRIES: Industry[] = [
  "tech",
  "healthcare",
  "retail",
  "food_service",
  "trades",
  "government",
  "education",
  "finance",
  "manufacturing",
  "logistics",
  "legal",
  "nonprofit",
  "media",
  "science",
  "other",
];

// Order matters. The first matching block wins. We put the most specific
// verticals (healthcare, government, trades) above the broader ones (tech,
// finance) because a title like "Medical Software Engineer" should resolve
// to healthcare-software rather than generic tech.
const INDUSTRY_RULES: Array<{ industry: Industry; patterns: RegExp[] }> = [
  {
    industry: "healthcare",
    patterns: [
      // Credentials. 'do' / 'md' / 'dpt' as bare 2-3 letter sequences are too
      // common as English words (verb "do", state code "MD") and produced
      // ~5-10% false positives in Phase 1A backfill (Walmart "Meat Cutter
      // and Wrapper" matched because the description began "Why do people
      // love shopping..."). We catch periodised forms (M.D., D.O.) instead.
      /\b(rn|lpn|cna|bsn|msn|dnp|np|pa-?c|dds|dvm|psyd)\b/i,
      /\b(M\.D\.|D\.O\.|D\.D\.S\.|D\.V\.M\.|D\.P\.T\.)/,
      // Credential-as-suffix: "Jane Smith, MD" / "Dr. Jones MD". Requires a
      // capitalised name or honorific immediately before the credential,
      // which rules out common-English-word matches.
      /,\s+(MD|DO|DPT)\b/,
      /\bDr\.\s+[A-Z][a-z]+,?\s+(MD|DO|DPT)\b/,
      /\b(nurse|nursing|midwife|midwifery)\b/i,
      /\b(physician|surgeon|surgical|anesthesiolog)/i,
      /\b(doctor|phd\s+psychology)\b/i,
      /\b(hospital|clinic|patient|medical\s+(center|office|practice))\b/i,
      /\b(pharmacy|pharmacist|pharmacolog|pharmaceutical\s+technician)\b/i,
      /\b(dental|dentist|hygienist|orthodontist)\b/i,
      /\b(therapist|therapy|rehabilitation|physical\s+therap)/i,
      /\b(radiology|radiologist|sonographer|mammograph)/i,
      /\b(paramedic|emt|emergency\s+medical|ambulance)\b/i,
      /\b(phlebotom|sonogr|cardiology|oncology|pediatric|geriatric)/i,
      /\b(medical\s+assistant|medical\s+coder|health\s+information)/i,
      /\b(respiratory\s+therap|occupational\s+therap)/i,
      /\b(behavioral\s+health|mental\s+health\s+counselor|clinical\s+social\s+worker)/i,
    ],
  },
  {
    industry: "government",
    patterns: [
      /\b(gs[-\s]?\d{1,2}|wage\s+grade|wg-\d+)\b/i,
      /\b(federal\s+(government|employee|agency)|civil\s+service)\b/i,
      /\b(department\s+of\s+\w+|bureau\s+of\s+\w+|ministry\s+of)/i,
      /\b(sheriff|deputy\s+sheriff|police\s+officer|patrolman|trooper)\b/i,
      /\b(corrections\s+officer|correctional\s+(officer|sergeant))/i,
      /\b(army|navy|marines?|air\s+force|coast\s+guard|space\s+force)\b/i,
      /\b(usajobs|federal\s+contractor|public\s+sector|municipal)/i,
      /\b(city\s+of\s+\w+|county\s+of\s+\w+)/i,
    ],
  },
  {
    industry: "education",
    patterns: [
      /\b(teacher|teaching\s+(assistant|fellow|position)|educator)\b/i,
      /\b(professor|lecturer|adjunct\s+faculty|tenure[\s-]?track)\b/i,
      /\b(elementary|secondary|kindergarten|preschool|grade\s+school)\b/i,
      /\b(school\s+(district|board|principal|nurse|counselor))\b/i,
      /\b(curriculum\s+(developer|specialist)|pedagog)/i,
      /\b(superintendent|dean\s+of\s+\w+|provost|registrar)\b/i,
      /\b(special\s+(education|ed)|esl\s+teacher|substitute\s+teacher)\b/i,
      /\bk-12|early\s+childhood\s+education/i,
    ],
  },
  {
    industry: "logistics",
    patterns: [
      /\b(truck\s+driver|cdl[\s-]?(driver|[ab])|delivery\s+driver|courier|chauffeur)\b/i,
      /\b(warehouse\s+(associate|worker|lead|supervisor)|fulfillment\s+(associate|center))/i,
      /\b(logistics|supply\s+chain|inventory\s+(specialist|manager|control))/i,
      /\b(shipping|receiving|freight\s+(handler|broker))/i,
      /\b(material\s+handler|order\s+picker|forklift\s+operator)\b/i,
    ],
  },
  {
    industry: "trades",
    patterns: [
      /\b(electrician|plumber|carpenter|welder|machinist|millwright)\b/i,
      /\bhvac|heating[\s-]?and[\s-]?cooling|sheet\s+metal/i,
      /\b(roofer|mason|tiler|painter|drywall|insulation)\b/i,
      /\b(diesel\s+mechanic|auto\s+mechanic|aircraft\s+mechanic)\b/i,
      /\b(apprentice|journeyman|master)\s+(electrician|plumber|carpenter|tradesman)/i,
      /\b(pipefitter|ironworker|millwork|crane\s+operator)\b/i,
    ],
  },
  {
    industry: "food_service",
    patterns: [
      /\b(line\s+cook|sous\s+chef|executive\s+chef|head\s+chef|pastry\s+chef)\b/i,
      /\b(cook|chef|baker|kitchen\s+(staff|hand|porter))\b/i,
      /\b(waiter|waitress|server|host\b|hostess|bartender|barista)/i,
      /\b(dishwasher|busser|food\s+(runner|prep))\b/i,
      /\b(restaurant|cafe|bistro|diner|food\s+truck|catering)/i,
      /\bculinary\s+(arts|professional|graduate)/i,
    ],
  },
  {
    industry: "retail",
    patterns: [
      /\b(cashier|stocker|sales\s+associate|store\s+associate|store\s+lead)\b/i,
      /\b(visual\s+merchandiser|merchandiser|loss\s+prevention)\b/i,
      /\b(retail\s+(manager|supervisor|associate|specialist))/i,
      /\bstore\s+(manager|director)\b/i,
      /\bbrand\s+(ambassador|specialist)/i,
      /\b(department\s+(store|supervisor)|big\s+box)/i,
    ],
  },
  {
    industry: "manufacturing",
    patterns: [
      /\b(assembler|production\s+(worker|operator|associate|lead))\b/i,
      /\b(manufactur(ing|er)|production\s+line|assembly\s+line)/i,
      /\b(quality\s+(control|assurance|inspector|technician))\b/i,
      /\b(plant\s+(manager|operator|supervisor)|machine\s+operator)\b/i,
      /\b(injection\s+mold|press\s+operator|cnc\s+(machinist|operator))/i,
    ],
  },
  {
    industry: "tech",
    patterns: [
      /\b(software|web|mobile|backend|frontend|full[-\s]?stack)\s+(engineer|developer|architect)/i,
      /\b(software|application|systems?|platform|infrastructure)\s+engineer/i,
      /\b(programmer|developer|coder)\b/i,
      /\b(devops|sre|site\s+reliability|sysadmin|cloud\s+engineer)/i,
      /\b(data\s+(scientist|engineer|analyst)|machine\s+learning\s+engineer|ml\s+engineer)/i,
      /\b(security\s+engineer|cybersecurity|infosec|penetration\s+tester)/i,
      /\b(product\s+(manager|owner|designer)|ux\s+(designer|researcher)|ui\s+designer)\b/i,
      /\b(technical\s+(writer|program\s+manager)|qa\s+(engineer|analyst))\b/i,
      /\b(react|python|kubernetes|terraform|typescript|golang|rust)\b/i,
    ],
  },
  {
    industry: "finance",
    patterns: [
      /\b(accountant|cpa|bookkeeper|controller|auditor|audit\s+(manager|senior))\b/i,
      /\b(financial\s+(analyst|advisor|planner|consultant))\b/i,
      /\b(investment\s+(banker|analyst|associate)|wealth\s+(manager|advisor))/i,
      /\b(actuar|underwrit|risk\s+(analyst|manager))/i,
      /\b(trader|trading\s+(analyst|associate)|portfolio\s+manager)\b/i,
      /\b(loan\s+(officer|processor)|mortgage\s+(broker|underwriter))/i,
      /\b(tax\s+(preparer|consultant|manager|associate))/i,
    ],
  },
  {
    industry: "legal",
    patterns: [
      /\b(attorney|lawyer|counsel(or)?|paralegal|legal\s+(assistant|secretary))\b/i,
      /\b(law\s+(firm|clerk|office)|litigation\s+(associate|attorney))/i,
      /\b(compliance\s+(attorney|officer)|general\s+counsel)/i,
      /\b(public\s+defender|district\s+attorney|prosecutor)/i,
    ],
  },
  {
    industry: "science",
    patterns: [
      /\b(scientist|researcher|research\s+(associate|scientist|fellow))\b/i,
      /\b(biologist|chemist|physicist|geologist|astronomer)\b/i,
      /\b(laborator(y|ies)|biotech\s+(researcher|engineer)|pharmaceutical\s+research)/i,
      /\b(postdoc|postdoctoral|principal\s+investigator)\b/i,
      /\b(clinical\s+(research|trial)\s+(coordinator|associate|manager))/i,
    ],
  },
  {
    industry: "media",
    patterns: [
      /\b(journalist|reporter|editor|copy\s+editor|managing\s+editor|writer)\b/i,
      /\b(news\s+(anchor|producer)|broadcast\s+(journalist|engineer))/i,
      /\b(photographer|videographer|content\s+creator|content\s+strategist)\b/i,
      /\b(social\s+media\s+(manager|specialist|coordinator))\b/i,
    ],
  },
  {
    industry: "nonprofit",
    patterns: [
      /\b(non[\s-]?profit|501\(c\)\(3\)|ngo|charity)\b/i,
      /\b(fundraising|grant\s+(writer|manager)|development\s+(officer|director))/i,
      /\b(volunteer\s+(coordinator|manager)|community\s+organizer)\b/i,
      /\b(foundation\s+(officer|grants)|philanthropy)/i,
    ],
  },
];

// Job family is a finer rollup than industry. The classifier returns one when
// a high-confidence pattern matches; otherwise it returns undefined and the
// payload just carries the industry tag. Add families opportunistically as
// vertical work demands them - this is not meant to be exhaustive on day one.
const JOB_FAMILY_RULES: Array<{ family: string; patterns: RegExp[] }> = [
  // healthcare
  { family: "registered_nurse", patterns: [/\b(rn|registered\s+nurse)\b/i] },
  { family: "licensed_practical_nurse", patterns: [/\b(lpn|licensed\s+practical\s+nurse|lvn)\b/i] },
  { family: "certified_nursing_assistant", patterns: [/\b(cna|certified\s+nursing\s+assistant|nursing\s+assistant)\b/i] },
  { family: "nurse_practitioner", patterns: [/\bnurse\s+practitioner|\bnp\b/i] },
  { family: "physician", patterns: [/\b(physician|attending|hospitalist|medical\s+doctor)\b/i] },
  { family: "pharmacist", patterns: [/\bpharmacist\b/i] },
  { family: "pharmacy_technician", patterns: [/\bpharmacy\s+tech(nician)?\b/i] },
  { family: "medical_assistant", patterns: [/\bmedical\s+assistant\b/i] },
  // tech
  { family: "software_engineering", patterns: [
    /\b(software|web|mobile|backend|frontend|full[-\s]?stack)\s+(engineer|developer|architect)/i,
    /\b(software|systems|platform)\s+engineer/i,
  ] },
  { family: "data_science", patterns: [/\bdata\s+scientist|machine\s+learning\s+(engineer|scientist)|ml\s+engineer/i] },
  { family: "data_engineering", patterns: [/\bdata\s+engineer\b/i] },
  { family: "devops", patterns: [/\b(devops|sre|site\s+reliability)/i] },
  { family: "product_management", patterns: [/\bproduct\s+(manager|owner)\b/i] },
  { family: "design", patterns: [/\b(ux\s+(designer|researcher)|product\s+designer|visual\s+designer)\b/i] },
  // retail
  { family: "cashier", patterns: [/\bcashier\b/i] },
  { family: "sales_associate", patterns: [/\b(sales|store|retail)\s+associate\b/i] },
  { family: "store_manager", patterns: [/\bstore\s+(manager|director|lead)\b/i] },
  // food service
  { family: "line_cook", patterns: [/\bline\s+cook\b/i] },
  { family: "chef", patterns: [/\b(sous|executive|head|pastry)\s+chef|^chef\b/i] },
  { family: "server", patterns: [/\b(server|waiter|waitress)\b/i] },
  { family: "bartender", patterns: [/\bbartender|mixologist\b/i] },
  // trades
  { family: "electrician", patterns: [/\belectrician\b/i] },
  { family: "plumber", patterns: [/\bplumber\b/i] },
  { family: "carpenter", patterns: [/\bcarpenter\b/i] },
  { family: "hvac_technician", patterns: [/\bhvac/i] },
  // logistics
  { family: "truck_driver", patterns: [/\b(truck\s+driver|cdl\s+driver)\b/i] },
  { family: "delivery_driver", patterns: [/\b(delivery\s+driver|courier|chauffeur)\b/i] },
  { family: "warehouse_associate", patterns: [/\bwarehouse\s+(associate|worker|lead)\b/i] },
  // education
  { family: "teacher", patterns: [/\b(teacher|teaching\s+position)\b/i] },
  { family: "professor", patterns: [/\b(professor|lecturer|adjunct\s+faculty)\b/i] },
  // government
  { family: "police_officer", patterns: [/\b(police\s+officer|patrolman|deputy\s+sheriff)\b/i] },
  // finance
  { family: "accountant", patterns: [/\b(accountant|cpa|bookkeeper)\b/i] },
  { family: "financial_analyst", patterns: [/\bfinancial\s+analyst\b/i] },
];

const DESCRIPTION_SAMPLE_CHARS = 300;

export type IndustryClassification = {
  industry: Industry;
  jobFamily?: string;
};

export function classifyIndustry(
  title: string,
  description?: string,
): IndustryClassification {
  const haystack = (
    title +
    " " +
    (description ?? "").slice(0, DESCRIPTION_SAMPLE_CHARS)
  ).trim();
  if (!haystack) return { industry: "other" };

  let industry: Industry = "other";
  for (const rule of INDUSTRY_RULES) {
    if (rule.patterns.some((p) => p.test(haystack))) {
      industry = rule.industry;
      break;
    }
  }

  // Job-family lookup is independent of the matched industry. A pattern fires
  // on its own keywords - "RN" wins regardless of whether we got the industry
  // pin via "RN" or via "Hospital". This keeps the rules simple and lets a
  // future industry-aware refinement just remap the family if needed.
  let jobFamily: string | undefined;
  for (const rule of JOB_FAMILY_RULES) {
    if (rule.patterns.some((p) => p.test(haystack))) {
      jobFamily = rule.family;
      break;
    }
  }

  return jobFamily ? { industry, jobFamily } : { industry };
}
