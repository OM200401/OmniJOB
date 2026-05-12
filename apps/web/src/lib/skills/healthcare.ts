import type { SkillEntry } from "../skills";

// Healthcare lexicon. Skews toward terms that actually appear in postings
// (licenses, EHR systems, common procedures, specialty acronyms) rather than
// soft skills - hand-curation favours signal over coverage.
export const HEALTHCARE_SKILLS: SkillEntry[] = [
  // Licenses + certifications
  { name: "BLS",                aliases: ["basic life support"],                category: "certification" },
  { name: "ACLS",               aliases: ["advanced cardiac life support"],     category: "certification" },
  { name: "PALS",               aliases: ["pediatric advanced life support"],   category: "certification" },
  { name: "CPR",                aliases: [],                                    category: "certification" },
  { name: "RN License",         aliases: ["registered nurse license"],          category: "certification" },
  { name: "LPN License",        aliases: ["lvn license"],                       category: "certification" },
  { name: "CNA Certification",  aliases: ["certified nursing assistant"],       category: "certification" },
  { name: "NP Certification",   aliases: ["nurse practitioner certification"],  category: "certification" },
  { name: "DEA Number",         aliases: [],                                    category: "certification" },
  { name: "Board Certified",    aliases: ["board-certified"],                   category: "certification" },
  { name: "CCRN",               aliases: [],                                    category: "certification" },
  { name: "NRP",                aliases: ["neonatal resuscitation"],            category: "certification" },
  { name: "Phlebotomy Certified", aliases: ["phlebotomy certification"],        category: "certification" },
  { name: "HIPAA",              aliases: [],                                    category: "regulatory" },

  // Clinical skills + procedures
  { name: "IV Therapy",         aliases: ["intravenous therapy"],               category: "clinical" },
  { name: "Phlebotomy",         aliases: [],                                    category: "clinical" },
  { name: "Wound Care",         aliases: [],                                    category: "clinical" },
  { name: "Triage",             aliases: [],                                    category: "clinical" },
  { name: "Vital Signs",        aliases: [],                                    category: "clinical" },
  { name: "Patient Assessment", aliases: [],                                    category: "clinical" },
  { name: "Medication Administration", aliases: ["med administration"],          category: "clinical" },
  { name: "Charting",           aliases: [],                                    category: "clinical" },
  { name: "Catheter Insertion", aliases: ["foley catheter"],                    category: "clinical" },
  { name: "Suturing",           aliases: [],                                    category: "clinical" },
  { name: "Intubation",         aliases: [],                                    category: "clinical" },
  { name: "Code Blue",          aliases: [],                                    category: "clinical" },
  { name: "EKG",                aliases: ["ecg", "electrocardiogram"],          category: "clinical" },

  // EHR / EMR systems
  { name: "Epic",               aliases: ["epic ehr", "epic emr"],              category: "tooling" },
  { name: "Cerner",             aliases: ["oracle cerner"],                     category: "tooling" },
  { name: "Meditech",           aliases: [],                                    category: "tooling" },
  { name: "Allscripts",         aliases: [],                                    category: "tooling" },
  { name: "athenahealth",       aliases: ["athena health"],                     category: "tooling" },
  { name: "NextGen",            aliases: ["nextgen healthcare"],                category: "tooling" },
  { name: "eClinicalWorks",     aliases: ["ecw"],                               category: "tooling" },

  // Specialties / departments
  { name: "ICU",                aliases: ["intensive care unit"],               category: "specialty" },
  { name: "ER",                 aliases: ["emergency room", "emergency department"], category: "specialty" },
  { name: "OR",                 aliases: ["operating room"],                    category: "specialty" },
  { name: "Med-Surg",           aliases: ["medical surgical"],                  category: "specialty" },
  { name: "Telemetry",          aliases: [],                                    category: "specialty" },
  { name: "Cardiology",         aliases: [],                                    category: "specialty" },
  { name: "Oncology",           aliases: [],                                    category: "specialty" },
  { name: "Pediatrics",         aliases: ["peds"],                              category: "specialty" },
  { name: "Geriatrics",         aliases: [],                                    category: "specialty" },
  { name: "Labor and Delivery", aliases: ["l&d"],                               category: "specialty" },
  { name: "NICU",               aliases: ["neonatal intensive care"],           category: "specialty" },
  { name: "PICU",               aliases: ["pediatric intensive care"],          category: "specialty" },
  { name: "Critical Care",      aliases: [],                                    category: "specialty" },
  { name: "Behavioral Health",  aliases: ["mental health"],                     category: "specialty" },
  { name: "Long-Term Care",     aliases: ["long term care", "ltc"],             category: "specialty" },
  { name: "Home Health",        aliases: [],                                    category: "specialty" },
  { name: "Telehealth",         aliases: ["telemedicine"],                      category: "specialty" },

  // Pharmacy-specific
  { name: "Rx Dispensing",      aliases: ["prescription dispensing"],           category: "clinical" },
  { name: "Compounding",        aliases: [],                                    category: "clinical" },
  { name: "Medication Reconciliation", aliases: ["med rec"],                    category: "clinical" },
];
