package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

// GoogleIdentity is the verified information we take from a Google ID token.
type GoogleIdentity struct {
	Subject string // stable Google account id
	Email   string
	Name    string
}

// GoogleVerifier is an interface so services can be tested with a fake.
type GoogleVerifier interface {
	Verify(ctx context.Context, idToken string) (*GoogleIdentity, error)
}

// TokenInfoVerifier checks an ID token by asking Google's tokeninfo
// endpoint, which validates the signature and expiry for us. We then
// check that the token was issued for *our* client id.
type TokenInfoVerifier struct {
	ClientID string
	Endpoint string
	Client   *http.Client
}

func NewGoogleVerifier(clientID string) *TokenInfoVerifier {
	return &TokenInfoVerifier{
		ClientID: clientID,
		Endpoint: "https://oauth2.googleapis.com/tokeninfo",
		Client:   &http.Client{Timeout: 10 * time.Second},
	}
}

type tokenInfoResponse struct {
	Aud           string `json:"aud"`
	Iss           string `json:"iss"`
	Sub           string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified string `json:"email_verified"`
	Name          string `json:"name"`
}

var ErrGoogleNotConfigured = errors.New("google login is not configured")

func (v *TokenInfoVerifier) Verify(ctx context.Context, idToken string) (*GoogleIdentity, error) {
	if v.ClientID == "" {
		return nil, ErrGoogleNotConfigured
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		v.Endpoint+"?id_token="+url.QueryEscape(idToken), nil)
	if err != nil {
		return nil, fmt.Errorf("build tokeninfo request: %w", err)
	}
	resp, err := v.Client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call tokeninfo: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tokeninfo rejected token: status %d", resp.StatusCode)
	}

	var info tokenInfoResponse
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, fmt.Errorf("decode tokeninfo: %w", err)
	}

	switch {
	case info.Aud != v.ClientID:
		return nil, errors.New("google token was issued for a different client")
	case info.Iss != "accounts.google.com" && info.Iss != "https://accounts.google.com":
		return nil, errors.New("google token has an unexpected issuer")
	case info.EmailVerified != "true":
		return nil, errors.New("google email is not verified")
	}

	return &GoogleIdentity{Subject: info.Sub, Email: info.Email, Name: info.Name}, nil
}
