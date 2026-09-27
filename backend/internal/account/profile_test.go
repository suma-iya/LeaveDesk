package account

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/auth"
	"github.com/suma-iya/leavedesk/backend/internal/domain"
	"github.com/suma-iya/leavedesk/backend/internal/store"
)

// profileStore records profile, password and role writes.
type profileStore struct {
	Store
	users     map[string]*domain.User
	lookupErr error
	writeErr  error
	createErr error
	looked    string // email passed to UserByEmail

	profile *struct {
		first, last string
		dob         domain.Date
		avatar      *string
	}
	hash string

	roleEmail string
	roleSet   domain.Role
	roleUser  *domain.User
	hrCount   int
}

func (f *profileStore) UserByID(_ context.Context, id string) (*domain.User, error) {
	if u, ok := f.users[id]; ok {
		return u, nil
	}
	return nil, domain.ErrNotFound
}
func (f *profileStore) UserByEmail(_ context.Context, email string) (*domain.User, error) {
	f.looked = email
	if f.lookupErr != nil {
		return nil, f.lookupErr
	}
	for _, u := range f.users {
		if u.Email == email {
			return u, nil
		}
	}
	return nil, fmt.Errorf("user by email: %w", domain.ErrNotFound)
}
func (f *profileStore) HasHR(context.Context) (bool, error) { return true, nil }
func (f *profileStore) CreateUser(context.Context, store.NewUser, func(bool) domain.Role) (*domain.User, error) {
	return nil, f.createErr
}
func (f *profileStore) UpdateProfile(_ context.Context, _ string, first, last string, dob domain.Date, avatar *string) error {
	if f.writeErr != nil {
		return f.writeErr
	}
	f.profile = &struct {
		first, last string
		dob         domain.Date
		avatar      *string
	}{first, last, dob, avatar}
	return nil
}
func (f *profileStore) UpdatePassword(_ context.Context, _ string, hash string) error {
	f.hash = hash
	return f.writeErr
}
func (f *profileStore) SetRole(_ context.Context, email string, role domain.Role, guard func(*domain.User, int) error) error {
	f.roleEmail = email
	if err := guard(f.roleUser, f.hrCount); err != nil {
		return err
	}
	f.roleSet = role
	return nil
}

var profileToday = func() time.Time { return time.Date(2026, 9, 26, 0, 0, 0, 0, time.UTC) }

func dateP(s string) *domain.Date { d, _ := domain.ParseDate(s); return &d }

func TestUpdateProfile(t *testing.T) {
	existingDOB := time.Date(1995, 5, 10, 0, 0, 0, 0, time.UTC)
	errNotYours := domain.Invalid("Upload the photo again.")

	tests := []struct {
		name        string
		avatar      *string // the user's current avatar
		in          ProfileInput
		avatarErr   error
		wantFirst   string
		wantLast    string
		wantDOB     string
		wantAvatar  *string
		wantChecked string // file id passed to avatarOK, "" = not called
		wantMsg     string // validation message; "" = success
	}{
		{name: "names are trimmed, date of birth kept", in: ProfileInput{FirstName: "  Nadia ", LastName: " Rahman  "},
			wantFirst: "Nadia", wantLast: "Rahman", wantDOB: "1995-05-10"},
		{name: "new date of birth", in: ProfileInput{FirstName: "Nadia", LastName: "Rahman", DateOfBirth: dateP("1990-01-15")},
			wantFirst: "Nadia", wantLast: "Rahman", wantDOB: "1990-01-15"},
		{name: "exactly 18 today", in: ProfileInput{FirstName: "Nadia", LastName: "Rahman", DateOfBirth: dateP("2008-09-26")},
			wantFirst: "Nadia", wantLast: "Rahman", wantDOB: "2008-09-26"},
		{name: "one day short of 18", in: ProfileInput{FirstName: "Nadia", LastName: "Rahman", DateOfBirth: dateP("2008-09-27")},
			wantMsg: "You must be at least 18 years old."},
		{name: "leap-day birthday", in: ProfileInput{FirstName: "Nadia", LastName: "Rahman", DateOfBirth: dateP("2008-02-29")},
			wantFirst: "Nadia", wantLast: "Rahman", wantDOB: "2008-02-29"},
		{name: "future date of birth", in: ProfileInput{FirstName: "Nadia", LastName: "Rahman", DateOfBirth: dateP("2027-01-01")},
			wantMsg: "Enter a real date of birth."},
		{name: "before 1900", in: ProfileInput{FirstName: "Nadia", LastName: "Rahman", DateOfBirth: dateP("1899-12-31")},
			wantMsg: "Enter a real date of birth."},
		{name: "blank first name", in: ProfileInput{FirstName: "   ", LastName: "Rahman"}, wantMsg: "Enter your first and last name."},
		{name: "missing last name", in: ProfileInput{FirstName: "Nadia"}, wantMsg: "Enter your first and last name."},
		{name: "61-character last name", in: ProfileInput{FirstName: "Nadia", LastName: strings.Repeat("r", 61)}, wantMsg: "Names can be at most 60 characters."},
		{name: "60-character first name", in: ProfileInput{FirstName: strings.Repeat("n", 60), LastName: "Rahman"},
			wantFirst: strings.Repeat("n", 60), wantLast: "Rahman", wantDOB: "1995-05-10"},
		{name: "no avatar field keeps the photo", avatar: ptr("old"), in: ProfileInput{FirstName: "Nadia", LastName: "Rahman"},
			wantFirst: "Nadia", wantLast: "Rahman", wantDOB: "1995-05-10", wantAvatar: ptr("old")},
		{name: "empty avatar removes the photo without a check", avatar: ptr("old"), in: ProfileInput{FirstName: "Nadia", LastName: "Rahman", AvatarFileID: ptr("")},
			wantFirst: "Nadia", wantLast: "Rahman", wantDOB: "1995-05-10"},
		{name: "new avatar is checked and saved", avatar: ptr("old"), in: ProfileInput{FirstName: "Nadia", LastName: "Rahman", AvatarFileID: ptr("new")},
			wantFirst: "Nadia", wantLast: "Rahman", wantDOB: "1995-05-10", wantAvatar: ptr("new"), wantChecked: "new"},
		{name: "someone else's avatar is refused", avatar: ptr("old"), in: ProfileInput{FirstName: "Nadia", LastName: "Rahman", AvatarFileID: ptr("theirs")},
			avatarErr: errNotYours, wantChecked: "theirs", wantMsg: "Upload the photo again."},
		{name: "names are checked before the avatar", in: ProfileInput{FirstName: "", LastName: "Rahman", AvatarFileID: ptr("theirs")},
			avatarErr: errNotYours, wantMsg: "Enter your first and last name."},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			u := &domain.User{ID: "u1", FirstName: "Old", LastName: "Name", DateOfBirth: existingDOB, AvatarFileID: tt.avatar}
			st := &profileStore{users: map[string]*domain.User{"u1": u}}
			checked := ""
			got, err := NewService(st, nil, profileToday).UpdateProfile(context.Background(), u, tt.in, func(id string) error {
				checked = id
				return tt.avatarErr
			})
			if checked != tt.wantChecked {
				t.Fatalf("avatarOK called with %q, want %q", checked, tt.wantChecked)
			}
			if tt.wantMsg != "" {
				de, ok := domain.AsError(err)
				if !ok || de.Status != 400 || de.Message != tt.wantMsg {
					t.Fatalf("want 400 %q, got %v", tt.wantMsg, err)
				}
				if st.profile != nil {
					t.Fatal("a refused update must not be saved")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			p := st.profile
			if p.first != tt.wantFirst || p.last != tt.wantLast || p.dob.String() != tt.wantDOB {
				t.Fatalf("saved %q %q %s, want %q %q %s", p.first, p.last, p.dob, tt.wantFirst, tt.wantLast, tt.wantDOB)
			}
			switch {
			case tt.wantAvatar == nil && p.avatar != nil:
				t.Fatalf("avatar %q, want none", *p.avatar)
			case tt.wantAvatar != nil && (p.avatar == nil || *p.avatar != *tt.wantAvatar):
				t.Fatalf("avatar %v, want %q", p.avatar, *tt.wantAvatar)
			}
			if got != u {
				t.Fatal("UpdateProfile must return the reloaded user")
			}
		})
	}

	t.Run("store error passes through", func(t *testing.T) {
		boom := errors.New("db down")
		u := &domain.User{ID: "u1", DateOfBirth: existingDOB}
		_, err := NewService(&profileStore{writeErr: boom}, nil, profileToday).UpdateProfile(context.Background(), u,
			ProfileInput{FirstName: "A", LastName: "B"}, func(string) error { return nil })
		if !errors.Is(err, boom) {
			t.Fatalf("want the store error, got %v", err)
		}
	})
}

func TestChangePassword(t *testing.T) {
	hash, err := auth.HashPassword("old-password")
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name                   string
		hash                   *string
		current, next, confirm string
		wantMsg                string // "" = success
	}{
		{name: "changes the password", hash: &hash, current: "old-password", next: "new-password", confirm: "new-password"},
		{name: "confirmation may be omitted", hash: &hash, current: "old-password", next: "new-password"},
		{name: "wrong current password", hash: &hash, current: "not-it", next: "new-password", confirm: "new-password",
			wantMsg: "Your current password is not correct."},
		{name: "missing current password", hash: &hash, next: "new-password", confirm: "new-password",
			wantMsg: "Your current password is not correct."},
		{name: "current is checked before the new one", hash: &hash, current: "not-it", next: "short",
			wantMsg: "Your current password is not correct."},
		{name: "too short", hash: &hash, current: "old-password", next: "1234567", confirm: "1234567",
			wantMsg: "Use at least 8 characters for the password."},
		{name: "exactly 8 characters", hash: &hash, current: "old-password", next: "12345678", confirm: "12345678"},
		{name: "mismatch", hash: &hash, current: "old-password", next: "new-password", confirm: "new-passw0rd",
			wantMsg: "The passwords do not match."},
		{name: "Google-only user sets a first password without a current one", next: "new-password", confirm: "new-password"},
		{name: "Google-only user: any current value is ignored", current: "whatever", next: "new-password", confirm: "new-password"},
		{name: "Google-only user still needs a valid new password", next: "short", confirm: "short",
			wantMsg: "Use at least 8 characters for the password."},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := &profileStore{}
			u := &domain.User{ID: "u1", PasswordHash: tt.hash}
			err := NewService(st, nil, profileToday).ChangePassword(context.Background(), u, tt.current, tt.next, tt.confirm)
			if tt.wantMsg != "" {
				de, ok := domain.AsError(err)
				if !ok || de.Status != 400 || de.Message != tt.wantMsg {
					t.Fatalf("want 400 %q, got %v", tt.wantMsg, err)
				}
				if st.hash != "" {
					t.Fatal("a refused change must not be saved")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !auth.CheckPassword(st.hash, tt.next) || auth.CheckPassword(st.hash, "old-password") {
				t.Fatal("the stored hash must match the new password only")
			}
		})
	}
}

// bcrypt accepts at most 72 bytes; a longer password is a 400 the form can
// show, not a 500 from HashPassword.
func TestChangePasswordTooLongIsAValidationError(t *testing.T) {
	err := NewService(&profileStore{}, nil, profileToday).ChangePassword(context.Background(), &domain.User{ID: "u1"}, "", strings.Repeat("p", 73), "")
	if de, ok := domain.AsError(err); !ok || de.Status != 400 {
		t.Fatalf("want a 400 validation error, got %v", err)
	}
}

func TestLoginEdgeCases(t *testing.T) {
	hash, err := auth.HashPassword("password123")
	if err != nil {
		t.Fatal(err)
	}
	user := &domain.User{ID: "u1", Email: "rakib@company.test", PasswordHash: &hash}
	boom := errors.New("db down")

	tests := []struct {
		name       string
		email, pwd string
		lookupErr  error
		wantID     string
		wantLooked string
		wantStatus int
		wantErr    error
	}{
		{name: "success", email: "rakib@company.test", pwd: "password123", wantID: "u1", wantLooked: "rakib@company.test"},
		{name: "email is trimmed and lower-cased", email: "  Rakib@Company.TEST ", pwd: "password123", wantID: "u1", wantLooked: "rakib@company.test"},
		{name: "password is not trimmed", email: "rakib@company.test", pwd: " password123 ", wantStatus: 401, wantLooked: "rakib@company.test"},
		{name: "empty email", email: "", pwd: "password123", wantStatus: 400},
		{name: "whitespace email", email: "   ", pwd: "password123", wantStatus: 400},
		{name: "empty password", email: "rakib@company.test", pwd: "", wantStatus: 400},
		{name: "store failure is not a wrong password", email: "rakib@company.test", pwd: "password123", lookupErr: boom, wantErr: boom, wantLooked: "rakib@company.test"},
		{name: "wrapped not-found is a wrong password", email: "nobody@company.test", pwd: "password123", wantStatus: 401, wantLooked: "nobody@company.test"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := &profileStore{users: map[string]*domain.User{"u1": user}, lookupErr: tt.lookupErr}
			u, err := NewService(st, nil, profileToday).Login(context.Background(), tt.email, tt.pwd)
			if st.looked != tt.wantLooked {
				t.Fatalf("looked up %q, want %q", st.looked, tt.wantLooked)
			}
			switch {
			case tt.wantErr != nil:
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("want %v, got %v", tt.wantErr, err)
				}
			case tt.wantStatus != 0:
				de, ok := domain.AsError(err)
				if !ok || de.Status != tt.wantStatus {
					t.Fatalf("want %d, got %v", tt.wantStatus, err)
				}
				if tt.wantStatus == 401 && err != errBadLogin {
					t.Fatalf("want the generic wrong-email-or-password error, got %v", err)
				}
			default:
				if err != nil || u.ID != tt.wantID {
					t.Fatalf("got %+v, %v", u, err)
				}
			}
		})
	}
}

func TestRegisterEmailTaken(t *testing.T) {
	st := &profileStore{createErr: fmt.Errorf("insert user: %w", domain.ErrConflict)}
	_, err := NewService(st, nil, profileToday).Register(context.Background(), RegisterInput{
		FirstName: "Rakib", LastName: "Hasan", DateOfBirth: dateP("1998-12-02"), Email: "rakib@company.test", Password: "password123",
	})
	de, ok := domain.AsError(err)
	if !ok || de.Status != 409 || de.Code != "EMAIL_TAKEN" {
		t.Fatalf("want 409 EMAIL_TAKEN, got %v", err)
	}
}

func TestPromoteDemote(t *testing.T) {
	hrUser := &domain.User{Email: "boss@company.test", Role: domain.RoleHR}
	emp := &domain.User{Email: "rakib@company.test", Role: domain.RoleEmployee}
	tests := []struct {
		name     string
		demote   bool
		user     *domain.User
		hrCount  int
		wantRole domain.Role // "" = refused
	}{
		{name: "promote an employee", user: emp, hrCount: 1, wantRole: domain.RoleHR},
		{name: "promote someone already HR", user: hrUser, hrCount: 1},
		{name: "demote one of two HR", demote: true, user: hrUser, hrCount: 2, wantRole: domain.RoleEmployee},
		{name: "demote the last HR", demote: true, user: hrUser, hrCount: 1},
		{name: "demote an employee", demote: true, user: emp, hrCount: 2},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := &profileStore{roleUser: tt.user, hrCount: tt.hrCount}
			svc := NewService(st, nil, profileToday)
			var err error
			if tt.demote {
				err = svc.Demote(context.Background(), "Mixed.Case@Company.test")
			} else {
				err = svc.Promote(context.Background(), "Mixed.Case@Company.test")
			}
			if st.roleEmail != "mixed.case@company.test" {
				t.Fatalf("email %q must be lower-cased", st.roleEmail)
			}
			if tt.wantRole == "" {
				if err == nil || st.roleSet != "" {
					t.Fatalf("want a refusal, got err=%v role=%q", err, st.roleSet)
				}
				return
			}
			if err != nil || st.roleSet != tt.wantRole {
				t.Fatalf("got err=%v role=%q, want %q", err, st.roleSet, tt.wantRole)
			}
		})
	}

	if ok, err := NewService(&profileStore{}, nil, profileToday).HasHR(context.Background()); !ok || err != nil {
		t.Fatalf("HasHR = %v, %v", ok, err)
	}
}
