// Package hr holds HR-only operations: the people directory and changes to
// department, salary and leave limits. Every change writes an audit_log row.
package hr

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
	"github.com/suma-iya/leavedesk/backend/internal/leave"
)

type Salary struct {
	MonthlyBDT    int64       `json:"monthlyBdt"`
	EffectiveFrom domain.Date `json:"effectiveFrom"`
	RecordedAt    time.Time   `json:"recordedAt"`
}

type AuditEntry struct {
	ActorID, TargetID, Field, Old, New string
}

type Store interface {
	UserByID(ctx context.Context, id string) (*domain.User, error)
	Departments(ctx context.Context) ([]domain.Department, error)
	DepartmentByID(ctx context.Context, id int) (*domain.Department, error)
	CreateDepartment(ctx context.Context, name string) (*domain.Department, error)
	ActiveUsers(ctx context.Context, q string, departmentID, page, pageSize int) ([]domain.User, int, error)
	SetDepartment(ctx context.Context, userID string, departmentID int) error
	// LockRoles takes the lock registration and promote/demote use, so the
	// HR count can't change between HRCount and SetUserRole.
	LockRoles(ctx context.Context) error
	HRCount(ctx context.Context) (int, error)
	SetUserRole(ctx context.Context, userID string, role domain.Role) error
	SalaryHistory(ctx context.Context, userID string) ([]Salary, error)
	AddSalary(ctx context.Context, userID string, monthly int64, from domain.Date, actorID string) error
	SetLimits(ctx context.Context, userID string, year int, limits map[leave.Type]int) error
	Usage(ctx context.Context, userIDs []string, year int) (map[string]leave.Usage, error)
	Audit(ctx context.Context, entries []AuditEntry) error
	InTx(ctx context.Context, userID string, fn func(Store) error) error
}

type Service struct {
	store Store
	leave *leave.Service
	today func() time.Time
}

func NewService(s Store, l *leave.Service, today func() time.Time) *Service {
	return &Service{store: s, leave: l, today: today}
}

func (s *Service) Departments(ctx context.Context) ([]domain.Department, error) {
	return s.store.Departments(ctx)
}

func (s *Service) CreateDepartment(ctx context.Context, name string) (*domain.Department, error) {
	name = strings.Join(strings.Fields(name), " ")
	if n := utf8.RuneCountInString(name); n < 2 || n > 60 {
		return nil, domain.Invalid("Department names are 2–60 characters.")
	}
	d, err := s.store.CreateDepartment(ctx, name)
	if errors.Is(err, domain.ErrConflict) {
		return nil, domain.Conflict("DEPARTMENT_EXISTS", "A department called %s already exists.", name)
	}
	return d, err
}

func (s *Service) department(ctx context.Context, id int) (*domain.Department, error) {
	d, err := s.store.DepartmentByID(ctx, id)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, domain.Invalid("Choose a department.")
	}
	return d, err
}

type EmployeeRow struct {
	User   domain.User
	Yearly leave.YearTotal
}

func (s *Service) Employees(ctx context.Context, q string, departmentID, page, pageSize int) ([]EmployeeRow, int, error) {
	page, pageSize = max(page, 1), min(max(pageSize, 1), 100)
	users, total, err := s.store.ActiveUsers(ctx, q, departmentID, page, pageSize)
	if err != nil {
		return nil, 0, err
	}
	ids := make([]string, len(users))
	for i, u := range users {
		ids[i] = u.ID
	}
	totals, err := s.leave.YearTotals(ctx, ids, s.today().Year())
	if err != nil {
		return nil, 0, err
	}
	rows := make([]EmployeeRow, len(users))
	for i, u := range users {
		rows[i] = EmployeeRow{User: u, Yearly: totals[u.ID]}
	}
	return rows, total, nil
}

type EmployeeDetail struct {
	User     *domain.User
	Salaries []Salary
	Year     int
	Balances []leave.Balance
	Recent   []leave.Request
}

func (s *Service) Employee(ctx context.Context, id string) (*EmployeeDetail, error) {
	u, err := s.user(ctx, id)
	if err != nil {
		return nil, err
	}
	salaries, err := s.store.SalaryHistory(ctx, id)
	if err != nil {
		return nil, err
	}
	year := s.today().Year()
	balances, err := s.leave.Balances(ctx, id, year)
	if err != nil {
		return nil, err
	}
	recent, _, err := s.leave.List(ctx, u, "mine", leave.Filter{PageSize: 5})
	if err != nil {
		return nil, err
	}
	return &EmployeeDetail{User: u, Salaries: salaries, Year: year, Balances: balances, Recent: recent}, nil
}

func (s *Service) user(ctx context.Context, id string) (*domain.User, error) {
	u, err := s.store.UserByID(ctx, id)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, domain.NotFound("Employee not found.")
	}
	return u, err
}

// Change is PATCH /hr/employees/{id}. Only department, salary and this
// year's leave limits can change; name, email, date of birth, password and
// joining date are never editable by HR. The role follows the department:
// see domain.IsHRDepartment.
type Change struct {
	DepartmentID *int `json:"departmentId"`
	Salary       *struct {
		MonthlyBDT    int64        `json:"monthlyBdt"`
		EffectiveFrom *domain.Date `json:"effectiveFrom"`
	} `json:"salary"`
	Limits *struct {
		Annual int `json:"annual"`
		Casual int `json:"casual"`
		Sick   int `json:"sick"`
	} `json:"limits"`
}

// Update validates everything first, then applies all parts in one
// transaction (locked on the employee, like their own leave submissions).
func (s *Service) Update(ctx context.Context, actor *domain.User, id string, c Change) error {
	u, err := s.user(ctx, id)
	if err != nil {
		return err
	}
	if u.ID == actor.ID && (c.Salary != nil || c.Limits != nil) {
		return domain.Forbidden("SELF_EDIT", "Another HR must change your own salary or leave limits.")
	}
	var dept *domain.Department
	if c.DepartmentID != nil {
		if dept, err = s.department(ctx, *c.DepartmentID); err != nil {
			return err
		}
	}
	if c.Salary != nil {
		switch {
		case c.Salary.MonthlyBDT <= 0 || c.Salary.MonthlyBDT > 100_000_000:
			return domain.Invalid("Enter a monthly salary in whole taka.")
		case c.Salary.EffectiveFrom == nil:
			return domain.Invalid("Enter the date the salary applies from.")
		}
	}

	year := s.today().Year()
	return s.store.InTx(ctx, id, func(tx Store) error {
		var audit []AuditEntry
		if dept != nil && (u.Department == nil || u.Department.ID != dept.ID) {
			if err := tx.SetDepartment(ctx, id, dept.ID); err != nil {
				return err
			}
			old := ""
			if u.Department != nil {
				old = u.Department.Name
			}
			audit = append(audit, AuditEntry{actor.ID, id, "department", old, dept.Name})
			entry, err := s.roleForDepartment(ctx, tx, actor, u, dept)
			if err != nil {
				return err
			}
			if entry != nil {
				audit = append(audit, *entry)
			}
		}
		if c.Salary != nil {
			history, err := tx.SalaryHistory(ctx, id)
			if err != nil {
				return err
			}
			if err := tx.AddSalary(ctx, id, c.Salary.MonthlyBDT, *c.Salary.EffectiveFrom, actor.ID); err != nil {
				return err
			}
			old := ""
			if len(history) > 0 {
				old = describeSalary(history[0].MonthlyBDT, history[0].EffectiveFrom)
			}
			audit = append(audit, AuditEntry{actor.ID, id, "salary", old, describeSalary(c.Salary.MonthlyBDT, *c.Salary.EffectiveFrom)})
		}
		if c.Limits != nil {
			entries, err := s.applyLimits(ctx, tx, actor, id, year, map[leave.Type]int{
				leave.Annual: c.Limits.Annual, leave.Casual: c.Limits.Casual, leave.Sick: c.Limits.Sick,
			})
			if err != nil {
				return err
			}
			audit = append(audit, entries...)
		}
		return tx.Audit(ctx, audit)
	})
}

// roleForDepartment applies the department rule after u moves to dept:
// into Human Resources makes them HR; out of it makes them an employee,
// unless they are the last HR. HR accounts outside that department (the
// first account, or one promoted with the CLI) keep their role.
func (s *Service) roleForDepartment(ctx context.Context, tx Store, actor, u *domain.User, dept *domain.Department) (*AuditEntry, error) {
	role := u.Role
	switch {
	case domain.IsHRDepartment(dept.Name):
		role = domain.RoleHR
	case u.Department != nil && domain.IsHRDepartment(u.Department.Name):
		role = domain.RoleEmployee
	}
	if role == u.Role {
		return nil, nil
	}
	if err := tx.LockRoles(ctx); err != nil {
		return nil, err
	}
	if role == domain.RoleEmployee {
		count, err := tx.HRCount(ctx)
		if err != nil {
			return nil, err
		}
		if count <= 1 {
			return nil, domain.Conflict("LAST_HR", "%s is the only HR. Move someone else into %s first.", u.FullName(), u.Department.Name)
		}
	}
	if err := tx.SetUserRole(ctx, u.ID, role); err != nil {
		return nil, err
	}
	return &AuditEntry{actor.ID, u.ID, "role", string(u.Role), string(role)}, nil
}

// applyLimits enforces the floor (never below used + pending) inside the
// locked transaction, so a request submitted meanwhile is counted.
func (s *Service) applyLimits(ctx context.Context, tx Store, actor *domain.User, id string, year int, limits map[leave.Type]int) ([]AuditEntry, error) {
	usage, err := tx.Usage(ctx, []string{id}, year)
	if err != nil {
		return nil, err
	}
	current, err := s.leave.Balances(ctx, id, year)
	if err != nil {
		return nil, err
	}
	var audit []AuditEntry
	for _, t := range leave.Types {
		u := usage[id][t]
		if err := leave.ValidateLimit(t, limits[t], u.Used, u.Pending); err != nil {
			return nil, err
		}
		for _, b := range current {
			if b.Type == t && b.Limit != limits[t] {
				audit = append(audit, AuditEntry{actor.ID, id, fmt.Sprintf("limit_%s_%d", t, year), fmt.Sprint(b.Limit), fmt.Sprint(limits[t])})
			}
		}
	}
	return audit, tx.SetLimits(ctx, id, year, limits)
}

func describeSalary(monthly int64, from domain.Date) string {
	return fmt.Sprintf("BDT %d from %s", monthly, from)
}
