// Package auth contains the security primitives: password hashing,
// JWT issuing/parsing and Google ID token verification.
package auth

import (
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

func HashPassword(plain string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("hash password: %w", err)
	}
	return string(hash), nil
}

// CheckPassword compares in constant time via bcrypt.
func CheckPassword(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}
