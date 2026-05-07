package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	RedisURL             string
	APIURL               string
	SeedFile             string
	WorkerCount          int
	MaxDepth             int
	PerDomainParallelism int
	PerDomainDelay       time.Duration
	UserAgent            string
}

func Load() Config {
	return Config{
		RedisURL:             env("REDIS_URL", "redis://localhost:6379"),
		APIURL:               env("API_URL", "http://localhost:3000"),
		SeedFile:             env("SEED_FILE", "./seeds.txt"),
		WorkerCount:          envInt("WORKER_COUNT", 4),
		MaxDepth:             envInt("MAX_DEPTH", 2),
		PerDomainParallelism: envInt("PER_DOMAIN_PARALLELISM", 2),
		PerDomainDelay:       time.Duration(envInt("PER_DOMAIN_DELAY_MS", 1500)) * time.Millisecond,
		UserAgent:            env("USER_AGENT", "OmniJobBot/0.1 (+https://omnijob.example/bot)"),
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
