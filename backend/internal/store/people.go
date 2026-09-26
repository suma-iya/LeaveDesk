package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
	"github.com/suma-iya/leavedesk/backend/internal/hr"
	"github.com/suma-iya/leavedesk/backend/internal/leave"
)

func (s *Store) collectUsers(ctx context.Context, sql string, args ...any) ([]domain.User, error) {
	rows, err := s.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, fmt.Errorf("query users: %w", err)
	}
	defer rows.Close()
	out := []domain.User{}
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		out = append(out, *u)
	}
	return out, rows.Err()
}

func (s *Store) Departments(ctx context.Context) ([]domain.Department, error) {
	rows, err := s.db.Query(ctx, `SELECT id, name FROM departments ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("departments: %w", err)
	}
	defer rows.Close()
	out := []domain.Department{}
	for rows.Next() {
		var d domain.Department
		if err := rows.Scan(&d.ID, &d.Name); err != nil {
			return nil, fmt.Errorf("scan department: %w", err)
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (s *Store) DepartmentByID(ctx context.Context, id int) (*domain.Department, error) {
	var d domain.Department
	err := s.db.QueryRow(ctx, `SELECT id, name FROM departments WHERE id = $1`, id).Scan(&d.ID, &d.Name)
	return &d, translate(err, "department by id")
}

func (s *Store) CreateDepartment(ctx context.Context, name string) (*domain.Department, error) {
	d := domain.Department{Name: name}
	err := s.db.QueryRow(ctx, `INSERT INTO departments (name) VALUES ($1) RETURNING id`, name).Scan(&d.ID)
	return &d, translate(err, "create department")
}

// ActiveUsers lists every account (employees and HR) for the People page.
func (s *Store) ActiveUsers(ctx context.Context, q string, departmentID, page, pageSize int) ([]domain.User, int, error) {
	where := []string{"true"}
	var args []any
	if departmentID != 0 {
		args = append(args, departmentID)
		where = append(where, fmt.Sprintf("u.department_id = $%d", len(args)))
	}
	if q = strings.TrimSpace(q); q != "" {
		args = append(args, "%"+escapeLike(q)+"%")
		where = append(where, fmt.Sprintf("(u.first_name || ' ' || u.last_name ILIKE $%d OR u.email::text ILIKE $%d)", len(args), len(args)))
	}
	clause := " WHERE " + strings.Join(where, " AND ")
	var total int
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM users u`+clause, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count users: %w", err)
	}
	args = append(args, pageSize, (page-1)*pageSize)
	users, err := s.collectUsers(ctx, userSelect+clause+
		fmt.Sprintf(" ORDER BY u.first_name, u.last_name LIMIT $%d OFFSET $%d", len(args)-1, len(args)), args...)
	return users, total, err
}

func (s *Store) SetDepartment(ctx context.Context, userID string, departmentID int) error {
	_, err := s.db.Exec(ctx, `UPDATE users SET department_id = $1 WHERE id = $2`, departmentID, userID)
	return translate(err, "set department")
}

func (s *Store) LockRoles(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('leavedesk:first-hr'))`)
	return translate(err, "lock roles")
}

func (s *Store) HRCount(ctx context.Context) (int, error) {
	var n int
	err := s.db.QueryRow(ctx, `SELECT count(*) FROM users WHERE role = 'hr'`).Scan(&n)
	return n, translate(err, "count hr")
}

func (s *Store) SetUserRole(ctx context.Context, userID string, role domain.Role) error {
	_, err := s.db.Exec(ctx, `UPDATE users SET role = $1 WHERE id = $2`, role, userID)
	return translate(err, "set role")
}

// SalaryHistory is newest first; the first row is the current salary.
func (s *Store) SalaryHistory(ctx context.Context, userID string) ([]hr.Salary, error) {
	rows, err := s.db.Query(ctx, `
		SELECT monthly_bdt, effective_from, created_at FROM salaries
		WHERE user_id = $1 ORDER BY effective_from DESC, created_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("salary history: %w", err)
	}
	defer rows.Close()
	out := []hr.Salary{}
	for rows.Next() {
		var sal hr.Salary
		var from time.Time
		if err := rows.Scan(&sal.MonthlyBDT, &from, &sal.RecordedAt); err != nil {
			return nil, fmt.Errorf("scan salary: %w", err)
		}
		sal.EffectiveFrom = domain.DateOf(from)
		out = append(out, sal)
	}
	return out, rows.Err()
}

// AddSalary never overwrites: each change is a new row.
func (s *Store) AddSalary(ctx context.Context, userID string, monthly int64, from domain.Date, actorID string) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO salaries (user_id, monthly_bdt, effective_from, created_by) VALUES ($1, $2, $3, $4)`,
		userID, monthly, from.Time, actorID)
	return translate(err, "add salary")
}

func (s *Store) SetLimits(ctx context.Context, userID string, year int, limits map[leave.Type]int) error {
	for t, days := range limits {
		_, err := s.db.Exec(ctx, `
			INSERT INTO leave_limits (user_id, year, type, days) VALUES ($1, $2, $3, $4)
			ON CONFLICT (user_id, year, type) DO UPDATE SET days = EXCLUDED.days`, userID, year, t, days)
		if err != nil {
			return translate(err, "set limit")
		}
	}
	return nil
}

func (s *Store) Audit(ctx context.Context, entries []hr.AuditEntry) error {
	for _, e := range entries {
		_, err := s.db.Exec(ctx, `
			INSERT INTO audit_log (actor_id, target_user_id, field, old_value, new_value) VALUES ($1, $2, $3, $4, $5)`,
			e.ActorID, e.TargetID, e.Field, e.Old, e.New)
		if err != nil {
			return translate(err, "audit")
		}
	}
	return nil
}

// InTx runs fn in a transaction locked on the target user (see UserTx).
func (s *Store) InTx(ctx context.Context, userID string, fn func(hr.Store) error) error {
	return s.UserTx(ctx, userID, func(tx *Store) error { return fn(tx) })
}
