package sources

// LinkedIn Jobs is intentionally NOT implemented. There is no public path:
//
//   1. The Talent Solutions Partner API (developer.linkedin.com/talent) is
//      partner-gated. Approval typically takes 3-6 months and is reserved
//      for ATS / sourcing-tool vendors, not job-search aggregators. New
//      "Apply with LinkedIn" partnerships are also closed off as of
//      2025-10. Pricing is bilateral and undisclosed.
//
//   2. Direct scraping of linkedin.com/jobs violates LinkedIn's User
//      Agreement section 8.2 ("Don'ts" — automated access, scraping,
//      crawling). The hiQ Labs v. LinkedIn line of cases left CFAA exposure
//      narrow but the contract claim survives, and LinkedIn actively
//      pursues both injunctive and damages relief against scrapers.
//
//   3. Third-party "LinkedIn Jobs Datasets" (Bright Data, Coresignal,
//      Apify) re-distribute scraped data; their ToS push the legal risk
//      onto the buyer and pricing is in the $0.01-$0.05/posting range —
//      easily $5k+/month for our daily ingest target. Not a fit for a
//      free-for-students product.
//
// Recommendation tracked in PROJECT.md §9: LinkedIn coverage requires
// either a commercial budget for a re-distribution license, or a partner
// approval that we are not currently positioned to obtain. Until then we
// rely on ATS adapters (Greenhouse / Lever / Ashby / Workday) which give
// us direct first-party access to the same employers' postings.
