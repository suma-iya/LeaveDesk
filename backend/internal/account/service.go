// Package account holds the rules for registration, sign-in, profile and
// role changes. It depends on the Store interface, not on SQL.
package account

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"slices"
	"strings"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/auth"
	"github.com/suma-iya/leavedesk/backend/internal/domain"
	"github.com/suma-iya/leavedesk/backend/internal/store"
)

type Store interface {
	UserByID(ctx context.Context, id string) (*domain.User, error)
	UserByEmail(ctx context.Context, email string) (*domain.User, error)
	UserByGoogleSub(ctx context.Context, sub string) (*domain.User, error)
	HasHR(ctx context.Context) (bool, error)
	CreateUser(ctx context.Context, n store.NewUser, decide func(hasHR bool) (domain.Role, domain.Status)) (*domain.User, error)
	LinkGoogle(ctx context.Context, userID, sub string) error
	UpdateProfile(ctx context.Context, userID, first, last string, dob domain.Date, avatarFileID *string) error
	UpdatePassword(ctx context.Context, userID, hash string) error
	SetRole(ctx context.Context, email string, role domain.Role, guard func(u *domain.User, hrCount int) error) error
}

type Service struct {
	store          Store
	allowedDomains []string
	today          func() time.Time
}

func NewService(s Store, allowedDomains []string, today func() time.Time) *Service {
	return &Service{store: s, allowedDomains: allowedDomains, today: today}
}

// InitialRoleStatus is the first-run rule: while no HR exists, the new
// account becomes an active HR; afterwards everyone starts as a pending employee.
func InitialRoleStatus(hasHR bool) (domain.Role, domain.Status) {
	if !hasHR {
		return domain.RoleHR, domain.StatusActive
	}
	return domain.RoleEmployee, domain.StatusPending
}

func (s *Service) HasHR(ctx context.Context) (bool, error) { return s.store.HasHR(ctx) }

type RegisterInput struct {
	FirstName       string       `json:"firstName"`
	LastName        string       `json:"lastName"`
	DateOfBirth     *domain.Date `json:"dateOfBirth"`
	Email           string       `json:"email"`
	Password        string       `json:"password"`
	ConfirmPassword string       `json:"confirmPassword"`
}

func (s *Service) Register(ctx context.Context, in RegisterInput) (*domain.User, error) {
	in.FirstName, in.LastName = strings.TrimSpace(in.FirstName), strings.TrimSpace(in.LastName)
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))

	if err := validateName(in.FirstName, in.LastName); err != nil {
		return nil, err
	}
	if in.DateOfBirth == nil {
		return nil, domain.Invalid("Enter your date of birth.")
	}
	if err := s.validateDOB(*in.DateOfBirth); err != nil {
		return nil, err
	}
	if err := s.validateEmail(in.Email); err != nil {
		return nil, err
	}
	if err := validateNewPassword(in.Password, in.ConfirmPassword); err != nil {
		return nil, err
	}

	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		return nil, err
	}
	user, err := s.store.CreateUser(ctx, store.NewUser{
		Email: in.Email, FirstName: in.FirstName, LastName: in.LastName,
		DateOfBirth: *in.DateOfBirth, PasswordHash: hash,
	}, InitialRoleStatus)
	if errors.Is(err, domain.ErrConflict) {
		return nil, domain.Conflict("EMAIL_TAKEN", "An account with this email already exists. Sign in instead.")
	}
	return user, err
}

var errBadLogin = domain.Unauthenticated("Wrong email or password.")

// Login returns the same error for an unknown email and a wrong password,
// so nobody can probe which emails have accounts. Pending users can sign in.
func (s *Service) Login(ctx context.Context, email, password string) (*domain.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || password == "" {
		return nil, domain.Invalid("Enter your email and password.")
	}
	u, err := s.store.UserByEmail(ctx, email)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, errBadLogin
	}
	if err != nil {
		return nil, err
	}
	if u.PasswordHash == nil || !auth.CheckPassword(*u.PasswordHash, password) {
		return nil, errBadLogin
	}
	return u, nil
}

// GoogleSignIn matches by Google subject first, then links an existing
// account with the same email. Role and status always come from our DB.
// Google does not give a date of birth, so new people register first.
func (s *Service) GoogleSignIn(ctx context.Context, id *auth.GoogleIdentity) (*domain.User, error) {
	u, err := s.store.UserByGoogleSub(ctx, id.Subject)
	if err == nil {
		return u, nil
	}
	if !errors.Is(err, domain.ErrNotFound) {
		return nil, err
	}
	u, err = s.store.UserByEmail(ctx, id.Email)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, domain.NotFound("No account uses %s yet. Create an account first, then you can continue with Google.", id.Email)
	}
	if err != nil {
		return nil, err
	}
	if err := s.store.LinkGoogle(ctx, u.ID, id.Subject); err != nil {
		return nil, err
	}
	return u, nil
}

type ProfileInput struct {
	FirstName    string       `json:"firstName"`
	LastName     string       `json:"lastName"`
	DateOfBirth  *domain.Date `json:"dateOfBirth"`
	AvatarFileID *string      `json:"avatarFileId"`
}

// UpdateProfile changes only the caller's own name, date of birth and photo.
// avatarOK checks that a new avatar file belongs to the caller.
func (s *Service) UpdateProfile(ctx context.Context, u *domain.User, in ProfileInput, avatarOK func(fileID string) error) (*domain.User, error) {
	first, last := strings.TrimSpace(in.FirstName), strings.TrimSpace(in.LastName)
	if err := validateName(first, last); err != nil {
		return nil, err
	}
	dob := domain.DateOf(u.DateOfBirth)
	if in.DateOfBirth != nil {
		dob = *in.DateOfBirth
	}
	if err := s.validateDOB(dob); err != nil {
		return nil, err
	}
	avatar := u.AvatarFileID
	if in.AvatarFileID != nil {
		if *in.AvatarFileID == "" {
			avatar = nil // remove photo
		} else {
			if err := avatarOK(*in.AvatarFileID); err != nil {
				return nil, err
			}
			avatar = in.AvatarFileID
		}
	}
	if err := s.store.UpdateProfile(ctx, u.ID, first, last, dob, avatar); err != nil {
		return nil, err
	}
	return s.store.UserByID(ctx, u.ID)
}

func (s *Service) ChangePassword(ctx context.Context, u *domain.User, current, next, confirm string) error {
	if u.PasswordHash != nil && !auth.CheckPassword(*u.PasswordHash, current) {
		return domain.Invalid("Your current password is not correct.")
	}
	if err := validateNewPassword(next, confirm); err != nil {
		return err
	}
	hash, err := auth.HashPassword(next)
	if err != nil {
		return err
	}
	return s.store.UpdatePassword(ctx, u.ID, hash)
}

// Promote and Demote are CLI-only; HR promotion is not in the UI.
func (s *Service) Promote(ctx context.Context, email string) error {
	return s.store.SetRole(ctx, strings.ToLower(email), domain.RoleHR, func(u *domain.User, _ int) error {
		if !u.IsActive() {
			return fmt.Errorf("%s is still pending; approve the account first", u.Email)
		}
		return nil
	})
}

func (s *Service) Demote(ctx context.Context, email string) error {
	return s.store.SetRole(ctx, strings.ToLower(email), domain.RoleEmployee, func(u *domain.User, hrCount int) error {
		return CanDemote(u, hrCount)
	})
}

// CanDemote refuses to remove the last HR, which would lock everyone out.
func CanDemote(u *domain.User, hrCount int) error {
	if !u.IsHR() {
		return fmt.Errorf("%s is not HR", u.Email)
	}
	if hrCount <= 1 {
		return errors.New("refusing to demote the last HR account")
	}
	return nil
}

// ---- validation ----

func validateName(first, last string) error {
	switch {
	case first == "" || last == "":
		return domain.Invalid("Enter your first and last name.")
	case len(first) > 60 || len(last) > 60:
		return domain.Invalid("Names can be at most 60 characters.")
	}
	return nil
}

func (s *Service) validateDOB(dob domain.Date) error {
	today := s.today()
	if dob.After(today) || dob.Year() < 1900 {
		return domain.Invalid("Enter a real date of birth.")
	}
	if domain.Age(dob.Time, today) < 18 {
		return domain.Invalid("You must be at least 18 years old.")
	}
	return nil
}

func (s *Service) validateEmail(email string) error {
	addr, err := mail.ParseAddress(email)
	if err != nil || addr.Address != email {
		return domain.Invalid("Enter a valid email address.")
	}
	if len(s.allowedDomains) > 0 {
		domainPart := email[strings.LastIndex(email, "@")+1:]
		if !slices.Contains(s.allowedDomains, domainPart) {
			return domain.Invalid("Use your company email (%s).", strings.Join(s.allowedDomains, ", "))
		}
	}
	return nil
}

func validateNewPassword(password, confirm string) error {
	if len(password) < 8 {
		return domain.Invalid("Use at least 8 characters for the password.")
	}
	if confirm != "" && confirm != password {
		return domain.Invalid("The passwords do not match.")
	}
	return nil
}
