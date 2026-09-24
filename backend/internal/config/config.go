// Package config reads all runtime settings from environment variables,
// so the same binary works locally and inside Docker.
package config

import (
	"fmt"
	"os"
	"strings"
	"time"
)

type Config struct {
	Port        string
	DatabaseURL string
	JWTSecret   string
	JWTTTL      time.Duration

	GoogleClientID string
	// Google accounts with these emails become MANAGER on first login.
	ManagerEmails []string

	SeedManagerName     string
	SeedManagerEmail    string
	SeedManagerPassword string
	SeedDemoData        bool

	// Timezone used to decide which calendar day a request "came in" on.
	Location *time.Location
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:                getEnv("PORT", "8080"),
		DatabaseURL:         os.Getenv("DATABASE_URL"),
		JWTSecret:           os.Getenv("JWT_SECRET"),
		GoogleClientID:      os.Getenv("GOOGLE_CLIENT_ID"),
		ManagerEmails:       splitEmails(os.Getenv("MANAGER_EMAILS")),
		SeedManagerName:     getEnv("SEED_MANAGER_NAME", "Default Manager"),
		SeedManagerEmail:    strings.ToLower(os.Getenv("SEED_MANAGER_EMAIL")),
		SeedManagerPassword: os.Getenv("SEED_MANAGER_PASSWORD"),
		SeedDemoData:        getEnv("SEED_DEMO_DATA", "false") == "true",
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if len(cfg.JWTSecret) < 16 {
		return nil, fmt.Errorf("JWT_SECRET must be at least 16 characters")
	}

	ttl, err := time.ParseDuration(getEnv("JWT_TTL", "24h"))
	if err != nil {
		return nil, fmt.Errorf("parse JWT_TTL: %w", err)
	}
	cfg.JWTTTL = ttl

	loc, err := time.LoadLocation(getEnv("APP_TIMEZONE", "Asia/Dhaka"))
	if err != nil {
		return nil, fmt.Errorf("load APP_TIMEZONE: %w", err)
	}
	cfg.Location = loc

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func splitEmails(raw string) []string {
	var emails []string
	for _, e := range strings.Split(raw, ",") {
		if e = strings.TrimSpace(strings.ToLower(e)); e != "" {
			emails = append(emails, e)
		}
	}
	return emails
}
