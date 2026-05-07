package queue

import (
	"context"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	queueKey   = "omnijob:queue"   // Redis LIST: pending URLs
	visitedKey = "omnijob:visited" // Redis SET: deduplication
)

// Queue is a Redis-backed URL frontier. LPUSH for enqueue, BRPOP for dequeue.
// Visited-URL deduplication is layered on top using a Redis SET.
type Queue struct {
	rdb *redis.Client
}

func New(redisURL string) (*Queue, error) {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	rdb := redis.NewClient(opt)
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}
	return &Queue{rdb: rdb}, nil
}

// Enqueue adds a URL only if it has not been seen before. Returns true if the
// URL was newly added, false if it was already in the visited set.
func (q *Queue) Enqueue(ctx context.Context, url string) (bool, error) {
	added, err := q.rdb.SAdd(ctx, visitedKey, url).Result()
	if err != nil {
		return false, err
	}
	if added == 0 {
		return false, nil
	}
	if err := q.rdb.LPush(ctx, queueKey, url).Err(); err != nil {
		return false, err
	}
	return true, nil
}

// Dequeue blocks for up to `timeout` waiting for a URL. Returns ("", nil) on
// timeout (no URL available) so callers can poll a shutdown channel between
// calls.
func (q *Queue) Dequeue(ctx context.Context, timeout time.Duration) (string, error) {
	res, err := q.rdb.BRPop(ctx, timeout, queueKey).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return "", nil
		}
		return "", err
	}
	if len(res) < 2 {
		return "", nil
	}
	return res[1], nil
}

// Size returns the current depth of the URL queue (informational).
func (q *Queue) Size(ctx context.Context) (int64, error) {
	return q.rdb.LLen(ctx, queueKey).Result()
}

func (q *Queue) Close() error { return q.rdb.Close() }
