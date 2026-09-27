package auth

import (
	"crypto/rand"
	"crypto/rsa"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
)

const sessionSecret = "test-secret-at-least-16"

func TestPassword(t *testing.T) {
	hash, err := HashPassword("password123")
	if err != nil {
		t.Fatal(err)
	}
	if hash == "password123" || !strings.HasPrefix(hash, "$2") {
		t.Fatalf("want a bcrypt hash, got %q", hash)
	}
	again, _ := HashPassword("password123")
	if again == hash {
		t.Fatal("two hashes of the same password must differ (salted)")
	}
	tests := []struct {
		name  string
		hash  string
		plain string
		want  bool
	}{
		{"right password", hash, "password123", true},
		{"second hash also matches", again, "password123", true},
		{"wrong password", hash, "password124", false},
		{"case matters", hash, "Password123", false},
		{"empty password", hash, "", false},
		{"not a bcrypt hash", "plain-text", "plain-text", false},
		{"empty hash", "", "password123", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := CheckPassword(tt.hash, tt.plain); got != tt.want {
				t.Fatalf("CheckPassword = %v, want %v", got, tt.want)
			}
		})
	}
}

// bcrypt only accepts up to 72 bytes; HashPassword reports that as an error
// (the account layer does not check the upper bound, see account tests).
func TestHashPasswordTooLong(t *testing.T) {
	if _, err := HashPassword(strings.Repeat("a", 72)); err != nil {
		t.Fatalf("72 bytes is bcrypt's limit and must work: %v", err)
	}
	if _, err := HashPassword(strings.Repeat("a", 73)); err == nil {
		t.Fatal("want an error for 73 bytes")
	}
}

func sessionCookie(t *testing.T, s *Sessions, u *domain.User) *http.Cookie {
	t.Helper()
	w := httptest.NewRecorder()
	if err := s.Start(w, u); err != nil {
		t.Fatal(err)
	}
	return cookieFrom(t, w, CookieName)
}

func signToken(t *testing.T, method jwt.SigningMethod, key any, c Claims) string {
	t.Helper()
	s, err := jwt.NewWithClaims(method, c).SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestSessionStart(t *testing.T) {
	for _, secure := range []bool{false, true} {
		s := NewSessions(sessionSecret, 2*time.Hour, secure)
		c := sessionCookie(t, s, &domain.User{ID: "u1", Role: domain.RoleHR})
		if c.Path != "/" || !c.HttpOnly || c.SameSite != http.SameSiteLaxMode || c.MaxAge != 7200 || c.Secure != secure {
			t.Fatalf("unexpected cookie attributes: %+v", c)
		}
		claims := &Claims{}
		if _, err := jwt.ParseWithClaims(c.Value, claims, func(*jwt.Token) (any, error) { return []byte(sessionSecret), nil }); err != nil {
			t.Fatal(err)
		}
		if claims.Subject != "u1" || claims.Role != domain.RoleHR || claims.Issuer != "leavedesk" {
			t.Fatalf("unexpected claims %+v", claims)
		}
		if ttl := claims.ExpiresAt.Sub(claims.IssuedAt.Time); ttl != 2*time.Hour {
			t.Fatalf("token lives %v, want 2h", ttl)
		}
	}
}

func TestSessionRead(t *testing.T) {
	s := NewSessions(sessionSecret, time.Hour, false)
	valid := sessionCookie(t, s, &domain.User{ID: "u1", Role: domain.RoleEmployee})

	parts := strings.Split(valid.Value, ".")
	// Swap the payload for one claiming a different user, keeping the signature.
	forged := signToken(t, jwt.SigningMethodHS256, []byte("attacker-secret-1234"), Claims{Role: domain.RoleHR,
		RegisteredClaims: jwt.RegisteredClaims{Subject: "boss", Issuer: "leavedesk", ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}})
	tamperedPayload := parts[0] + "." + strings.Split(forged, ".")[1] + "." + parts[2]

	now := time.Now()
	good := func(mut func(*Claims)) Claims {
		c := Claims{Role: domain.RoleEmployee, RegisteredClaims: jwt.RegisteredClaims{
			Subject: "u1", Issuer: "leavedesk", IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
		}}
		if mut != nil {
			mut(&c)
		}
		return c
	}
	rsaKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name   string
		cookie *http.Cookie // nil = no cookie
		wantID string       // "" = must fail
	}{
		{name: "round trip", cookie: valid, wantID: "u1"},
		{name: "hand-built valid token", cookie: &http.Cookie{Name: CookieName, Value: signToken(t, jwt.SigningMethodHS256, []byte(sessionSecret), good(nil))}, wantID: "u1"},
		{name: "missing cookie"},
		{name: "empty cookie", cookie: &http.Cookie{Name: CookieName, Value: ""}},
		{name: "garbage", cookie: &http.Cookie{Name: CookieName, Value: "not.a.jwt"}},
		{name: "tampered signature", cookie: &http.Cookie{Name: CookieName, Value: valid.Value[:len(valid.Value)-4] + "AAAA"}},
		{name: "tampered payload", cookie: &http.Cookie{Name: CookieName, Value: tamperedPayload}},
		{name: "expired", cookie: &http.Cookie{Name: CookieName, Value: signToken(t, jwt.SigningMethodHS256, []byte(sessionSecret), good(func(c *Claims) {
			c.IssuedAt = jwt.NewNumericDate(now.Add(-2 * time.Hour))
			c.ExpiresAt = jwt.NewNumericDate(now.Add(-time.Minute))
		}))}},
		{name: "not valid yet", cookie: &http.Cookie{Name: CookieName, Value: signToken(t, jwt.SigningMethodHS256, []byte(sessionSecret), good(func(c *Claims) {
			c.NotBefore = jwt.NewNumericDate(now.Add(time.Hour))
		}))}},
		{name: "wrong secret", cookie: sessionCookie(t, NewSessions("another-secret-16chars", time.Hour, false), &domain.User{ID: "u1"})},
		{name: "wrong issuer", cookie: &http.Cookie{Name: CookieName, Value: signToken(t, jwt.SigningMethodHS256, []byte(sessionSecret), good(func(c *Claims) { c.Issuer = "someone-else" }))}},
		{name: "no issuer", cookie: &http.Cookie{Name: CookieName, Value: signToken(t, jwt.SigningMethodHS256, []byte(sessionSecret), good(func(c *Claims) { c.Issuer = "" }))}},
		{name: "alg none", cookie: &http.Cookie{Name: CookieName, Value: signToken(t, jwt.SigningMethodNone, jwt.UnsafeAllowNoneSignatureType, good(nil))}},
		{name: "HS512 with the right secret", cookie: &http.Cookie{Name: CookieName, Value: signToken(t, jwt.SigningMethodHS512, []byte(sessionSecret), good(nil))}},
		{name: "RS256", cookie: &http.Cookie{Name: CookieName, Value: signToken(t, jwt.SigningMethodRS256, rsaKey, good(nil))}},
		{name: "cookie under another name", cookie: &http.Cookie{Name: "session", Value: valid.Value}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/api/me", nil)
			if tt.cookie != nil {
				r.AddCookie(&http.Cookie{Name: tt.cookie.Name, Value: tt.cookie.Value})
			}
			id, err := s.Read(r)
			if tt.wantID == "" {
				if err == nil {
					t.Fatalf("want an error, got id %q", id)
				}
				return
			}
			if err != nil || id != tt.wantID {
				t.Fatalf("got %q, %v; want %q", id, err, tt.wantID)
			}
		})
	}
}

// A session token must carry an expiry, like the Google pending token.
func TestSessionReadRequiresExpiry(t *testing.T) {
	s := NewSessions(sessionSecret, time.Hour, false)
	token := signToken(t, jwt.SigningMethodHS256, []byte(sessionSecret), Claims{RegisteredClaims: jwt.RegisteredClaims{Subject: "u1", Issuer: "leavedesk"}})
	r := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	r.AddCookie(&http.Cookie{Name: CookieName, Value: token})
	if id, err := s.Read(r); err == nil {
		t.Fatalf("a token without exp was accepted for %q", id)
	}
}

func TestSessionEnd(t *testing.T) {
	for _, secure := range []bool{false, true} {
		w := httptest.NewRecorder()
		NewSessions(sessionSecret, time.Hour, secure).End(w)
		c := cookieFrom(t, w, CookieName)
		if c.Value != "" || c.MaxAge >= 0 || c.Path != "/" || !c.HttpOnly || c.Secure != secure {
			t.Fatalf("End must clear the cookie on path /, got %+v", c)
		}
	}
}

func TestEndGooglePending(t *testing.T) {
	w := httptest.NewRecorder()
	NewSessions(sessionSecret, time.Hour, false).EndGooglePending(w)
	c := cookieFrom(t, w, PendingCookie)
	if c.Value != "" || c.MaxAge >= 0 || c.Path != "/api/auth" {
		t.Fatalf("want a cleared pending cookie on /api/auth, got %+v", c)
	}
}
