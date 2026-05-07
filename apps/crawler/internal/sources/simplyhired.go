package sources

// SimplyHired is intentionally NOT implemented. SimplyHired was acquired
// by Recruit Holdings (the same parent as Indeed and Glassdoor); its
// historical public Partners API was wound down post-acquisition and
// the affiliate XML feeds that some integrators relied on no longer
// resolve.
//
// The site itself is now a thin search front-end backed by the same
// Indeed crawler index. Adding SimplyHired-via-scraping would duplicate
// Indeed coverage we already (correctly) decline to scrape.
//
// No first-party data path; skip indefinitely.
