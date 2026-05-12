import type { SkillEntry } from "../skills";

// Government / public-sector lexicon. Emphasises clearances, federal-specific
// procurement frameworks, and standardised forms. Federal postings on
// USAJobs typically explicitly list these terms.
export const GOVERNMENT_SKILLS: SkillEntry[] = [
  // Clearance levels
  { name: "Secret Clearance",        aliases: ["secret"],                       category: "certification" },
  { name: "Top Secret Clearance",    aliases: ["top secret", "ts clearance"],   category: "certification" },
  { name: "TS/SCI",                  aliases: ["sci"],                          category: "certification" },
  { name: "Public Trust",            aliases: [],                               category: "certification" },
  { name: "Q Clearance",             aliases: [],                               category: "certification" },

  // Forms + processes
  { name: "SF-86",                   aliases: ["standard form 86"],             category: "regulatory" },
  { name: "SF-50",                   aliases: ["standard form 50"],             category: "regulatory" },
  { name: "FOIA",                    aliases: ["freedom of information act"],   category: "regulatory" },

  // Procurement + regulatory
  { name: "FAR",                     aliases: ["federal acquisition regulation"], category: "regulatory" },
  { name: "DFARS",                   aliases: [],                               category: "regulatory" },
  { name: "OMB Circular",            aliases: [],                               category: "regulatory" },
  { name: "NIST 800-53",             aliases: ["nist sp 800-53"],               category: "regulatory" },
  { name: "FISMA",                   aliases: [],                               category: "regulatory" },
  { name: "FedRAMP",                 aliases: [],                               category: "regulatory" },
  { name: "ATO",                     aliases: ["authority to operate"],         category: "regulatory" },
  { name: "STIG",                    aliases: ["security technical implementation guide"], category: "regulatory" },

  // Programs / agencies
  { name: "DoD",                     aliases: ["department of defense"],        category: "concept" },
  { name: "GSA",                     aliases: ["general services administration"], category: "concept" },
  { name: "GS Grade",                aliases: ["gs grade level"],               category: "concept" },
  { name: "SES",                     aliases: ["senior executive service"],     category: "concept" },

  // Skills
  { name: "Federal Contracting",     aliases: [],                               category: "operations" },
  { name: "Contract Administration", aliases: [],                               category: "operations" },
  { name: "RFP Response",            aliases: ["proposal response"],            category: "operations" },
  { name: "Policy Analysis",         aliases: [],                               category: "operations" },
  { name: "Legislative Affairs",     aliases: [],                               category: "operations" },
  { name: "Grant Management",        aliases: [],                               category: "operations" },
];
