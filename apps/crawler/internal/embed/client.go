// Package embed talks to the OmniJob API's /embed endpoint, which proxies
// to the local Ollama nomic-embed-text model. Centralized here so all source
// adapters take the same code path.
package embed

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
	"unicode/utf8"
)

const maxChars = 6000 // safe upper bound for nomic-embed-text token budget

type Client struct {
	APIURL string
	HTTP   *http.Client
}

func NewClient(apiURL string) *Client {
	return &Client{
		APIURL: apiURL,
		HTTP:   &http.Client{Timeout: 60 * time.Second},
	}
}

type embedRequest struct {
	Text string `json:"text"`
}

type embedResponse struct {
	Vector []float32 `json:"vector"`
	Dim    int       `json:"dim"`
}

// Embed sends `text` to /embed and returns the resulting vector. Long text
// is truncated to maxChars before sending.
func (c *Client) Embed(ctx context.Context, text string) ([]float32, error) {
	t := truncate(text, maxChars)
	body, err := json.Marshal(embedRequest{Text: t})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.APIURL+"/embed", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("embed failed: %s: %s", resp.Status, b)
	}
	var out embedResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return out.Vector, nil
}

func truncate(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}
