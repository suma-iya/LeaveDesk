package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testKid = "test-key"

// testGoogle trusts only key, so Verify never goes to the network.
func testGoogle(t *testing.T, key *rsa.PrivateKey, domains []string) *Google {
	t.Helper()
	g := NewGoogle("client-123.apps.googleusercontent.com", "unused", "http://localhost:3000/api/auth/google/callback", domains)
	g.keys = map[string]*rsa.PublicKey{testKid: &key.PublicKey}
	g.keysUntil = time.Now().Add(time.Hour)
	return g
}

func signIDToken(t *testing.T, key *rsa.PrivateKey, c googleClaims) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, c)
	token.Header["kid"] = testKid
	signed, err := token.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

func TestVerify(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	otherKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	valid := func() googleClaims {
		return googleClaims{
			Email: "Rakib.H@Company.test", EmailVerified: true, HostedDomain: "company.test",
			GivenName: "Rakib", FamilyName: "Hasan",
			RegisteredClaims: jwt.RegisteredClaims{
				Subject:   "google-sub-1",
				Issuer:    "https://accounts.google.com",
				Audience:  jwt.ClaimStrings{"client-123.apps.googleusercontent.com"},
				IssuedAt:  jwt.NewNumericDate(time.Now().Add(-time.Minute)),
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			},
		}
	}

	tests := []struct {
		name    string
		mutate  func(*googleClaims)
		signer  *rsa.PrivateKey
		domains []string
		wantErr error // nil = any error when fails is true
		fails   bool
	}{
		{name: "valid token", mutate: func(*googleClaims) {}},
		{name: "issuer without https", mutate: func(c *googleClaims) { c.Issuer = "accounts.google.com" }},
		{name: "hosted domain allowed", mutate: func(*googleClaims) {}, domains: []string{"company.test"}},
		{name: "wrong audience", mutate: func(c *googleClaims) { c.Audience = jwt.ClaimStrings{"someone-else"} }, fails: true},
		{name: "wrong issuer", mutate: func(c *googleClaims) { c.Issuer = "https://evil.test" }, fails: true},
		{name: "expired", mutate: func(c *googleClaims) { c.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Minute)) }, fails: true},
		{name: "signed by another key", mutate: func(*googleClaims) {}, signer: otherKey, fails: true},
		{name: "email not verified", mutate: func(c *googleClaims) { c.EmailVerified = false }, fails: true, wantErr: ErrEmailNotVerified},
		{name: "hosted domain not allowed", mutate: func(*googleClaims) {}, domains: []string{"other.test"}, fails: true, wantErr: ErrDomainNotAllowed},
		{name: "personal account when domains are set", mutate: func(c *googleClaims) { c.HostedDomain = "" }, domains: []string{"company.test"}, fails: true, wantErr: ErrDomainNotAllowed},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			claims := valid()
			tt.mutate(&claims)
			signer := key
			if tt.signer != nil {
				signer = tt.signer
			}
			id, err := testGoogle(t, key, tt.domains).Verify(context.Background(), signIDToken(t, signer, claims))
			if tt.fails {
				if err == nil {
					t.Fatalf("want an error, got identity %+v", id)
				}
				if tt.wantErr != nil && !errors.Is(err, tt.wantErr) {
					t.Fatalf("want %v, got %v", tt.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			want := GoogleIdentity{Subject: "google-sub-1", Email: "rakib.h@company.test", FirstName: "Rakib", LastName: "Hasan"}
			if *id != want {
				t.Fatalf("got %+v, want %+v", *id, want)
			}
		})
	}
}
