package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/suma-iya/employee-leave-tracker/backend/internal/model"
)

type UserRepository struct{ db *pgxpool.Pool }

func NewUserRepository(db *pgxpool.Pool) *UserRepository { return &UserRepository{db: db} }

const userColumns = `id, name, email, role, department, password_hash, google_id, created_at`

func scanUser(row pgx.Row) (*model.User, error) {
	var u model.User
	err := row.Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.Department,
		&u.PasswordHash, &u.GoogleID, &u.CreatedAt)
	if err != nil {
		return nil, translate(err)
	}
	return &u, nil
}

func (r *UserRepository) Create(ctx context.Context, u *model.User) error {
	err := r.db.QueryRow(ctx, `
		INSERT INTO users (name, email, role, department, password_hash, google_id)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at`,
		u.Name, u.Email, u.Role, u.Department, u.PasswordHash, u.GoogleID,
	).Scan(&u.ID, &u.CreatedAt)
	if err != nil {
		return fmt.Errorf("insert user: %w", translate(err))
	}
	return nil
}

func (r *UserRepository) GetByID(ctx context.Context, id int64) (*model.User, error) {
	u, err := scanUser(r.db.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1`, id))
	if err != nil {
		return nil, fmt.Errorf("get user %d: %w", id, err)
	}
	return u, nil
}

func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	u, err := scanUser(r.db.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE email = $1`, email))
	if err != nil {
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	return u, nil
}

func (r *UserRepository) GetByGoogleID(ctx context.Context, googleID string) (*model.User, error) {
	u, err := scanUser(r.db.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE google_id = $1`, googleID))
	if err != nil {
		return nil, fmt.Errorf("get user by google id: %w", err)
	}
	return u, nil
}

func (r *UserRepository) LinkGoogleID(ctx context.Context, userID int64, googleID string) error {
	_, err := r.db.Exec(ctx, `UPDATE users SET google_id = $1 WHERE id = $2`, googleID, userID)
	if err != nil {
		return fmt.Errorf("link google id: %w", translate(err))
	}
	return nil
}

// ListEmployees returns every EMPLOYEE with their leave counts per status,
// computed in one query with conditional aggregation.
func (r *UserRepository) ListEmployees(ctx context.Context) ([]model.EmployeeRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT u.id, u.name, u.email, u.role, u.department, u.created_at,
		       COUNT(l.id) FILTER (WHERE l.status = 'PENDING'),
		       COUNT(l.id) FILTER (WHERE l.status = 'APPROVED'),
		       COUNT(l.id) FILTER (WHERE l.status = 'REJECTED'),
		       COUNT(l.id)
		FROM users u
		LEFT JOIN leaves l ON l.user_id = u.id
		WHERE u.role = 'EMPLOYEE'
		GROUP BY u.id
		ORDER BY u.name`)
	if err != nil {
		return nil, fmt.Errorf("list employees: %w", err)
	}
	defer rows.Close()

	employees := []model.EmployeeRow{}
	for rows.Next() {
		var e model.EmployeeRow
		if err := rows.Scan(&e.ID, &e.Name, &e.Email, &e.Role, &e.Department, &e.CreatedAt,
			&e.Leaves.Pending, &e.Leaves.Approved, &e.Leaves.Rejected, &e.Leaves.Total); err != nil {
			return nil, fmt.Errorf("scan employee: %w", err)
		}
		employees = append(employees, e)
	}
	return employees, rows.Err()
}

func (r *UserRepository) Update(ctx context.Context, u *model.User) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE users SET name = $1, email = $2, department = $3, password_hash = $4
		WHERE id = $5`,
		u.Name, u.Email, u.Department, u.PasswordHash, u.ID)
	if err != nil {
		return fmt.Errorf("update user %d: %w", u.ID, translate(err))
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("update user %d: %w", u.ID, model.ErrNotFound)
	}
	return nil
}

func (r *UserRepository) Delete(ctx context.Context, id int64) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete user %d: %w", id, err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("delete user %d: %w", id, model.ErrNotFound)
	}
	return nil
}

func (r *UserRepository) CountByRole(ctx context.Context, role model.Role) (int, error) {
	var n int
	if err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE role = $1`, role).Scan(&n); err != nil {
		return 0, fmt.Errorf("count users: %w", err)
	}
	return n, nil
}
