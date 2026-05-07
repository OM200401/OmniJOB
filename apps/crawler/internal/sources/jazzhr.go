package sources

// JazzHR (Employ Inc) used to expose a public RSS / JSON feed at
//
//	https://{tenant}.applytojob.com/feed/jobs
//	https://{tenant}.applytojob.com/jobs/feed
//
// but the feed routes now 302 redirect to https://www.jazzhr.com/ regardless
// of tenant slug — Employ Inc deprecated the public feed. Their current API
// (apidoc.jazzhrapis.com) only exposes Apply / Assessment / Screening / SSO
// surfaces and requires an OAuth token issued per customer.
//
// Without a public jobs feed there is no scrape route that doesn't involve
// rendering each tenant's careers page. The adapter file is intentionally
// empty; we'll revisit if Employ Inc ships a partner data feed.
