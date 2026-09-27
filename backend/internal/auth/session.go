package auth

import (
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
)

// CookieName is the httpOnly session cookie. JavaScript can never read it,
// so an XSS bug cannot steal the session.
const CookieName = "ld_session"

type Claims struct {
	Role domain.Role `json:"role"`
	jwt.RegisteredClaims
}

type Sessions struct {
	secret []byte
	ttl    time.Duration
	secure bool
}

func NewSessions(secret string, ttl time.Duration, secure bool) *Sessions {
	return &Sessions{secret: []byte(secret), ttl: ttl, secure: secure}
}

// Start signs a JWT (sub, role) and sets it as the session cookie.
func (s *Sessions) Start(w http.ResponseWriter, u *domain.User) error {
	now := time.Now()
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{
		Role: u.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   u.ID,
			Issuer:    "leavedesk",
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.ttl)),
		},
	}).SignedString(s.secret)
	if err != nil {
		return fmt.Errorf("sign session: %w", err)
	}
	http.SetCookie(w, &http.Cookie{
		Name: CookieName, Value: token, Path: "/", MaxAge: int(s.ttl.Seconds()),
		HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: s.secure,
	})
	return nil
}

// End clears the cookie.
func (s *Sessions) End(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: CookieName, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: s.secure,
	})
}

// Read verifies the cookie's signature, algorithm, issuer and expiry and
// returns the user id. The role is reloaded from the database by the
// middleware, so a role change applies immediately.
func (s *Sessions) Read(r *http.Request) (string, error) {
	cookie, err := r.Cookie(CookieName)
	if err != nil {
		return "", errors.New("no session cookie")
	}
	claims := &Claims{}
	_, err = jwt.ParseWithClaims(cookie.Value, claims, func(*jwt.Token) (any, error) { return s.secret, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithIssuer("leavedesk"), jwt.WithExpirationRequired())
	if err != nil {
		return "", fmt.Errorf("invalid session: %w", err)
	}
	return claims.Subject, nil
}
