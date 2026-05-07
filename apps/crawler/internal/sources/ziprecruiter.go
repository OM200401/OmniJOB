package sources

// ZipRecruiter is intentionally NOT implemented. The publisher search
// product (ZipSearch) that historically powered third-party job search
// integrations was deprecated 2025-03-31; existing publishers were
// disconnected and new signups are not being processed.
//
// ZipRecruiter's remaining APIs (Jobs API, Questions API, Apply Webhook,
// Embedded Sponsorship) are all recruiter-facing — they let employers
// post and receive applications, not let third parties read jobs off
// the platform. Their affiliate program pays per-click on individual
// referral links but provides no structured search feed.
//
// Direct scraping is ToS-violating and ZipRecruiter operates Cloudflare
// bot management at the edge.
//
// Recommendation: skip until ZipRecruiter ships a successor to ZipSearch
// (no public timeline). The affiliate redirect model is incompatible with
// our embedding pipeline because we never see the job copy.
