package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/account"
	"github.com/suma-iya/leavedesk/backend/internal/auth"
	"github.com/suma-iya/leavedesk/backend/internal/config"
	"github.com/suma-iya/leavedesk/backend/internal/domain"
	"github.com/suma-iya/leavedesk/backend/internal/store"
)

// fakeGoogle stands in for Google: Exchange returns identity or err.
type fakeGoogle struct {
	identity  *auth.GoogleIdentity
	err       error
	exchanged bool
}

func (f *fakeGoogle) AuthURL(state string) string {
	return "https://accounts.google.test/auth?state=" + state
}
func (f *fakeGoogle) Exchange(context.Context, string) (*auth.GoogleIdentity, error) {
	f.exchanged = true
	return f.identity, f.err
}

// accountStore is the in-memory part of account.Store these handlers use.
type accountStore struct {
	account.Store
	users   []*domain.User
	hasHR   bool
	created *store.NewUser
}

func (f *accountStore) UserByGoogleSub(_ context.Context, sub string) (*domain.User, error) {
	for _, u := range f.users {
		if u.GoogleSub != nil && *u.GoogleSub == sub {
			return u, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (f *accountStore) UserByEmail(_ context.Context, email string) (*domain.User, error) {
	for _, u := range f.users {
		if u.Email == email {
			return u, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (f *accountStore) CreateUser(_ context.Context, n store.NewUser, decide func(bool) domain.Role) (*domain.User, error) {
	f.created = &n
	return &domain.User{ID: "new-user", Email: n.Email, FirstName: n.FirstName, LastName: n.LastName,
		DateOfBirth: n.DateOfBirth.Time, Role: decide(f.hasHR), PasswordHash: n.PasswordHash, GoogleSub: n.GoogleSub}, nil
}

const testSecret = "test-secret-at-least-16"

func testServer(fs *accountStore, g *fakeGoogle) *Server {
	today := func() time.Time { return time.Date(2026, 9, 26, 0, 0, 0, 0, time.UTC) }
	cfg := &config.Config{JWTSecret: testSecret, SessionTTL: time.Hour, Location: time.UTC}
	s := NewServer(cfg, Deps{Accounts: account.NewService(fs, nil, today)})
	s.google = g
	return s
}

func cookie(res *http.Response, name string) *http.Cookie {
	for _, c := range res.Cookies() {
		if c.Name == name {
			return c
		}
	}
	return nil
}

func TestGoogleCallback(t *testing.T) {
	sub := "sub-known"
	known := &domain.User{ID: "u1", Email: "known@company.test", Role: domain.RoleEmployee, GoogleSub: &sub}

	tests := []struct {
		name         string
		query        string
		stateCookie  string
		identity     *auth.GoogleIdentity
		exchangeErr  error
		wantLocation string
		wantExchange bool
		wantSession  bool
		wantPending  bool
	}{
		{name: "cancel on Google's screen", query: "error=access_denied&state=s1", stateCookie: "s1",
			wantLocation: "/login?error=" + url.QueryEscape("Google sign-in was cancelled.")},
		{name: "other Google error", query: "error=server_error&state=s1", stateCookie: "s1",
			wantLocation: "/login?error=" + url.QueryEscape("Google sign-in failed. Please try again.")},
		{name: "state mismatch", query: "code=c&state=s2", stateCookie: "s1",
			wantLocation: "/login?error=" + url.QueryEscape("Your Google sign-in expired or was started in another tab. Please try again.")},
		{name: "state cookie missing", query: "code=c&state=s1",
			wantLocation: "/login?error=" + url.QueryEscape("Your Google sign-in expired or was started in another tab. Please try again.")},
		{name: "no code", query: "state=s1", stateCookie: "s1",
			wantLocation: "/login?error=" + url.QueryEscape("Google sign-in failed. Please try again.")},
		{name: "exchange fails", query: "code=c&state=s1", stateCookie: "s1", exchangeErr: errors.New("google token exchange failed: status 400 invalid_grant"),
			wantExchange: true, wantLocation: "/login?error=" + url.QueryEscape("We couldn't verify your Google sign-in. Please try again.")},
		{name: "email not verified", query: "code=c&state=s1", stateCookie: "s1", exchangeErr: auth.ErrEmailNotVerified,
			wantExchange: true, wantLocation: "/login?error=" + url.QueryEscape("Your Google email address is not verified. Verify it with Google, then try again.")},
		{name: "success signs in", query: "code=c&state=s1", stateCookie: "s1", identity: &auth.GoogleIdentity{Subject: sub, Email: "known@company.test"},
			wantExchange: true, wantLocation: "/", wantSession: true},
		{name: "no account yet goes to registration", query: "code=c&state=s1", stateCookie: "s1",
			identity:     &auth.GoogleIdentity{Subject: "sub-new", Email: "new@company.test", FirstName: "Nadia", LastName: "Rahman"},
			wantExchange: true, wantLocation: "/register?via=google", wantPending: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			g := &fakeGoogle{identity: tt.identity, err: tt.exchangeErr}
			s := testServer(&accountStore{users: []*domain.User{known}}, g)
			r := httptest.NewRequest(http.MethodGet, "/api/auth/google/callback?"+tt.query, nil)
			if tt.stateCookie != "" {
				r.AddCookie(&http.Cookie{Name: stateCookie, Value: tt.stateCookie})
			}
			w := httptest.NewRecorder()
			s.Handler().ServeHTTP(w, r)
			res := w.Result()

			if res.StatusCode != http.StatusFound || res.Header.Get("Location") != tt.wantLocation {
				t.Fatalf("got %d → %q, want 302 → %q", res.StatusCode, res.Header.Get("Location"), tt.wantLocation)
			}
			if g.exchanged != tt.wantExchange {
				t.Fatalf("exchanged = %v, want %v", g.exchanged, tt.wantExchange)
			}
			if c := cookie(res, stateCookie); c == nil || c.MaxAge >= 0 {
				t.Fatalf("the state cookie must be cleared, got %+v", c)
			}
			if got := cookie(res, auth.CookieName) != nil; got != tt.wantSession {
				t.Fatalf("session cookie set = %v, want %v", got, tt.wantSession)
			}
			if got := cookie(res, auth.PendingCookie) != nil; got != tt.wantPending {
				t.Fatalf("pending cookie set = %v, want %v", got, tt.wantPending)
			}
		})
	}
}

// pendingCookie is what the callback would have set for identity.
func pendingCookie(t *testing.T, id *auth.GoogleIdentity) *http.Cookie {
	t.Helper()
	w := httptest.NewRecorder()
	if err := auth.NewSessions(testSecret, time.Hour, false).StartGooglePending(w, id); err != nil {
		t.Fatal(err)
	}
	return cookie(w.Result(), auth.PendingCookie)
}

func TestGooglePending(t *testing.T) {
	id := &auth.GoogleIdentity{Subject: "sub-new", Email: "new@company.test", FirstName: "Nadia", LastName: "Rahman"}
	s := testServer(&accountStore{}, &fakeGoogle{})

	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/auth/google/pending", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("without a cookie: got %d, want 404", w.Code)
	}

	r := httptest.NewRequest(http.MethodGet, "/api/auth/google/pending", nil)
	r.AddCookie(pendingCookie(t, id))
	w = httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	var got map[string]string
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil || w.Code != http.StatusOK {
		t.Fatalf("got %d, %v", w.Code, err)
	}
	if got["email"] != "new@company.test" || got["firstName"] != "Nadia" || got["lastName"] != "Rahman" || len(got) != 3 {
		t.Fatalf("unexpected body %v", got)
	}
}

func TestGoogleComplete(t *testing.T) {
	id := &auth.GoogleIdentity{Subject: "sub-new", Email: "new@company.test", FirstName: "Nadia", LastName: "Rahman"}
	valid := pendingCookie(t, id)
	tampered := *valid
	tampered.Value = strings.Replace(valid.Value, ".", ".x", 1) // breaks the signed payload

	tests := []struct {
		name     string
		cookie   *http.Cookie
		body     string
		hasHR    bool
		want     int
		wantCode string
		wantRole domain.Role
	}{
		{name: "creates a Google-only employee", cookie: valid, body: `{"dateOfBirth":"1998-12-02"}`, hasHR: true, want: 201, wantRole: domain.RoleEmployee},
		{name: "first user becomes HR", cookie: valid, body: `{"dateOfBirth":"1998-12-02"}`, want: 201, wantRole: domain.RoleHR},
		{name: "under 18", cookie: valid, body: `{"dateOfBirth":"2008-09-27"}`, hasHR: true, want: 400, wantCode: "VALIDATION"},
		{name: "missing cookie", body: `{"dateOfBirth":"1998-12-02"}`, hasHR: true, want: 400, wantCode: "GOOGLE_EXPIRED"},
		{name: "tampered cookie", cookie: &tampered, body: `{"dateOfBirth":"1998-12-02"}`, hasHR: true, want: 400, wantCode: "GOOGLE_EXPIRED"},
		{name: "email in the body is refused", cookie: valid, body: `{"dateOfBirth":"1998-12-02","email":"boss@company.test"}`, hasHR: true, want: 400, wantCode: "VALIDATION"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fs := &accountStore{hasHR: tt.hasHR}
			s := testServer(fs, &fakeGoogle{})
			r := httptest.NewRequest(http.MethodPost, "/api/auth/google/complete", strings.NewReader(tt.body))
			if tt.cookie != nil {
				r.AddCookie(tt.cookie)
			}
			w := httptest.NewRecorder()
			s.Handler().ServeHTTP(w, r)
			res := w.Result()
			var body map[string]any
			_ = json.NewDecoder(res.Body).Decode(&body)

			if res.StatusCode != tt.want {
				t.Fatalf("got %d %v, want %d", res.StatusCode, body, tt.want)
			}
			if tt.want != http.StatusCreated {
				if body["error"] != tt.wantCode {
					t.Fatalf("error code %v, want %s", body["error"], tt.wantCode)
				}
				if fs.created != nil || cookie(res, auth.CookieName) != nil {
					t.Fatal("a failed completion must not create a user or a session")
				}
				return
			}
			if body["email"] != "new@company.test" || body["role"] != string(tt.wantRole) || body["hasPassword"] != false {
				t.Fatalf("unexpected user %v", body)
			}
			if n := fs.created; n.PasswordHash != nil || n.GoogleSub == nil || *n.GoogleSub != "sub-new" {
				t.Fatalf("want google_sub set and password_hash NULL, got %+v", n)
			}
			if cookie(res, auth.CookieName) == nil {
				t.Fatal("want a session cookie")
			}
			if c := cookie(res, auth.PendingCookie); c == nil || c.MaxAge >= 0 {
				t.Fatalf("the pending cookie must be cleared, got %+v", c)
			}
		})
	}
}
