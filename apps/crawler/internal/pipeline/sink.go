package pipeline

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
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

// Exists asks the API whether a job with this external_id is already in
// Qdrant. Returning true lets the worker skip the Ollama embed cost.
// On any error we return false (and the error) so the caller can fall
// through to embedding rather than miss a real new job.
func (s *Sink) Exists(ctx context.Context, externalID string) (bool, error) {
	u := s.apiURL + "/jobs/" + url.PathEscape(externalID) + "/exists"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return false, err
	}
	resp, err := s.hc.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 256))
		return false, fmt.Errorf("exists check failed: %s: %s", resp.Status, b)
	}
	var out struct {
		Exists bool `json:"exists"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return false, err
	}
	return out.Exists, nil
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
