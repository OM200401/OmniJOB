package fetcher

// Page is the unit of output produced by a Fetcher: the raw HTML for a URL
// after fetch, plus the URL it actually resolved to (after redirects) and
// the HTTP status code.
type Page struct {
	URL        string
	FinalURL   string
	HTML       []byte
	StatusCode int
	Depth      int
}

// Fetcher abstracts the act of fetching a URL. The Colly implementation is
// the v0 default; a Playwright-based implementation will follow for sites
// behind anti-bot stacks (Cloudflare Turnstile, DataDome, etc.) per
// PROJECT.md §2.1.
type Fetcher interface {
	// Submit enqueues a URL for fetching. Non-blocking; the actual fetch is
	// asynchronous and surfaces on the Pages() / Errors() channels.
	Submit(rawURL string) error

	// Pages returns the receive-only channel of successfully fetched pages.
	Pages() <-chan Page

	// Errors returns a receive-only channel of fetch errors. Non-fatal; the
	// caller decides whether to log/retry.
	Errors() <-chan error

	// Wait blocks until all in-flight requests complete.
	Wait()

	// Close releases resources. Safe to call multiple times.
	Close() error
}
