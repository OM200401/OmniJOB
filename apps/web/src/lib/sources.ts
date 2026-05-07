// Adapter slug → user-facing display name. Used by JobCard's source chip
// and JobDetail's source-attribution + verified-across panel. Keep in sync
// with the source list in PROJECT.md §2.1 and apps/api/scripts/dedupe.ts
// SOURCE_PRIORITY.

const DISPLAY_NAMES: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workday: "Workday",
  smartrecruiters: "SmartRecruiters",
  recruitee: "Recruitee",
  workable: "Workable",
  bamboohr: "BambooHR",
  breezy: "Breezy",
  pinpoint: "Pinpoint",
  personio: "Personio",
  teamtailor: "Teamtailor",
  hackernews: "HN Hiring",
  workatastartup: "Y Combinator",
  themuse: "The Muse",
  adzuna: "Adzuna",
  jooble: "Jooble",
  reed: "Reed",
  careerjet: "Careerjet",
  remoteok: "RemoteOK",
  weworkremotely: "We Work Remotely",
  usajobs: "USAJobs",
};

export function sourceDisplayName(slug: string | undefined | null): string {
  if (!slug) return "Unknown";
  return DISPLAY_NAMES[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}
