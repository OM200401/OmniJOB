package sources

// Dice (tech-focused US board) is intentionally NOT implemented. Dice
// shut down its public Jobs API in 2017 and the redirect from
// http://api.dice.com/ now points to a marketing page. The
// dice-talent-public.api-docs.io endpoint that surfaces in some search
// results is the recruiter-side talent-search API, gated on a Dice
// employer account; it does not expose job postings.
//
// Dice's RSS feeds were also retired alongside the API. No first-party
// path remains. Scraping dice.com is ToS-prohibited and the site sits
// behind PerimeterX bot management.
//
// Coverage of the US tech-employer cohort that Dice historically owned
// is largely captured today by our Greenhouse / Lever / Ashby / Workday
// adapters — most companies that pay for a Dice posting also maintain
// a public ATS board.
