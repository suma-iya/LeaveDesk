package account

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/auth"
	"github.com/suma-iya/leavedesk/backend/internal/domain"
	"github.com/suma-iya/leavedesk/backend/internal/store"
)

// googleStore holds users in memory and records links and inserts.
type googleStore struct {
	Store
	users   []*domain.User
	hasHR   bool
	linkErr error
	linked  map[string]string // user id → sub
	created *store.NewUser
}

func (f *googleStore) UserByGoogleSub(_ context.Context, sub string) (*domain.User, error) {
	for _, u := range f.users {
		if u.GoogleSub != nil && *u.GoogleSub == sub {
			return u, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (f *googleStore) UserByEmail(_ context.Context, email string) (*domain.User, error) {
	for _, u := range f.users {
		if u.Email == email {
			return u, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (f *googleStore) LinkGoogle(_ context.Context, userID, sub string) error {
	if f.linkErr != nil {
		return f.linkErr
	}
	if f.linked == nil {
		f.linked = map[string]string{}
	}
	f.linked[userID] = sub
	return nil
}

func (f *googleStore) CreateUser(_ context.Context, n store.NewUser, decide func(bool) domain.Role) (*domain.User, error) {
	if _, err := f.UserByEmail(context.Background(), n.Email); err == nil {
		return nil, domain.ErrConflict
	}
	f.created = &n
	return &domain.User{ID: "new", Email: n.Email, FirstName: n.FirstName, LastName: n.LastName,
		Role: decide(f.hasHR), PasswordHash: n.PasswordHash, GoogleSub: n.GoogleSub}, nil
}

func ptr(s string) *string { return &s }

func TestGoogleSignIn(t *testing.T) {
	linked := &domain.User{ID: "u1", Email: "linked@company.test", GoogleSub: ptr("sub-linked")}
	unlinked := &domain.User{ID: "u2", Email: "plain@company.test", PasswordHash: ptr("hash")}
	otherSub := &domain.User{ID: "u3", Email: "taken@company.test", GoogleSub: ptr("sub-original")}

	tests := []struct {
		name     string
		identity auth.GoogleIdentity
		linkErr  error
		wantID   string
		wantLink string // sub linked to wantID, "" = no link
		wantErr  error
		wantCode string
	}{
		{name: "known subject", identity: auth.GoogleIdentity{Subject: "sub-linked", Email: "linked@company.test"}, wantID: "u1"},
		{name: "known subject after an email change at Google", identity: auth.GoogleIdentity{Subject: "sub-linked", Email: "renamed@company.test"}, wantID: "u1"},
		{name: "links by email", identity: auth.GoogleIdentity{Subject: "sub-new", Email: "plain@company.test"}, wantID: "u2", wantLink: "sub-new"},
		{name: "email already linked to a different subject", identity: auth.GoogleIdentity{Subject: "sub-intruder", Email: "taken@company.test"}, wantCode: "GOOGLE_LINKED"},
		{name: "concurrent link wins the race", identity: auth.GoogleIdentity{Subject: "sub-new", Email: "plain@company.test"}, linkErr: domain.ErrConflict, wantCode: "GOOGLE_LINKED"},
		{name: "unknown email", identity: auth.GoogleIdentity{Subject: "sub-new", Email: "nobody@company.test"}, wantErr: ErrNoGoogleAccount},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fs := &googleStore{users: []*domain.User{linked, unlinked, otherSub}, linkErr: tt.linkErr}
			id := tt.identity
			u, err := NewService(fs, nil, time.Now).GoogleSignIn(context.Background(), &id)
			switch {
			case tt.wantErr != nil:
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("want %v, got %v", tt.wantErr, err)
				}
				return
			case tt.wantCode != "":
				de, ok := domain.AsError(err)
				if !ok || de.Code != tt.wantCode || de.Status != 409 {
					t.Fatalf("want 409 %s, got %v", tt.wantCode, err)
				}
				if len(fs.linked) != 0 && tt.linkErr == nil {
					t.Fatalf("must not link on conflict, linked %v", fs.linked)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if u.ID != tt.wantID {
				t.Fatalf("signed in as %s, want %s", u.ID, tt.wantID)
			}
			if got := fs.linked[tt.wantID]; got != tt.wantLink {
				t.Fatalf("linked sub %q, want %q", got, tt.wantLink)
			}
		})
	}
}

func TestRegisterGoogle(t *testing.T) {
	today := func() time.Time { return time.Date(2026, 9, 26, 0, 0, 0, 0, time.UTC) }
	dob := func(s string) *domain.Date { d, _ := domain.ParseDate(s); return &d }
	identity := auth.GoogleIdentity{Subject: "sub-new", Email: "Nadia.R@Company.test", FirstName: "Nadia", LastName: "Rahman"}

	tests := []struct {
		name      string
		in        GoogleRegisterInput
		identity  func(*auth.GoogleIdentity)
		hasHR     bool
		existing  []*domain.User
		domains   []string
		wantRole  domain.Role
		wantLast  string
		wantCode  string
		wantState int
	}{
		{name: "creates a Google-only employee", in: GoogleRegisterInput{DateOfBirth: dob("1998-12-02")}, hasHR: true, wantRole: domain.RoleEmployee, wantLast: "Rahman"},
		{name: "first user becomes HR", in: GoogleRegisterInput{DateOfBirth: dob("1998-12-02")}, wantRole: domain.RoleHR, wantLast: "Rahman"},
		{name: "person fills in a name Google left empty", in: GoogleRegisterInput{DateOfBirth: dob("1998-12-02"), LastName: " Khan "},
			identity: func(i *auth.GoogleIdentity) { i.LastName = "" }, hasHR: true, wantRole: domain.RoleEmployee, wantLast: "Khan"},
		{name: "no last name anywhere", in: GoogleRegisterInput{DateOfBirth: dob("1998-12-02")},
			identity: func(i *auth.GoogleIdentity) { i.LastName = "" }, hasHR: true, wantCode: "VALIDATION", wantState: 400},
		{name: "exactly 18 today", in: GoogleRegisterInput{DateOfBirth: dob("2008-09-26")}, hasHR: true, wantRole: domain.RoleEmployee, wantLast: "Rahman"},
		{name: "under 18", in: GoogleRegisterInput{DateOfBirth: dob("2008-09-27")}, hasHR: true, wantCode: "VALIDATION", wantState: 400},
		{name: "missing date of birth", in: GoogleRegisterInput{}, hasHR: true, wantCode: "VALIDATION", wantState: 400},
		{name: "email domain not allowed", in: GoogleRegisterInput{DateOfBirth: dob("1998-12-02")}, hasHR: true, domains: []string{"other.test"}, wantCode: "VALIDATION", wantState: 400},
		{name: "email registered meanwhile", in: GoogleRegisterInput{DateOfBirth: dob("1998-12-02")}, hasHR: true,
			existing: []*domain.User{{ID: "u9", Email: "nadia.r@company.test"}}, wantCode: "EMAIL_TAKEN", wantState: 409},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id := identity
			if tt.identity != nil {
				tt.identity(&id)
			}
			fs := &googleStore{hasHR: tt.hasHR, users: tt.existing}
			u, err := NewService(fs, tt.domains, today).RegisterGoogle(context.Background(), &id, tt.in)
			if tt.wantCode != "" {
				de, ok := domain.AsError(err)
				if !ok || de.Code != tt.wantCode || de.Status != tt.wantState {
					t.Fatalf("want %d %s, got %v", tt.wantState, tt.wantCode, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			n := fs.created
			if n.PasswordHash != nil || n.GoogleSub == nil || *n.GoogleSub != "sub-new" {
				t.Fatalf("want google_sub set and no password, got %+v", n)
			}
			if n.Email != "nadia.r@company.test" || n.FirstName != "Nadia" || n.LastName != tt.wantLast {
				t.Fatalf("unexpected identity stored: %+v", n)
			}
			if u.Role != tt.wantRole {
				t.Fatalf("role %s, want %s", u.Role, tt.wantRole)
			}
		})
	}
}

// A Google-only account has no password, so password login fails exactly
// like a wrong password does.
func TestLoginGoogleOnlyAccount(t *testing.T) {
	hash, err := auth.HashPassword("password123")
	if err != nil {
		t.Fatal(err)
	}
	fs := &googleStore{users: []*domain.User{
		{ID: "g", Email: "google@company.test", GoogleSub: ptr("sub")},
		{ID: "p", Email: "pass@company.test", PasswordHash: &hash},
	}}
	svc := NewService(fs, nil, time.Now)
	for _, c := range []struct{ email, password string }{
		{"google@company.test", "password123"},
		{"google@company.test", "anything-else"},
		{"pass@company.test", "wrong-password"},
		{"nobody@company.test", "password123"},
	} {
		_, err := svc.Login(context.Background(), c.email, c.password)
		if err != errBadLogin {
			t.Fatalf("%s: want the generic wrong-email-or-password error, got %v", c.email, err)
		}
	}
}
