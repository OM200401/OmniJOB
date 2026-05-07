package sources

// Glassdoor is intentionally NOT implemented. Glassdoor closed public
// developer access to its Jobs/Reviews API in 2021 and, after the 2018
// Recruit Holdings acquisition that put it under the same parent as
// Indeed, has consolidated all data access into enterprise partnerships
// with undisclosed pricing.
//
// The legacy /developer/index.htm registration page now requires the
// applicant to demonstrate either an existing Glassdoor advertising
// relationship or a partner integration use case (ATS, HRIS). General
// search-engine use cases are explicitly out of scope.
//
// Direct scraping is constrained by the same anti-bot stack as Indeed
// (their sibling) and by ToS section 4(d) prohibiting automated access.
// Third-party Glassdoor datasets exist (Bright Data, OpenWeb Ninja) but
// re-distribute scraped data — same cost / risk profile as LinkedIn
// (see linkedin.go).
//
// Notable: Glassdoor's *unique* data (employer reviews, salary self-
// reports, interview question dumps) is not what we need; we need fresh
// active postings, which the ATS adapters already cover for the same
// employer cohort.
