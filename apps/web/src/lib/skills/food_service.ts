import type { SkillEntry } from "../skills";

// Food service / hospitality lexicon. Covers BOH (back of house) and FOH
// (front of house) commonly listed on chef / line cook / server / barista
// postings. Certifications tend to be jurisdiction-specific; we cover the
// common US ones.
export const FOOD_SERVICE_SKILLS: SkillEntry[] = [
  // Certifications
  { name: "ServSafe",                aliases: ["servsafe certification"],        category: "certification" },
  { name: "Food Handler",            aliases: ["food handler certification"],    category: "certification" },
  { name: "TIPS Certified",          aliases: ["tips certification"],            category: "certification" },
  { name: "Allergen Trained",        aliases: ["allergen awareness"],            category: "certification" },

  // BOH skills
  { name: "Knife Skills",            aliases: [],                                category: "clinical" },
  { name: "Mise en Place",           aliases: [],                                category: "clinical" },
  { name: "Sauté",                   aliases: ["saute"],                         category: "clinical" },
  { name: "Grill",                   aliases: [],                                category: "clinical" },
  { name: "Fry Station",             aliases: [],                                category: "clinical" },
  { name: "Pastry",                  aliases: [],                                category: "clinical" },
  { name: "Butchery",                aliases: ["meat fabrication"],              category: "clinical" },
  { name: "Banquet",                 aliases: ["catering"],                      category: "clinical" },
  { name: "Line Cook",               aliases: [],                                category: "clinical" },
  { name: "Prep Cook",               aliases: [],                                category: "clinical" },
  { name: "Food Safety",             aliases: ["haccp"],                         category: "regulatory" },

  // FOH skills
  { name: "Bartending",              aliases: ["mixology"],                      category: "operations" },
  { name: "Espresso",                aliases: ["barista"],                       category: "operations" },
  { name: "Wine Knowledge",          aliases: ["sommelier"],                     category: "operations" },
  { name: "Table Service",           aliases: ["fine dining service"],           category: "operations" },
  { name: "Tableside Service",       aliases: [],                                category: "operations" },

  // POS / systems
  { name: "Toast POS",               aliases: ["toast"],                         category: "tooling" },
  { name: "Square for Restaurants",  aliases: [],                                category: "tooling" },
  { name: "Aloha POS",               aliases: ["ncr aloha"],                     category: "tooling" },
  { name: "Micros",                  aliases: ["oracle micros"],                 category: "tooling" },
  { name: "OpenTable",               aliases: [],                                category: "tooling" },
  { name: "Resy",                    aliases: [],                                category: "tooling" },
];
