import type { SkillEntry } from "../skills";

// Retail / customer-facing lexicon. Heavy on POS systems, cash-handling,
// merchandising. Many retail postings list few "skills" so panel coverage
// is naturally thinner here than in tech.
export const RETAIL_SKILLS: SkillEntry[] = [
  // POS / payment systems
  { name: "Square POS",         aliases: ["square"],                            category: "tooling" },
  { name: "Shopify POS",        aliases: ["shopify"],                           category: "tooling" },
  { name: "Toast POS",          aliases: ["toast"],                             category: "tooling" },
  { name: "Clover POS",         aliases: ["clover"],                            category: "tooling" },
  { name: "NCR",                aliases: [],                                    category: "tooling" },
  { name: "Lightspeed",         aliases: [],                                    category: "tooling" },

  // Core retail skills
  { name: "Cash Handling",      aliases: ["money handling", "cash register"],   category: "operations" },
  { name: "Customer Service",   aliases: [],                                    category: "operations" },
  { name: "Inventory Management", aliases: ["inventory control"],               category: "operations" },
  { name: "Stocking",           aliases: ["stock replenishment"],               category: "operations" },
  { name: "Merchandising",      aliases: ["visual merchandising"],              category: "operations" },
  { name: "Planograms",         aliases: [],                                    category: "operations" },
  { name: "Loss Prevention",    aliases: [],                                    category: "operations" },
  { name: "Returns Processing", aliases: ["RMA"],                               category: "operations" },
  { name: "Shrinkage",          aliases: [],                                    category: "operations" },
  { name: "Stockroom",          aliases: ["back of house"],                     category: "operations" },

  // Sales
  { name: "Upselling",          aliases: [],                                    category: "operations" },
  { name: "Cross-Selling",      aliases: ["cross selling"],                     category: "operations" },
  { name: "Suggestive Selling", aliases: [],                                    category: "operations" },
  { name: "Sales Floor",        aliases: [],                                    category: "operations" },

  // Soft + ops
  { name: "Conflict Resolution",aliases: [],                                    category: "soft" },
  { name: "Bilingual",          aliases: [],                                    category: "soft" },
  { name: "Multitasking",       aliases: [],                                    category: "soft" },
  { name: "Time Management",    aliases: [],                                    category: "soft" },

  // Scheduling + back-office
  { name: "Kronos",             aliases: ["ukg kronos"],                        category: "tooling" },
  { name: "When I Work",        aliases: ["whenIWork"],                         category: "tooling" },
  { name: "Microsoft Excel",    aliases: ["excel"],                             category: "tooling" },
];
