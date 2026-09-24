package auth

import (
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/suma-iya/employee-leave-tracker/backend/internal/model"
)

// Claims is the payload inside our JWT. The role travels in the token so
// the middleware can authorise a request without a database lookup.
type Claims struct {
	Role  model.Role `json:"role"`
	Name  string     `json:"name"`
	Email string     `json:"email"`
	jwt.RegisteredClaims
}

// UserID reads the numeric id stored in the standard "sub" claim.
func (c *Claims) UserID() (int64, error) {
	return strconv.ParseInt(c.Subject, 10, 64)
}

type TokenManager struct {
	secret []byte
	ttl    time.Duration
}

func NewTokenManager(secret string, ttl time.Duration) *TokenManager {
	return &TokenManager{secret: []byte(secret), ttl: ttl}
}

// Issue signs a token for the user with HMAC-SHA256.
func (m *TokenManager) Issue(user *model.User) (string, error) {
	now := time.Now()
	claims := Claims{
		Role:  user.Role,
		Name:  user.Name,
		Email: user.Email,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   strconv.FormatInt(user.ID, 10),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(m.ttl)),
			Issuer:    "leave-tracker",
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
	if err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}
	return signed, nil
}

// Parse verifies the signature and expiry and returns the claims.
func (m *TokenManager) Parse(raw string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (any, error) {
		return m.secret, nil
	},
		// Reject tokens signed with any other algorithm (e.g. "none").
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer("leave-tracker"),
	)
	if err != nil {
		return nil, fmt.Errorf("parse token: %w", err)
	}
	if _, err := claims.UserID(); err != nil {
		return nil, errors.New("parse token: invalid subject")
	}
	return claims, nil
}
