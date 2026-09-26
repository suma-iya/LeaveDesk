// Package hr holds HR-only operations: approving registrations, the people
// directory, and changes to department, salary and leave limits. Every
// change writes an audit_log row.
package hr

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

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
	PendingRegistrations(ctx context.Context) ([]domain.User, error)
	ApproveRegistration(ctx context.Context, userID string, departmentID int, joined time.Time) (bool, error)
	DeleteRegistration(ctx context.Context, userID string) (bool, error)
	Departments(ctx context.Context) ([]domain.Department, error)
	DepartmentByID(ctx context.Context, id int) (*domain.Department, error)
	CreateDepartment(ctx context.Context, name string) (*domain.Department, error)
	ActiveUsers(ctx context.Context, q string, departmentID, page, pageSize int) ([]domain.User, int, error)
	SetDepartment(ctx context.Context, userID string, departmentID int) error
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

func (s *Service) Registrations(ctx context.Context) ([]domain.User, error) {
	return s.store.PendingRegistrations(ctx)
}

// Approve activates a pending account in the chosen department; the
// joining date is the approval date.
func (s *Service) Approve(ctx context.Context, actor *domain.User, userID string, departmentID int) error {
	dept, err := s.department(ctx, departmentID)
	if err != nil {
		return err
	}
	return s.store.InTx(ctx, userID, func(tx Store) error {
		ok, err := tx.ApproveRegistration(ctx, userID, dept.ID, s.today())
		if err != nil {
			return err
		}
		if !ok {
			return domain.NotFound("That registration is no longer pending.")
		}
		return tx.Audit(ctx, []AuditEntry{
			{actor.ID, userID, "status", "pending", "active"},
			{actor.ID, userID, "department", "", dept.Name},
		})
	})
}

// Reject deletes a pending account.
func (s *Service) Reject(ctx context.Context, actor *domain.User, userID string) error {
	return s.store.InTx(ctx, userID, func(tx Store) error {
		ok, err := tx.DeleteRegistration(ctx, userID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.NotFound("That registration is no longer pending.")
		}
		return tx.Audit(ctx, []AuditEntry{{actor.ID, userID, "registration", "pending", "rejected"}})
	})
}

func (s *Service) Departments(ctx context.Context) ([]domain.Department, error) {
	return s.store.Departments(ctx)
}

func (s *Service) CreateDepartment(ctx context.Context, name string) (*domain.Department, error) {
	name = strings.Join(strings.Fields(name), " ")
	if len(name) < 2 || len(name) > 60 {
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
	u, err := s.activeUser(ctx, id)
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

func (s *Service) activeUser(ctx context.Context, id string) (*domain.User, error) {
	u, err := s.store.UserByID(ctx, id)
	if errors.Is(err, domain.ErrNotFound) || (err == nil && !u.IsActive()) {
		return nil, domain.NotFound("Employee not found.")
	}
	return u, err
}

// Change is PATCH /hr/employees/{id}. Only department, salary and this
// year's leave limits can change; name, email, date of birth, password,
// role and joining date are never editable by HR.
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
	u, err := s.activeUser(ctx, id)
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
