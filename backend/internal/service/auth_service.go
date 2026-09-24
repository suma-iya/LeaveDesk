package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"slices"
	"strings"

	"github.com/suma-iya/employee-leave-tracker/backend/internal/auth"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/model"
)

type AuthService struct {
	users         UserStore
	tokens        *auth.TokenManager
	google        auth.GoogleVerifier
	managerEmails []string
}

func NewAuthService(users UserStore, tokens *auth.TokenManager, google auth.GoogleVerifier, managerEmails []string) *AuthService {
	return &AuthService{users: users, tokens: tokens, google: google, managerEmails: managerEmails}
}

var errInvalidCredentials = model.Unauthorized("invalid email or password")

// Session is what a successful login returns to the client.
type Session struct {
	Token string      `json:"token"`
	User  *model.User `json:"user"`
}

// Login checks email + password. Every failure returns the same
// error so an attacker cannot tell which emails exist.
func (s *AuthService) Login(ctx context.Context, email, password string) (*Session, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || password == "" {
		return nil, model.Invalid("email and password are required")
	}

	user, err := s.users.GetByEmail(ctx, email)
	if errors.Is(err, model.ErrNotFound) {
		return nil, errInvalidCredentials
	}
	if err != nil {
		return nil, fmt.Errorf("login: %w", err)
	}
	if user.PasswordHash == nil || !auth.CheckPassword(*user.PasswordHash, password) {
		return nil, errInvalidCredentials
	}
	return s.newSession(user)
}

// GoogleLogin verifies the Google ID token, then finds the user by Google
// id, falls back to email (linking the accounts), or creates a new user.
func (s *AuthService) GoogleLogin(ctx context.Context, credential string) (*Session, error) {
	if credential == "" {
		return nil, model.Invalid("credential is required")
	}
	identity, err := s.google.Verify(ctx, credential)
	if errors.Is(err, auth.ErrGoogleNotConfigured) {
		return nil, model.Invalid("Google login is not configured on the server")
	}
	if err != nil {
		log.Printf("google token rejected: %v", err)
		return nil, model.Unauthorized("Google sign-in could not be verified")
	}
	email := strings.ToLower(identity.Email)

	user, err := s.users.GetByGoogleID(ctx, identity.Subject)
	if err == nil {
		return s.newSession(user)
	}
	if !errors.Is(err, model.ErrNotFound) {
		return nil, fmt.Errorf("google login: %w", err)
	}

	// Known email (e.g. pre-registered by a manager): link the Google account.
	user, err = s.users.GetByEmail(ctx, email)
	if err == nil {
		if err := s.users.LinkGoogleID(ctx, user.ID, identity.Subject); err != nil {
			return nil, fmt.Errorf("google login: %w", err)
		}
		return s.newSession(user)
	}
	if !errors.Is(err, model.ErrNotFound) {
		return nil, fmt.Errorf("google login: %w", err)
	}

	// First visit: create the account.
	role := model.RoleEmployee
	if slices.Contains(s.managerEmails, email) {
		role = model.RoleManager
	}
	name := identity.Name
	if name == "" {
		name = email
	}
	user = &model.User{Name: name, Email: email, Role: role, GoogleID: &identity.Subject}
	if err := s.users.Create(ctx, user); err != nil {
		return nil, fmt.Errorf("google login: %w", err)
	}
	return s.newSession(user)
}

func (s *AuthService) Me(ctx context.Context, userID int64) (*model.User, error) {
	return s.users.GetByID(ctx, userID)
}

func (s *AuthService) newSession(user *model.User) (*Session, error) {
	token, err := s.tokens.Issue(user)
	if err != nil {
		return nil, err
	}
	return &Session{Token: token, User: user}, nil
}
