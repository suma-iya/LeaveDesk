package auth

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Google implements "Continue with Google" with the OpenID Connect code
// flow: redirect to Google, receive a code, exchange it for an ID token,
// then verify that token's signature against Google's published keys.
type Google struct {
	ClientID, ClientSecret, RedirectURL string
	AllowedDomains                      []string
	client                              *http.Client

	mu        sync.Mutex
	keys      map[string]*rsa.PublicKey
	keysUntil time.Time
}

type GoogleIdentity struct {
	Subject, Email, FirstName, LastName string
}

// Verify failures the sign-in page explains in its own words.
var (
	ErrEmailNotVerified = errors.New("google email is not verified")
	ErrDomainNotAllowed = errors.New("google account is not in an allowed domain")
)

func NewGoogle(clientID, secret, redirect string, allowedDomains []string) *Google {
	return &Google{ClientID: clientID, ClientSecret: secret, RedirectURL: redirect,
		AllowedDomains: allowedDomains, client: &http.Client{Timeout: 10 * time.Second}}
}

// AuthURL is where the browser goes first. state is echoed back and
// compared with a cookie to stop cross-site request forgery.
func (g *Google) AuthURL(state string) string {
	q := url.Values{
		"client_id":     {g.ClientID},
		"redirect_uri":  {g.RedirectURL},
		"response_type": {"code"},
		"scope":         {"openid email profile"},
		"state":         {state},
		"prompt":        {"select_account"},
	}
	return "https://accounts.google.com/o/oauth2/v2/auth?" + q.Encode()
}

// Exchange trades the code for an ID token and verifies it.
func (g *Google) Exchange(ctx context.Context, code string) (*GoogleIdentity, error) {
	form := url.Values{
		"code": {code}, "client_id": {g.ClientID}, "client_secret": {g.ClientSecret},
		"redirect_uri": {g.RedirectURL}, "grant_type": {"authorization_code"},
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := g.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("google token exchange: %w", err)
	}
	defer resp.Body.Close()
	var body struct {
		IDToken string `json:"id_token"`
		Error   string `json:"error"` // e.g. invalid_grant, invalid_client; never secret
	}
	if json.NewDecoder(resp.Body).Decode(&body) != nil || resp.StatusCode != http.StatusOK || body.IDToken == "" {
		return nil, fmt.Errorf("google token exchange failed: status %d %s", resp.StatusCode, body.Error)
	}
	return g.Verify(ctx, body.IDToken)
}

type googleClaims struct {
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	HostedDomain  string `json:"hd"`
	GivenName     string `json:"given_name"`
	FamilyName    string `json:"family_name"`
	jwt.RegisteredClaims
}

// Verify checks signature (RS256 with Google's key), audience = our client
// id, issuer, expiry, email_verified and, if configured, the hosted domain.
func (g *Google) Verify(ctx context.Context, idToken string) (*GoogleIdentity, error) {
	claims := &googleClaims{}
	_, err := jwt.ParseWithClaims(idToken, claims, func(t *jwt.Token) (any, error) {
		kid, _ := t.Header["kid"].(string)
		return g.key(ctx, kid)
	}, jwt.WithValidMethods([]string{"RS256"}), jwt.WithAudience(g.ClientID))
	if err != nil {
		return nil, fmt.Errorf("verify google token: %w", err)
	}
	if claims.Issuer != "accounts.google.com" && claims.Issuer != "https://accounts.google.com" {
		return nil, errors.New("google token has an unexpected issuer")
	}
	if !claims.EmailVerified {
		return nil, ErrEmailNotVerified
	}
	if len(g.AllowedDomains) > 0 && !slices.Contains(g.AllowedDomains, strings.ToLower(claims.HostedDomain)) {
		return nil, ErrDomainNotAllowed
	}
	return &GoogleIdentity{Subject: claims.Subject, Email: strings.ToLower(claims.Email),
		FirstName: claims.GivenName, LastName: claims.FamilyName}, nil
}

// key returns Google's public key for kid, refreshing the cached set hourly.
func (g *Google) key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if key, ok := g.keys[kid]; ok && time.Now().Before(g.keysUntil) {
		return key, nil
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://www.googleapis.com/oauth2/v3/certs", nil)
	resp, err := g.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch google keys: %w", err)
	}
	defer resp.Body.Close()
	var set struct {
		Keys []struct{ Kid, N, E string } `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&set); err != nil {
		return nil, fmt.Errorf("decode google keys: %w", err)
	}
	g.keys = map[string]*rsa.PublicKey{}
	for _, k := range set.Keys {
		n, errN := base64.RawURLEncoding.DecodeString(k.N)
		e, errE := base64.RawURLEncoding.DecodeString(k.E)
		if errN != nil || errE != nil {
			continue
		}
		g.keys[k.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(new(big.Int).SetBytes(e).Int64())}
	}
	g.keysUntil = time.Now().Add(time.Hour)
	if key, ok := g.keys[kid]; ok {
		return key, nil
	}
	return nil, fmt.Errorf("unknown google key id %q", kid)
}
