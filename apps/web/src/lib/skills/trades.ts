import type { SkillEntry } from "../skills";

// Skilled trades lexicon. Focus on licensing, codes, equipment, and the
// specific technical capabilities listed on postings for electricians /
// plumbers / HVAC techs / carpenters / welders.
export const TRADES_SKILLS: SkillEntry[] = [
  // Certifications + licenses
  { name: "OSHA 10",            aliases: ["osha 10 certification"],             category: "certification" },
  { name: "OSHA 30",            aliases: ["osha 30 certification"],             category: "certification" },
  { name: "EPA 608",            aliases: ["epa 608 certification"],             category: "certification" },
  { name: "Journeyman License", aliases: [],                                    category: "certification" },
  { name: "Master License",     aliases: ["master electrician license"],        category: "certification" },
  { name: "CDL Class A",        aliases: ["cdl-a"],                             category: "certification" },
  { name: "CDL Class B",        aliases: ["cdl-b"],                             category: "certification" },
  { name: "Forklift Certified", aliases: ["forklift license"],                  category: "certification" },
  { name: "Welding Certification", aliases: ["aws certified"],                   category: "certification" },

  // Codes + standards
  { name: "NEC",                aliases: ["national electrical code"],          category: "regulatory" },
  { name: "NFPA 70",            aliases: ["nfpa70"],                            category: "regulatory" },
  { name: "IRC",                aliases: ["international residential code"],    category: "regulatory" },
  { name: "UPC",                aliases: ["uniform plumbing code"],             category: "regulatory" },
  { name: "IMC",                aliases: ["international mechanical code"],     category: "regulatory" },

  // Tools + equipment
  { name: "Multimeter",         aliases: [],                                    category: "tooling" },
  { name: "Oscilloscope",       aliases: [],                                    category: "tooling" },
  { name: "Pipe Threading",     aliases: [],                                    category: "tooling" },
  { name: "Conduit Bending",    aliases: [],                                    category: "tooling" },
  { name: "Soldering",          aliases: [],                                    category: "tooling" },
  { name: "Brazing",            aliases: [],                                    category: "tooling" },

  // Technical capabilities
  { name: "Three-Phase",        aliases: ["three phase", "3-phase"],            category: "concept" },
  { name: "Motor Controls",     aliases: [],                                    category: "concept" },
  { name: "PLC Programming",    aliases: ["plcs"],                              category: "concept" },
  { name: "MIG Welding",        aliases: ["gas metal arc welding"],             category: "concept" },
  { name: "TIG Welding",        aliases: ["gas tungsten arc welding"],          category: "concept" },
  { name: "Stick Welding",      aliases: ["shielded metal arc"],                category: "concept" },
  { name: "HVAC Refrigeration", aliases: ["refrigeration"],                     category: "concept" },
  { name: "Sheet Metal",        aliases: [],                                    category: "concept" },
  { name: "Blueprint Reading",  aliases: ["blueprint reading"],                 category: "concept" },
  { name: "Residential Wiring", aliases: [],                                    category: "concept" },
  { name: "Commercial Wiring",  aliases: [],                                    category: "concept" },
];
