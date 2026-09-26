package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
)

// Every user read joins the department so the name comes along.
const userSelect = `
	SELECT u.id, u.email, u.first_name, u.last_name, u.date_of_birth, u.role,
	       u.department_id, d.name, u.joined_on, u.avatar_file_id, u.created_at, u.password_hash, u.google_sub
	FROM users u LEFT JOIN departments d ON d.id = u.department_id`

func scanUser(row pgx.Row) (*domain.User, error) {
	var u domain.User
	var deptID *int
	var deptName *string
	err := row.Scan(&u.ID, &u.Email, &u.FirstName, &u.LastName, &u.DateOfBirth, &u.Role,
		&deptID, &deptName, &u.JoinedOn, &u.AvatarFileID, &u.CreatedAt, &u.PasswordHash, &u.GoogleSub)
	if err != nil {
		return nil, err
	}
	if deptID != nil && deptName != nil {
		u.Department = &domain.Department{ID: *deptID, Name: *deptName}
	}
	return &u, nil
}

func (s *Store) UserByID(ctx context.Context, id string) (*domain.User, error) {
	u, err := scanUser(s.db.QueryRow(ctx, userSelect+` WHERE u.id = $1`, id))
	return u, translate(err, "user by id")
}

func (s *Store) UserByEmail(ctx context.Context, email string) (*domain.User, error) {
	u, err := scanUser(s.db.QueryRow(ctx, userSelect+` WHERE u.email = $1`, email))
	return u, translate(err, "user by email")
}

func (s *Store) UserByGoogleSub(ctx context.Context, sub string) (*domain.User, error) {
	u, err := scanUser(s.db.QueryRow(ctx, userSelect+` WHERE u.google_sub = $1`, sub))
	return u, translate(err, "user by google sub")
}

func (s *Store) HasHR(ctx context.Context) (bool, error) {
	var has bool
	err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE role = 'hr')`).Scan(&has)
	return has, translate(err, "check hr")
}

// NewUser is what registration stores.
type NewUser struct {
	Email, FirstName, LastName string
	DateOfBirth                domain.Date
	PasswordHash               string
}

// CreateUser inserts a registration. decide gets "does an HR exist?" and
// returns the role; it runs under a transaction-scoped advisory lock so two
// simultaneous first registrations can't both become HR.
func (s *Store) CreateUser(ctx context.Context, n NewUser, decide func(hasHR bool) domain.Role) (*domain.User, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('leavedesk:first-hr'))`); err != nil {
		return nil, fmt.Errorf("lock: %w", err)
	}
	var hasHR bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE role = 'hr')`).Scan(&hasHR); err != nil {
		return nil, fmt.Errorf("check hr: %w", err)
	}
	role := decide(hasHR)

	// Everyone can use the app straight away and "joins" on the day they sign up.
	var id string
	err = tx.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, first_name, last_name, date_of_birth, role, joined_on)
		VALUES ($1, $2, $3, $4, $5, $6, current_date)
		RETURNING id`, n.Email, n.PasswordHash, n.FirstName, n.LastName, n.DateOfBirth.Time, role).Scan(&id)
	if err != nil {
		return nil, translate(err, "insert user")
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return s.UserByID(ctx, id)
}

func (s *Store) LinkGoogle(ctx context.Context, userID, sub string) error {
	_, err := s.db.Exec(ctx, `UPDATE users SET google_sub = $1 WHERE id = $2 AND google_sub IS NULL`, sub, userID)
	return translate(err, "link google")
}

func (s *Store) UpdateProfile(ctx context.Context, userID, first, last string, dob domain.Date, avatarFileID *string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE users SET first_name = $1, last_name = $2, date_of_birth = $3, avatar_file_id = $4 WHERE id = $5`,
		first, last, dob.Time, avatarFileID, userID)
	return translate(err, "update profile")
}

func (s *Store) UpdatePassword(ctx context.Context, userID, hash string) error {
	_, err := s.db.Exec(ctx, `UPDATE users SET password_hash = $1 WHERE id = $2`, hash, userID)
	return translate(err, "update password")
}

// SetRole changes a role under the same advisory lock as registration.
// guard receives the current HR count and can veto (e.g. last HR).
func (s *Store) SetRole(ctx context.Context, email string, role domain.Role, guard func(u *domain.User, hrCount int) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('leavedesk:first-hr'))`); err != nil {
		return fmt.Errorf("lock: %w", err)
	}
	u, err := scanUser(tx.QueryRow(ctx, userSelect+` WHERE u.email = $1`, email))
	if err != nil {
		return translate(err, "user by email")
	}
	var hrCount int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM users WHERE role = 'hr'`).Scan(&hrCount); err != nil {
		return fmt.Errorf("count hr: %w", err)
	}
	if err := guard(u, hrCount); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE users SET role = $1 WHERE id = $2`, role, u.ID); err != nil {
		return fmt.Errorf("set role: %w", err)
	}
	return tx.Commit(ctx)
}
