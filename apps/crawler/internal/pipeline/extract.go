package pipeline

// JobJSON mirrors the API's JobIngest body shape (apps/api/src/schemas/job.ts).
type JobJSON struct {
	ID       string      `json:"id"`
	Vector   []float32   `json:"vector"`
	Metadata JobMetadata `json:"metadata"`
}

type JobMetadata struct {
	Title           string `json:"title"`
	Company         string `json:"company"`
	Location        string `json:"location"`
	Country         string `json:"country,omitempty"`        // ISO-3166-1 alpha-2
	SalaryRange     string `json:"salary_range,omitempty"`   // human-readable display, e.g. "$120k – $150k USD"
	SalaryMin       int    `json:"salary_min,omitempty"`     // raw, in source currency
	SalaryMax       int    `json:"salary_max,omitempty"`     // raw, in source currency
	SalaryCurrency  string `json:"salary_currency,omitempty"` // ISO-4217
	SalaryPeriod    string `json:"salary_period,omitempty"`   // annual | monthly | hourly | weekly | daily
	RemoteStatus    string `json:"remote_status,omitempty"`
	ExperienceLevel string `json:"experience_level,omitempty"`
	Source          string `json:"source,omitempty"`
	SourceURL       string `json:"source_url"`
	ScrapedAt       int64  `json:"scraped_at"`
	PostedAt        int64  `json:"posted_at,omitempty"`
	Description     string `json:"description,omitempty"`
}
