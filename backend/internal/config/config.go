// Package config reads every setting from environment variables so the same
// binary runs locally and in Docker.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port        string
	DatabaseURL string

	JWTSecret    string
	SessionTTL   time.Duration
	CookieSecure bool // true behind HTTPS; false for http://localhost

	UploadDir string
	Location  *time.Location // company timezone: decides what "today" is

	// Default yearly allowance per leave type (Annual 16, Casual 3, Sick 3).
	DefaultLimits map[string]int

	AllowedEmailDomains []string // empty = any domain

	GoogleClientID     string
	GoogleClientSecret string
	GoogleRedirectURL  string
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:                env("PORT", "8080"),
		DatabaseURL:         os.Getenv("DATABASE_URL"),
		JWTSecret:           os.Getenv("JWT_SECRET"),
		CookieSecure:        env("COOKIE_SECURE", "false") == "true",
		UploadDir:           env("UPLOAD_DIR", "/data/uploads"),
		AllowedEmailDomains: splitList(os.Getenv("ALLOWED_EMAIL_DOMAINS")),
		GoogleClientID:      os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret:  os.Getenv("GOOGLE_CLIENT_SECRET"),
		GoogleRedirectURL:   env("GOOGLE_REDIRECT_URL", "http://localhost:3000/api/auth/google/callback"),
	}
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if len(cfg.JWTSecret) < 16 {
		return nil, fmt.Errorf("JWT_SECRET must be at least 16 characters")
	}

	ttl, err := time.ParseDuration(env("SESSION_TTL", "8h"))
	if err != nil {
		return nil, fmt.Errorf("parse SESSION_TTL: %w", err)
	}
	cfg.SessionTTL = ttl

	loc, err := time.LoadLocation(env("APP_TIMEZONE", "Asia/Dhaka"))
	if err != nil {
		return nil, fmt.Errorf("load APP_TIMEZONE: %w", err)
	}
	cfg.Location = loc

	cfg.DefaultLimits = map[string]int{}
	for leaveType, fallback := range map[string]string{"annual": "16", "casual": "3", "sick": "3"} {
		days, err := strconv.Atoi(env("LEAVE_DEFAULT_"+strings.ToUpper(leaveType), fallback))
		if err != nil || days < 0 {
			return nil, fmt.Errorf("LEAVE_DEFAULT_%s must be a whole number >= 0", strings.ToUpper(leaveType))
		}
		cfg.DefaultLimits[leaveType] = days
	}
	return cfg, nil
}

// GoogleEnabled reports whether "Continue with Google" is configured.
func (c *Config) GoogleEnabled() bool {
	return c.GoogleClientID != "" && c.GoogleClientSecret != ""
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func splitList(raw string) []string {
	var out []string
	for _, part := range strings.Split(raw, ",") {
		if part = strings.TrimSpace(strings.ToLower(part)); part != "" {
			out = append(out, part)
		}
	}
	return out
}
