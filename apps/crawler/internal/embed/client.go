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
	"strconv"
	"time"
	"unicode/utf8"
)

const maxChars = 6000 // safe upper bound for nomic-embed-text token budget

// Retry tuning. The API rate-limit returns 429 with a Retry-After header
// (seconds); Ollama overload typically surfaces as 503 or other 5xx. We cap
// total attempts so a permanently broken backend doesn't pin a worker, and
// cap each sleep so a misbehaving Retry-After can't stall us indefinitely.
const (
	maxRetries        = 4
	retryAfterCap     = 30 * time.Second
	backoffBase       = 1 * time.Second
	backoffMax        = 16 * time.Second
	defaultRetryAfter = 1 * time.Second
)

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

type embedBatchRequest struct {
	Texts []string `json:"texts"`
}

type embedBatchResponse struct {
	Vectors [][]float32 `json:"vectors"`
	Dim     int         `json:"dim"`
}

// retryKind classifies a failed attempt so the loop can pick the right
// backoff policy.
type retryKind int

const (
	retryNone     retryKind = iota // not retryable; bail out
	retryAfter                     // 429: honor Retry-After or fall back
	retryBackoff                   // 5xx: exponential backoff
)

// Embed sends `text` to /embed and returns the resulting vector. Long text
// is truncated to maxChars before sending. Transient failures (429 and 5xx)
// are retried with backoff; non-retryable failures (other 4xx) and final
// errors are returned to the caller so it can log+skip the job. If the
// parent context is cancelled mid-backoff, ctx.Err() is returned.
//
// Implemented as a thin wrapper around EmbedBatch so the single-text and
// batch paths share retry/backoff/timeout policy and stay in sync.
func (c *Client) Embed(ctx context.Context, text string) ([]float32, error) {
	vecs, err := c.EmbedBatch(ctx, []string{text})
	if err != nil {
		return nil, err
	}
	if len(vecs) != 1 {
		return nil, fmt.Errorf("embed: expected 1 vector, got %d", len(vecs))
	}
	return vecs[0], nil
}

// EmbedBatch sends a slice of texts to /embed in a single request and
// returns one vector per input, in the same order. Each text is truncated
// to maxChars individually. Retry/backoff policy is identical to Embed:
// 429 and 5xx are retried with bounded backoff, other errors fail fast,
// and ctx cancellation is honored during backoff sleeps.
//
// Returns an error if the server returns a different number of vectors
// than texts sent; partial batches are treated as a whole-batch failure so
// the caller never sees a mis-aligned (text, vector) pair.
func (c *Client) EmbedBatch(ctx context.Context, texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}
	trunc := make([]string, len(texts))
	for i, t := range texts {
		trunc[i] = truncate(t, maxChars)
	}
	body, err := json.Marshal(embedBatchRequest{Texts: trunc})
	if err != nil {
		return nil, err
	}

	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		vecs, kind, after, err := c.embedBatchOnce(ctx, body)
		if err == nil {
			if len(vecs) != len(texts) {
				return nil, fmt.Errorf("embed batch: sent %d texts, got %d vectors", len(texts), len(vecs))
			}
			return vecs, nil
		}
		lastErr = err
		if kind == retryNone || attempt == maxRetries {
			return nil, err
		}
		delay := nextDelay(kind, attempt, after)
		if err := sleepCtx(ctx, delay); err != nil {
			return nil, err
		}
	}
	return nil, lastErr
}

// embedBatchOnce performs a single POST to /embed with a batch payload.
// On transient failure it returns the kind of retry the caller should
// perform and, for 429s, the server-suggested delay parsed from Retry-After.
func (c *Client) embedBatchOnce(ctx context.Context, body []byte) ([][]float32, retryKind, time.Duration, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.APIURL+"/embed", bytes.NewReader(body))
	if err != nil {
		return nil, retryNone, 0, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		// Surface context errors immediately; other transport errors aren't
		// retried here because http.Client already handles connection-level
		// recovery and we don't want to mask a misconfigured endpoint.
		if ctx.Err() != nil {
			return nil, retryNone, 0, ctx.Err()
		}
		return nil, retryNone, 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		err := fmt.Errorf("embed failed: %s: %s", resp.Status, b)
		switch {
		case resp.StatusCode == http.StatusTooManyRequests:
			return nil, retryAfter, parseRetryAfter(resp.Header.Get("Retry-After")), err
		case resp.StatusCode >= 500 && resp.StatusCode <= 599:
			return nil, retryBackoff, 0, err
		default:
			return nil, retryNone, 0, err
		}
	}
	var out embedBatchResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, retryNone, 0, err
	}
	return out.Vectors, retryNone, 0, nil
}

// nextDelay picks the sleep duration before the next attempt. For 429s we
// honor the server-supplied Retry-After (capped). For 5xx we use
// exponential backoff: 1s, 2s, 4s, 8s, capped at 16s.
func nextDelay(kind retryKind, attempt int, after time.Duration) time.Duration {
	switch kind {
	case retryAfter:
		if after <= 0 {
			return defaultRetryAfter
		}
		return after
	case retryBackoff:
		return backoffFor(attempt)
	default:
		return 0
	}
}

// parseRetryAfter parses a Retry-After header in seconds. We deliberately
// ignore the HTTP-date form; the API only emits seconds.
func parseRetryAfter(h string) time.Duration {
	if h == "" {
		return defaultRetryAfter
	}
	secs, err := strconv.Atoi(h)
	if err != nil || secs <= 0 {
		return defaultRetryAfter
	}
	d := time.Duration(secs) * time.Second
	if d > retryAfterCap {
		return retryAfterCap
	}
	return d
}

// backoffFor returns the exponential-backoff delay for the given retry
// attempt index (0-based: first retry waits backoffBase).
func backoffFor(attempt int) time.Duration {
	if attempt < 0 {
		attempt = 0
	}
	d := backoffBase << attempt
	if d <= 0 || d > backoffMax {
		return backoffMax
	}
	return d
}

// sleepCtx sleeps for d, returning early with ctx.Err() if the parent
// context is cancelled. A zero or negative duration returns immediately.
func sleepCtx(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return nil
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
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
