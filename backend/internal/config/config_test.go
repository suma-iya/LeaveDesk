package config

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

var allKeys = []string{
	"PORT", "DATABASE_URL", "JWT_SECRET", "COOKIE_SECURE", "UPLOAD_DIR", "ALLOWED_EMAIL_DOMAINS",
	"GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URL", "SESSION_TTL", "APP_TIMEZONE",
	"LEAVE_DEFAULT_ANNUAL", "LEAVE_DEFAULT_CASUAL", "LEAVE_DEFAULT_SICK",
}

// setEnv blanks every key Load reads (empty means "unset" to Load), then
// applies the minimum valid settings and the overrides.
func setEnv(t *testing.T, overrides map[string]string) {
	t.Helper()
	for _, k := range allKeys {
		t.Setenv(k, "")
	}
	t.Setenv("DATABASE_URL", "postgres://leavedesk@db/leavedesk")
	t.Setenv("JWT_SECRET", "0123456789abcdef")
	for k, v := range overrides {
		t.Setenv(k, v)
	}
}

func TestLoadDefaults(t *testing.T) {
	setEnv(t, nil)
	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Port != "8080" || cfg.SessionTTL != 8*time.Hour || cfg.UploadDir != "/data/uploads" || cfg.CookieSecure {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
	if cfg.Location == nil || cfg.Location.String() != "Asia/Dhaka" {
		t.Fatalf("default timezone %v, want Asia/Dhaka", cfg.Location)
	}
	if want := map[string]int{"annual": 16, "casual": 3, "sick": 3}; !reflect.DeepEqual(cfg.DefaultLimits, want) {
		t.Fatalf("limits %v, want %v", cfg.DefaultLimits, want)
	}
	if cfg.AllowedEmailDomains != nil {
		t.Fatalf("no domains configured means any domain, got %v", cfg.AllowedEmailDomains)
	}
	if cfg.GoogleRedirectURL != "http://localhost:3000/api/auth/google/callback" || cfg.GoogleEnabled() {
		t.Fatalf("unexpected Google defaults: %q enabled=%v", cfg.GoogleRedirectURL, cfg.GoogleEnabled())
	}
}

func TestLoadOverrides(t *testing.T) {
	setEnv(t, map[string]string{
		"PORT": "9090", "COOKIE_SECURE": "true", "UPLOAD_DIR": "/tmp/up", "SESSION_TTL": "90m",
		"APP_TIMEZONE": "UTC", "LEAVE_DEFAULT_ANNUAL": "20", "LEAVE_DEFAULT_CASUAL": "0", "LEAVE_DEFAULT_SICK": "10",
		"ALLOWED_EMAIL_DOMAINS": " Company.TEST, ,partner.test ,", "GOOGLE_REDIRECT_URL": "https://leave.example/cb",
	})
	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Port != "9090" || !cfg.CookieSecure || cfg.UploadDir != "/tmp/up" || cfg.SessionTTL != 90*time.Minute {
		t.Fatalf("overrides not applied: %+v", cfg)
	}
	if cfg.Location != time.UTC {
		t.Fatalf("timezone %v, want UTC", cfg.Location)
	}
	if want := map[string]int{"annual": 20, "casual": 0, "sick": 10}; !reflect.DeepEqual(cfg.DefaultLimits, want) {
		t.Fatalf("limits %v, want %v", cfg.DefaultLimits, want)
	}
	if want := []string{"company.test", "partner.test"}; !reflect.DeepEqual(cfg.AllowedEmailDomains, want) {
		t.Fatalf("domains %q, want %q", cfg.AllowedEmailDomains, want)
	}
	if cfg.GoogleRedirectURL != "https://leave.example/cb" {
		t.Fatalf("redirect %q", cfg.GoogleRedirectURL)
	}
}

func TestLoadCookieSecure(t *testing.T) {
	for value, want := range map[string]bool{"true": true, "false": false, "": false, "1": false, "yes": false} {
		setEnv(t, map[string]string{"COOKIE_SECURE": value})
		cfg, err := Load()
		if err != nil {
			t.Fatal(err)
		}
		if cfg.CookieSecure != want {
			t.Errorf("COOKIE_SECURE=%q: got %v, want %v", value, cfg.CookieSecure, want)
		}
	}
}

func TestLoadErrors(t *testing.T) {
	tests := []struct {
		name    string
		env     map[string]string
		wantErr string // substring; "" = valid
	}{
		{name: "missing DATABASE_URL", env: map[string]string{"DATABASE_URL": ""}, wantErr: "DATABASE_URL is required"},
		{name: "missing JWT_SECRET", env: map[string]string{"JWT_SECRET": ""}, wantErr: "JWT_SECRET must be at least 16"},
		{name: "15-character JWT_SECRET", env: map[string]string{"JWT_SECRET": "0123456789abcde"}, wantErr: "JWT_SECRET must be at least 16"},
		{name: "16-character JWT_SECRET", env: map[string]string{"JWT_SECRET": "0123456789abcdef"}},
		{name: "SESSION_TTL without a unit", env: map[string]string{"SESSION_TTL": "8"}, wantErr: "parse SESSION_TTL"},
		{name: "SESSION_TTL in words", env: map[string]string{"SESSION_TTL": "8 hours"}, wantErr: "parse SESSION_TTL"},
		{name: "SESSION_TTL compound", env: map[string]string{"SESSION_TTL": "1h30m"}},
		{name: "unknown APP_TIMEZONE", env: map[string]string{"APP_TIMEZONE": "Mars/Olympus_Mons"}, wantErr: "load APP_TIMEZONE"},
		{name: "APP_TIMEZONE Europe/London", env: map[string]string{"APP_TIMEZONE": "Europe/London"}},
		{name: "negative annual", env: map[string]string{"LEAVE_DEFAULT_ANNUAL": "-1"}, wantErr: "LEAVE_DEFAULT_ANNUAL must be a whole number >= 0"},
		{name: "fractional casual", env: map[string]string{"LEAVE_DEFAULT_CASUAL": "2.5"}, wantErr: "LEAVE_DEFAULT_CASUAL must be a whole number >= 0"},
		{name: "text sick", env: map[string]string{"LEAVE_DEFAULT_SICK": "three"}, wantErr: "LEAVE_DEFAULT_SICK must be a whole number >= 0"},
		{name: "zero sick is allowed", env: map[string]string{"LEAVE_DEFAULT_SICK": "0"}},
		{name: "DATABASE_URL is checked before JWT_SECRET", env: map[string]string{"DATABASE_URL": "", "JWT_SECRET": ""}, wantErr: "DATABASE_URL"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			setEnv(t, tt.env)
			cfg, err := Load()
			if tt.wantErr == "" {
				if err != nil || cfg == nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("want error containing %q, got %v", tt.wantErr, err)
			}
			if cfg != nil {
				t.Fatalf("a failed Load must return no config, got %+v", cfg)
			}
		})
	}
}

func TestGoogleEnabled(t *testing.T) {
	tests := []struct {
		id, secret string
		want       bool
	}{
		{"client.apps.googleusercontent.com", "shh", true},
		{"client.apps.googleusercontent.com", "", false},
		{"", "shh", false},
		{"", "", false},
	}
	for _, tt := range tests {
		c := &Config{GoogleClientID: tt.id, GoogleClientSecret: tt.secret}
		if got := c.GoogleEnabled(); got != tt.want {
			t.Errorf("GoogleEnabled(id=%q, secret=%q) = %v, want %v", tt.id, tt.secret, got, tt.want)
		}
	}

	setEnv(t, map[string]string{"GOOGLE_CLIENT_ID": "client.apps.googleusercontent.com", "GOOGLE_CLIENT_SECRET": "shh"})
	cfg, err := Load()
	if err != nil || !cfg.GoogleEnabled() {
		t.Fatalf("Google should be enabled from the environment: %v", err)
	}
}

func TestSplitList(t *testing.T) {
	tests := []struct {
		in   string
		want []string
	}{
		{"", nil},
		{" , ,", nil},
		{"a.test", []string{"a.test"}},
		{"A.test,B.TEST", []string{"a.test", "b.test"}},
		{"  a.test ,\tb.test  ", []string{"a.test", "b.test"}},
	}
	for _, tt := range tests {
		if got := splitList(tt.in); !reflect.DeepEqual(got, tt.want) {
			t.Errorf("splitList(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}
