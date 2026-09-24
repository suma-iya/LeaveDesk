package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/suma-iya/employee-leave-tracker/backend/internal/auth"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/model"
)

type fakeUserStore struct {
	UserStore
	byEmail map[string]*model.User
	created *model.User
	linked  string
}

func (f *fakeUserStore) GetByEmail(_ context.Context, email string) (*model.User, error) {
	if u, ok := f.byEmail[email]; ok {
		return u, nil
	}
	return nil, model.ErrNotFound
}

func (f *fakeUserStore) GetByGoogleID(_ context.Context, id string) (*model.User, error) {
	for _, u := range f.byEmail {
		if u.GoogleID != nil && *u.GoogleID == id {
			return u, nil
		}
	}
	return nil, model.ErrNotFound
}

func (f *fakeUserStore) LinkGoogleID(_ context.Context, _ int64, googleID string) error {
	f.linked = googleID
	return nil
}

func (f *fakeUserStore) Create(_ context.Context, u *model.User) error {
	u.ID = 100
	f.created = u
	return nil
}

type fakeGoogle struct {
	identity *auth.GoogleIdentity
	err      error
}

func (f fakeGoogle) Verify(context.Context, string) (*auth.GoogleIdentity, error) {
	return f.identity, f.err
}

func TestAuthService_Login(t *testing.T) {
	hash, _ := auth.HashPassword("correct-horse")
	store := &fakeUserStore{byEmail: map[string]*model.User{
		"ann@example.com":    {ID: 1, Email: "ann@example.com", Role: model.RoleEmployee, PasswordHash: &hash},
		"google@example.com": {ID: 2, Email: "google@example.com", Role: model.RoleEmployee}, // no password
	}}
	tokens := auth.NewTokenManager("test-secret-at-least-16", time.Hour)
	svc := NewAuthService(store, tokens, fakeGoogle{}, nil)

	tests := []struct {
		name, email, password string
		wantErr               error
	}{
		{"correct password", "ann@example.com", "correct-horse", nil},
		{"email is case-insensitive", "  ANN@example.com ", "correct-horse", nil},
		{"wrong password", "ann@example.com", "wrong", model.ErrUnauthorized},
		{"unknown email", "nobody@example.com", "whatever", model.ErrUnauthorized},
		{"google-only account", "google@example.com", "anything", model.ErrUnauthorized},
		{"empty fields", "", "", model.ErrInvalid},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			session, err := svc.Login(context.Background(), tt.email, tt.password)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("want %v, got %v", tt.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			claims, err := tokens.Parse(session.Token)
			if err != nil {
				t.Fatalf("issued token does not parse: %v", err)
			}
			if claims.Role != model.RoleEmployee || claims.Subject != "1" {
				t.Fatalf("unexpected claims: %+v", claims)
			}
		})
	}
}

func TestAuthService_GoogleLogin(t *testing.T) {
	tokens := auth.NewTokenManager("test-secret-at-least-16", time.Hour)
	identity := &auth.GoogleIdentity{Subject: "g-123", Email: "Boss@Example.com", Name: "Boss"}

	t.Run("new manager email gets MANAGER role", func(t *testing.T) {
		store := &fakeUserStore{byEmail: map[string]*model.User{}}
		svc := NewAuthService(store, tokens, fakeGoogle{identity: identity}, []string{"boss@example.com"})
		session, err := svc.GoogleLogin(context.Background(), "id-token")
		if err != nil {
			t.Fatal(err)
		}
		if session.User.Role != model.RoleManager || store.created.Email != "boss@example.com" {
			t.Fatalf("unexpected user: %+v", session.User)
		}
	})

	t.Run("existing email is linked, not duplicated", func(t *testing.T) {
		store := &fakeUserStore{byEmail: map[string]*model.User{
			"boss@example.com": {ID: 5, Email: "boss@example.com", Role: model.RoleEmployee},
		}}
		svc := NewAuthService(store, tokens, fakeGoogle{identity: identity}, nil)
		session, err := svc.GoogleLogin(context.Background(), "id-token")
		if err != nil {
			t.Fatal(err)
		}
		if session.User.ID != 5 || store.linked != "g-123" || store.created != nil {
			t.Fatalf("expected link to user 5, got user %d linked=%q", session.User.ID, store.linked)
		}
	})

	t.Run("rejected token is unauthorized", func(t *testing.T) {
		svc := NewAuthService(&fakeUserStore{}, tokens, fakeGoogle{err: errors.New("bad aud")}, nil)
		if _, err := svc.GoogleLogin(context.Background(), "id-token"); !errors.Is(err, model.ErrUnauthorized) {
			t.Fatalf("want unauthorized, got %v", err)
		}
	})
}
