package sources

// Monster is intentionally NOT implemented. Monster has not operated a
// public job-search API since the Randstad acquisition; the only
// developer-facing surfaces today are a recruiter-side ATS integration
// (Monster Power Resume Search, talent-source feeds via Monster's
// Hosting/Distribution partner program) and per-employer XML feeds that
// require an existing Monster posting account.
//
// The historical RSS feeds at rss.jobsearch.monster.com still resolve
// for some categories but return only the most recent ~25 items per
// feed, with truncated descriptions and no structured salary / location
// fields — not enough signal to justify an adapter.
//
// Third-party scraping (Apify, Techmap) is available but bears the same
// re-distribution risk as the other ToS-protected boards. Skip until
// Monster ships a real public API.
