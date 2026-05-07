package pipeline

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Sink ships a JobJSON to the OmniJob API's /jobs/ingest endpoint.
type Sink struct {
	apiURL string
	hc     *http.Client
}

func NewSink(apiURL string) *Sink {
	return &Sink{
		apiURL: apiURL,
		hc:     &http.Client{Timeout: 10 * time.Second},
	}
}

func (s *Sink) Ingest(ctx context.Context, j JobJSON) error {
	body, err := json.Marshal(j)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(
		ctx, http.MethodPost, s.apiURL+"/jobs/ingest", bytes.NewReader(body),
	)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("ingest failed: %s: %s", resp.Status, b)
	}
	return nil
}
