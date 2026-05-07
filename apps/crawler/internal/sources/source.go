// Package sources defines the contract that each ATS adapter implements.
// Each adapter knows how to enumerate jobs from one ATS provider's public
// API and emit normalized JobJSON ready for embedding + ingest.
package sources

import (
	"context"

	"github.com/omnijob/crawler/internal/pipeline"
)

// Source is one job-board provider (Greenhouse, Lever, Ashby, …).
type Source interface {
	// Name is a short identifier used for logging and the metadata.source field.
	Name() string

	// Fetch enumerates current jobs for the configured company list. It emits
	// each normalized job on `out`. Errors per-company are logged and skipped;
	// only a fatal error (e.g. context cancelled) returns an error.
	Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error
}
