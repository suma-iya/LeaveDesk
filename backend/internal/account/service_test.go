package account

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
	"github.com/suma-iya/leavedesk/backend/internal/store"
)

func TestInitialRole(t *testing.T) {
	tests := []struct {
		name  string
		hasHR bool
		want  domain.Role
	}{
		{"first account ever becomes HR", false, domain.RoleHR},
		{"later accounts are employees", true, domain.RoleEmployee},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := InitialRole(tt.hasHR); got != tt.want {
				t.Fatalf("got %s, want %s", got, tt.want)
			}
		})
	}
}

func TestCanDemote(t *testing.T) {
	hr := &domain.User{Email: "a@x.test", Role: domain.RoleHR}
	emp := &domain.User{Email: "b@x.test", Role: domain.RoleEmployee}
	if err := CanDemote(hr, 1); err == nil {
		t.Fatal("must refuse to demote the last HR")
	}
	if err := CanDemote(hr, 2); err != nil {
		t.Fatalf("second HR can be demoted: %v", err)
	}
	if err := CanDemote(emp, 3); err == nil {
		t.Fatal("employees cannot be demoted")
	}
}

// fakeStore records what Register would store.
type fakeStore struct {
	Store
	hasHR   bool
	created *domain.User
}

func (f *fakeStore) CreateUser(_ context.Context, n store.NewUser, decide func(bool) domain.Role) (*domain.User, error) {
	f.created = &domain.User{Email: n.Email, FirstName: n.FirstName, Role: decide(f.hasHR)}
	return f.created, nil
}

func TestRegister(t *testing.T) {
	today := func() time.Time { return time.Date(2026, 9, 26, 0, 0, 0, 0, time.UTC) }
	dob := func(s string) *domain.Date { d, _ := domain.ParseDate(s); return &d }
	valid := RegisterInput{FirstName: "Rakib", LastName: "Hasan", DateOfBirth: dob("1998-12-02"),
		Email: " Rakib.H@Company.test ", Password: "password123", ConfirmPassword: "password123"}

	tests := []struct {
		name    string
		mutate  func(*RegisterInput)
		domains []string
		wantErr bool
	}{
		{name: "valid", mutate: func(*RegisterInput) {}},
		{name: "exactly 18 today", mutate: func(i *RegisterInput) { i.DateOfBirth = dob("2008-09-26") }},
		{name: "one day short of 18", mutate: func(i *RegisterInput) { i.DateOfBirth = dob("2008-09-27") }, wantErr: true},
		{name: "missing dob", mutate: func(i *RegisterInput) { i.DateOfBirth = nil }, wantErr: true},
		{name: "short password", mutate: func(i *RegisterInput) { i.Password, i.ConfirmPassword = "short", "short" }, wantErr: true},
		{name: "confirm mismatch", mutate: func(i *RegisterInput) { i.ConfirmPassword = "password124" }, wantErr: true},
		{name: "bad email", mutate: func(i *RegisterInput) { i.Email = "not-an-email" }, wantErr: true},
		{name: "blank last name", mutate: func(i *RegisterInput) { i.LastName = "  " }, wantErr: true},
		{name: "domain allowed", mutate: func(*RegisterInput) {}, domains: []string{"company.test"}},
		{name: "domain not allowed", mutate: func(*RegisterInput) {}, domains: []string{"other.test"}, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			in := valid
			tt.mutate(&in)
			fs := &fakeStore{hasHR: true}
			u, err := NewService(fs, tt.domains, today).Register(context.Background(), in)
			if tt.wantErr {
				var de *domain.Error
				if !errors.As(err, &de) || de.Status != 400 {
					t.Fatalf("want 400 validation error, got %v", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if u.Email != "rakib.h@company.test" || u.Role != domain.RoleEmployee {
				t.Fatalf("email must be lower-cased and the role employee, got %+v", u)
			}
		})
	}
}
