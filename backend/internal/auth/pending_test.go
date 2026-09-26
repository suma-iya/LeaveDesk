package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
)

// cookieFrom returns the named cookie a handler set on w.
func cookieFrom(t *testing.T, w *httptest.ResponseRecorder, name string) *http.Cookie {
	t.Helper()
	for _, c := range w.Result().Cookies() {
		if c.Name == name {
			return c
		}
	}
	t.Fatalf("no %s cookie set", name)
	return nil
}

func TestGooglePendingCookie(t *testing.T) {
	s := NewSessions("test-secret-at-least-16", time.Hour, false)
	id := &GoogleIdentity{Subject: "sub-1", Email: "new@company.test", FirstName: "Nadia", LastName: "Rahman"}

	w := httptest.NewRecorder()
	if err := s.StartGooglePending(w, id); err != nil {
		t.Fatal(err)
	}
	pending := cookieFrom(t, w, PendingCookie)
	if pending.Path != "/api/auth" || !pending.HttpOnly || pending.SameSite != http.SameSiteLaxMode || pending.MaxAge != 600 {
		t.Fatalf("unexpected cookie attributes: %+v", pending)
	}

	session := httptest.NewRecorder()
	if err := s.Start(session, &domain.User{ID: "u1", Role: domain.RoleEmployee}); err != nil {
		t.Fatal(err)
	}
	sessionToken := cookieFrom(t, session, CookieName).Value

	tests := []struct {
		name  string
		value string
		ok    bool
	}{
		{"round trip", pending.Value, true},
		{"tampered signature", pending.Value[:len(pending.Value)-2] + "xx", false},
		{"signed with another secret", signedWith(t, "another-secret-16chars", id), false},
		{"a session token is not a pending token", sessionToken, false},
		{"garbage", "not-a-token", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/api/auth/google/pending", nil)
			r.AddCookie(&http.Cookie{Name: PendingCookie, Value: tt.value})
			got, err := s.ReadGooglePending(r)
			if !tt.ok {
				if err == nil {
					t.Fatalf("want an error, got %+v", got)
				}
				return
			}
			if err != nil || *got != *id {
				t.Fatalf("got %+v, %v; want %+v", got, err, id)
			}
		})
	}

	// A pending token must not work as a session either.
	r := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	r.AddCookie(&http.Cookie{Name: CookieName, Value: pending.Value})
	if _, err := s.Read(r); err == nil || !strings.Contains(err.Error(), "invalid session") {
		t.Fatalf("a pending token was accepted as a session: %v", err)
	}
}

func signedWith(t *testing.T, secret string, id *GoogleIdentity) string {
	t.Helper()
	w := httptest.NewRecorder()
	if err := NewSessions(secret, time.Hour, false).StartGooglePending(w, id); err != nil {
		t.Fatal(err)
	}
	return cookieFrom(t, w, PendingCookie).Value
}
