package auth

import (
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// PendingCookie holds a verified Google identity that has no account yet,
// so the Register page can finish sign-up with just a date of birth.
const PendingCookie = "ld_google_pending"

const (
	pendingPath = "/api/auth"
	pendingTTL  = 10 * time.Minute
	// A different issuer from the session's, so neither token can stand in
	// for the other even though both are signed with JWT_SECRET.
	pendingIssuer = "leavedesk-google-pending"
)

type pendingClaims struct {
	Email     string `json:"email"`
	FirstName string `json:"given_name"`
	LastName  string `json:"family_name"`
	jwt.RegisteredClaims
}

// StartGooglePending signs the identity (subject = Google sub) into a
// short-lived cookie.
func (s *Sessions) StartGooglePending(w http.ResponseWriter, id *GoogleIdentity) error {
	now := time.Now()
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, pendingClaims{
		Email: id.Email, FirstName: id.FirstName, LastName: id.LastName,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   id.Subject,
			Issuer:    pendingIssuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(pendingTTL)),
		},
	}).SignedString(s.secret)
	if err != nil {
		return fmt.Errorf("sign google pending: %w", err)
	}
	http.SetCookie(w, &http.Cookie{
		Name: PendingCookie, Value: token, Path: pendingPath, MaxAge: int(pendingTTL.Seconds()),
		HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: s.secure,
	})
	return nil
}

// ReadGooglePending verifies the cookie's signature, issuer and expiry.
func (s *Sessions) ReadGooglePending(r *http.Request) (*GoogleIdentity, error) {
	cookie, err := r.Cookie(PendingCookie)
	if err != nil {
		return nil, errors.New("no google pending cookie")
	}
	claims := &pendingClaims{}
	_, err = jwt.ParseWithClaims(cookie.Value, claims, func(*jwt.Token) (any, error) { return s.secret, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithIssuer(pendingIssuer), jwt.WithExpirationRequired())
	if err != nil {
		return nil, fmt.Errorf("invalid google pending cookie: %w", err)
	}
	if claims.Subject == "" || claims.Email == "" {
		return nil, errors.New("google pending cookie is incomplete")
	}
	return &GoogleIdentity{Subject: claims.Subject, Email: claims.Email, FirstName: claims.FirstName, LastName: claims.LastName}, nil
}

// EndGooglePending clears the cookie.
func (s *Sessions) EndGooglePending(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: PendingCookie, Value: "", Path: pendingPath, MaxAge: -1,
		HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: s.secure,
	})
}
