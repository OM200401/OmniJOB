package sources

// Indeed is intentionally NOT implemented as a search source. State as of
// 2026-05:
//
//   1. The legacy Publisher Jobs API (XML/JSON job-search feeds) was
//      deprecated for new partners in 2023 and the search endpoints have
//      since been decommissioned. docs.indeed.com no longer documents a
//      public search surface.
//
//   2. The currently-active partner APIs (Job Sync, Sponsored Jobs, Job
//      Update) are recruiter-facing - they let an employer push jobs onto
//      Indeed, not pull them off. Sponsored Jobs additionally requires the
//      partner to have an Indeed billing relationship as of 2024-12-01.
//
//   3. Direct scraping of indeed.com violates their robots.txt and ToS;
//      Indeed (now under Recruit Holdings, same parent as Glassdoor)
//      operates aggressive bot detection and has been actively litigious
//      against scrapers since 2017.
//
//   4. Third-party Indeed datasets (Apify, Bright Data, Coresignal) exist
//      but legally re-distribute scraped data; same cost / risk profile
//      as the LinkedIn analysis (see linkedin.go).
//
// Coverage gap is partly mitigated by the ATS adapters - most US employers
// large enough to pay Indeed's CPC also expose a Greenhouse / Lever /
// Workday board that we already index directly.
