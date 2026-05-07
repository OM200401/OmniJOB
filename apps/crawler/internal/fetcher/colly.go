package fetcher

import (
	"sync"
	"time"

	"github.com/gocolly/colly/v2"
	"github.com/gocolly/colly/v2/extensions"
)

// CollyFetcher implements Fetcher using gocolly. Robots.txt is respected by
// default (Colly's built-in behavior); we deliberately never call
// IgnoreRobotsTxt.
type CollyFetcher struct {
	c       *colly.Collector
	pages   chan Page
	errs    chan error
	once    sync.Once
	closeCh chan struct{}
}

type CollyOptions struct {
	UserAgent            string
	MaxDepth             int
	PerDomainParallelism int
	PerDomainDelay       time.Duration
	OnLink               func(absURL string, depth int)
}

func NewCollyFetcher(opts CollyOptions) (*CollyFetcher, error) {
	c := colly.NewCollector(
		colly.Async(true),
		colly.UserAgent(opts.UserAgent),
		colly.MaxDepth(opts.MaxDepth),
	)
	extensions.Referer(c)

	if err := c.Limit(&colly.LimitRule{
		DomainGlob:  "*",
		Parallelism: opts.PerDomainParallelism,
		Delay:       opts.PerDomainDelay,
		RandomDelay: opts.PerDomainDelay / 2,
	}); err != nil {
		return nil, err
	}

	f := &CollyFetcher{
		c:       c,
		pages:   make(chan Page, 256),
		errs:    make(chan error, 64),
		closeCh: make(chan struct{}),
	}

	c.OnResponse(func(r *colly.Response) {
		select {
		case f.pages <- Page{
			URL:        r.Request.URL.String(),
			FinalURL:   r.Request.URL.String(),
			HTML:       r.Body,
			StatusCode: r.StatusCode,
			Depth:      r.Request.Depth,
		}:
		case <-f.closeCh:
		}
	})

	c.OnError(func(r *colly.Response, err error) {
		select {
		case f.errs <- err:
		default:
			// drop if buffer full
		}
	})

	if opts.OnLink != nil {
		c.OnHTML("a[href]", func(e *colly.HTMLElement) {
			abs := e.Request.AbsoluteURL(e.Attr("href"))
			if abs == "" {
				return
			}
			opts.OnLink(abs, e.Request.Depth+1)
		})
	}

	return f, nil
}

func (f *CollyFetcher) Submit(rawURL string) error {
	return f.c.Visit(rawURL)
}

func (f *CollyFetcher) Pages() <-chan Page  { return f.pages }
func (f *CollyFetcher) Errors() <-chan error { return f.errs }

func (f *CollyFetcher) Wait() { f.c.Wait() }

func (f *CollyFetcher) Close() error {
	f.once.Do(func() {
		close(f.closeCh)
		close(f.pages)
		close(f.errs)
	})
	return nil
}
