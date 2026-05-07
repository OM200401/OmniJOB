package sources

// CareerBuilder is intentionally NOT implemented. The historical public
// Job Search API at api.careerbuilder.com/v1/jobsearch was deprecated
// in the 2017-2019 window and the v2 / Data Science APIs that replaced
// it are gated on a CareerBuilder partner account with a B2B SaaS use
// case (their public docs explicitly carve out "data resale" and "job
// aggregation" as out-of-scope).
//
// The legacy XML web services at ws.careerbuilder.com still serve for
// some employer-side flows (job posting, application receipt) but no
// search surface remains.
//
// Scraping careerbuilder.com is ToS-prohibited. Skip until CareerBuilder
// publishes a public job-search API; their primary employer base
// overlaps heavily with the boards we already cover.
