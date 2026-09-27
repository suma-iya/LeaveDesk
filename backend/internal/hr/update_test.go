package hr

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
	"github.com/suma-iya/leavedesk/backend/internal/leave"
)

// leaveReads is the part of leave.Store that leave.Service.Balances,
// YearTotals and List need.
type leaveReads struct {
	leave.Store
	usage     map[string]leave.Usage
	overrides map[string]map[leave.Type]int
	listed    *leave.Filter
}

func (l *leaveReads) Usage(context.Context, []string, int) (map[string]leave.Usage, error) {
	return l.usage, nil
}
func (l *leaveReads) LimitOverrides(context.Context, []string, int) (map[string]map[leave.Type]int, error) {
	return l.overrides, nil
}
func (l *leaveReads) ListRequests(_ context.Context, f leave.Filter) ([]leave.Request, int, error) {
	l.listed = &f
	return []leave.Request{{ID: 1, UserID: f.UserID}}, 1, nil
}

// updateStore is an in-memory hr.Store that records every write.
type updateStore struct {
	Store
	users     map[string]*domain.User
	usage     map[string]leave.Usage
	history   []Salary
	createErr error
	hrCount   int

	txCalls    int
	dept       int
	role       domain.Role
	salary     *Salary
	salaryBy   string
	limits     map[leave.Type]int
	limitsYear int
	audit      []AuditEntry
	auditCalls int

	activeArgs []any
	active     []domain.User
}

func (f *updateStore) UserByID(_ context.Context, id string) (*domain.User, error) {
	if u, ok := f.users[id]; ok {
		return u, nil
	}
	return nil, fmt.Errorf("user by id: %w", domain.ErrNotFound)
}
func (f *updateStore) DepartmentByID(_ context.Context, id int) (*domain.Department, error) {
	for _, d := range []*domain.Department{engineering, finance, humanRes} {
		if d.ID == id {
			return d, nil
		}
	}
	return nil, fmt.Errorf("department: %w", domain.ErrNotFound)
}
func (f *updateStore) Departments(context.Context) ([]domain.Department, error) {
	return []domain.Department{*engineering, *finance, *humanRes}, nil
}
func (f *updateStore) CreateDepartment(_ context.Context, name string) (*domain.Department, error) {
	if f.createErr != nil {
		return nil, f.createErr
	}
	return &domain.Department{ID: 9, Name: name}, nil
}
func (f *updateStore) InTx(_ context.Context, _ string, fn func(Store) error) error {
	f.txCalls++
	return fn(f)
}
func (f *updateStore) SetDepartment(_ context.Context, _ string, id int) error {
	f.dept = id
	return nil
}
func (f *updateStore) LockRoles(context.Context) error      { return nil }
func (f *updateStore) HRCount(context.Context) (int, error) { return f.hrCount, nil }
func (f *updateStore) SetUserRole(_ context.Context, _ string, role domain.Role) error {
	f.role = role
	return nil
}
func (f *updateStore) SalaryHistory(context.Context, string) ([]Salary, error) { return f.history, nil }
func (f *updateStore) AddSalary(_ context.Context, _ string, monthly int64, from domain.Date, actorID string) error {
	f.salary, f.salaryBy = &Salary{MonthlyBDT: monthly, EffectiveFrom: from}, actorID
	return nil
}
func (f *updateStore) SetLimits(_ context.Context, _ string, year int, limits map[leave.Type]int) error {
	f.limits, f.limitsYear = limits, year
	return nil
}
func (f *updateStore) Usage(context.Context, []string, int) (map[string]leave.Usage, error) {
	return f.usage, nil
}
func (f *updateStore) Audit(_ context.Context, entries []AuditEntry) error {
	f.auditCalls++
	f.audit = entries
	return nil
}
func (f *updateStore) ActiveUsers(_ context.Context, q string, departmentID, page, pageSize int) ([]domain.User, int, error) {
	f.activeArgs = []any{q, departmentID, page, pageSize}
	return f.active, 42, nil
}

var (
	fixedToday = func() time.Time { return time.Date(2026, 9, 26, 0, 0, 0, 0, time.UTC) }
	defaults   = leave.Policy{Defaults: map[leave.Type]int{leave.Annual: 16, leave.Casual: 3, leave.Sick: 3}}
)

func newUpdateService(st *updateStore, reads *leaveReads) *Service {
	if reads == nil {
		reads = &leaveReads{usage: st.usage}
	}
	return NewService(st, leave.NewService(reads, defaults, fixedToday), fixedToday)
}

func date(s string) *domain.Date { d, _ := domain.ParseDate(s); return &d }

type salaryChange = struct {
	MonthlyBDT    int64        `json:"monthlyBdt"`
	EffectiveFrom *domain.Date `json:"effectiveFrom"`
}
type limitsChange = struct {
	Annual int `json:"annual"`
	Casual int `json:"casual"`
	Sick   int `json:"sick"`
}

func intp(i int) *int { return &i }

func TestUpdateValidation(t *testing.T) {
	actor := &domain.User{ID: "hr-1", FirstName: "Hasina", LastName: "Begum", Role: domain.RoleHR, Department: humanRes}
	employee := &domain.User{ID: "emp-1", FirstName: "Rakib", LastName: "Hasan", Role: domain.RoleEmployee, Department: engineering}
	used := map[string]leave.Usage{"emp-1": {leave.Annual: {Used: 5, Pending: 3}, leave.Sick: {Used: 1}}}

	tests := []struct {
		name       string
		target     string
		change     Change
		wantStatus int
		wantCode   string
		wantMsg    string // substring, optional
		wantNoTx   bool   // refused before the transaction starts
	}{
		{name: "unknown employee", target: "ghost", change: Change{DepartmentID: intp(1)}, wantStatus: 404, wantCode: "NOT_FOUND", wantNoTx: true},
		{name: "own salary", target: "hr-1", change: Change{Salary: &salaryChange{MonthlyBDT: 90000, EffectiveFrom: date("2026-10-01")}},
			wantStatus: 403, wantCode: "SELF_EDIT", wantNoTx: true},
		{name: "own limits", target: "hr-1", change: Change{Limits: &limitsChange{Annual: 30, Casual: 3, Sick: 3}},
			wantStatus: 403, wantCode: "SELF_EDIT", wantNoTx: true},
		{name: "unknown department", target: "emp-1", change: Change{DepartmentID: intp(99)},
			wantStatus: 400, wantCode: "VALIDATION", wantMsg: "Choose a department.", wantNoTx: true},
		{name: "zero salary", target: "emp-1", change: Change{Salary: &salaryChange{MonthlyBDT: 0, EffectiveFrom: date("2026-10-01")}},
			wantStatus: 400, wantCode: "VALIDATION", wantMsg: "whole taka", wantNoTx: true},
		{name: "negative salary", target: "emp-1", change: Change{Salary: &salaryChange{MonthlyBDT: -5, EffectiveFrom: date("2026-10-01")}},
			wantStatus: 400, wantCode: "VALIDATION", wantMsg: "whole taka", wantNoTx: true},
		{name: "salary over 100 million", target: "emp-1", change: Change{Salary: &salaryChange{MonthlyBDT: 100_000_001, EffectiveFrom: date("2026-10-01")}},
			wantStatus: 400, wantCode: "VALIDATION", wantMsg: "whole taka", wantNoTx: true},
		{name: "salary without effectiveFrom", target: "emp-1", change: Change{Salary: &salaryChange{MonthlyBDT: 50000}},
			wantStatus: 400, wantCode: "VALIDATION", wantMsg: "the date the salary applies from", wantNoTx: true},
		{name: "annual below used + pending", target: "emp-1", change: Change{Limits: &limitsChange{Annual: 7, Casual: 3, Sick: 3}},
			wantStatus: 400, wantCode: "LIMIT_TOO_LOW", wantMsg: "Annual: can't be below 8: 5 used, 3 pending."},
		{name: "sick below used", target: "emp-1", change: Change{Limits: &limitsChange{Annual: 16, Casual: 3, Sick: 0}},
			wantStatus: 400, wantCode: "LIMIT_TOO_LOW", wantMsg: "Sick: can't be below 1"},
		{name: "negative limit", target: "emp-1", change: Change{Limits: &limitsChange{Annual: 16, Casual: -1, Sick: 3}},
			wantStatus: 400, wantCode: "VALIDATION", wantMsg: "between 0 and 365"},
		{name: "limit over a year", target: "emp-1", change: Change{Limits: &limitsChange{Annual: 366, Casual: 3, Sick: 3}},
			wantStatus: 400, wantCode: "VALIDATION", wantMsg: "between 0 and 365"},
		{name: "salary for yourself is refused even with a bad amount (SELF_EDIT first)", target: "hr-1",
			change: Change{Salary: &salaryChange{MonthlyBDT: -1}}, wantStatus: 403, wantCode: "SELF_EDIT", wantNoTx: true},
		// Valid edge cases.
		{name: "salary of exactly 100 million", target: "emp-1", change: Change{Salary: &salaryChange{MonthlyBDT: 100_000_000, EffectiveFrom: date("2026-10-01")}}},
		{name: "salary of 1 taka", target: "emp-1", change: Change{Salary: &salaryChange{MonthlyBDT: 1, EffectiveFrom: date("2026-10-01")}}},
		{name: "limit exactly used + pending", target: "emp-1", change: Change{Limits: &limitsChange{Annual: 8, Casual: 0, Sick: 1}}},
		{name: "limit of 365", target: "emp-1", change: Change{Limits: &limitsChange{Annual: 365, Casual: 3, Sick: 3}}},
		{name: "HR may change their own department", target: "hr-1", change: Change{DepartmentID: intp(finance.ID)}},
		{name: "empty change is a no-op", target: "emp-1", change: Change{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := &updateStore{users: map[string]*domain.User{"hr-1": actor, "emp-1": employee}, usage: used, hrCount: 2}
			err := newUpdateService(st, nil).Update(context.Background(), actor, tt.target, tt.change)
			if tt.wantCode == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			de, ok := domain.AsError(err)
			if !ok || de.Status != tt.wantStatus || de.Code != tt.wantCode || !strings.Contains(de.Message, tt.wantMsg) {
				t.Fatalf("want %d %s %q, got %v", tt.wantStatus, tt.wantCode, tt.wantMsg, err)
			}
			if tt.wantNoTx && st.txCalls != 0 {
				t.Fatal("validation must fail before the transaction starts")
			}
			if st.auditCalls != 0 || st.salary != nil || st.limits != nil {
				t.Fatalf("a refused change must not audit or write: audit=%v salary=%v limits=%v", st.audit, st.salary, st.limits)
			}
		})
	}
}

func TestUpdateWritesAndAudits(t *testing.T) {
	actor := &domain.User{ID: "hr-1", Role: domain.RoleHR, Department: humanRes}
	tests := []struct {
		name       string
		user       *domain.User
		history    []Salary
		overrides  map[string]map[leave.Type]int
		change     Change
		wantDept   int
		wantSalary *Salary
		wantLimits map[leave.Type]int
		wantAudit  []AuditEntry
	}{
		{
			name:       "first salary has no old value",
			user:       &domain.User{ID: "emp-1", Role: domain.RoleEmployee, Department: engineering},
			change:     Change{Salary: &salaryChange{MonthlyBDT: 55000, EffectiveFrom: date("2026-10-01")}},
			wantSalary: &Salary{MonthlyBDT: 55000, EffectiveFrom: *date("2026-10-01")},
			wantAudit:  []AuditEntry{{"hr-1", "emp-1", "salary", "", "BDT 55000 from 2026-10-01"}},
		},
		{
			name:       "raise records the latest salary as the old value",
			user:       &domain.User{ID: "emp-1", Role: domain.RoleEmployee, Department: engineering},
			history:    []Salary{{MonthlyBDT: 50000, EffectiveFrom: *date("2026-01-01")}, {MonthlyBDT: 40000, EffectiveFrom: *date("2025-01-01")}},
			change:     Change{Salary: &salaryChange{MonthlyBDT: 60000, EffectiveFrom: date("2026-10-01")}},
			wantSalary: &Salary{MonthlyBDT: 60000, EffectiveFrom: *date("2026-10-01")},
			wantAudit:  []AuditEntry{{"hr-1", "emp-1", "salary", "BDT 50000 from 2026-01-01", "BDT 60000 from 2026-10-01"}},
		},
		{
			name:       "only changed limits are audited, all are saved for this year",
			user:       &domain.User{ID: "emp-1", Role: domain.RoleEmployee, Department: engineering},
			change:     Change{Limits: &limitsChange{Annual: 20, Casual: 3, Sick: 3}},
			wantLimits: map[leave.Type]int{leave.Annual: 20, leave.Casual: 3, leave.Sick: 3},
			wantAudit:  []AuditEntry{{"hr-1", "emp-1", "limit_annual_2026", "16", "20"}},
		},
		{
			name:       "old limit comes from the current override",
			user:       &domain.User{ID: "emp-1", Role: domain.RoleEmployee, Department: engineering},
			overrides:  map[string]map[leave.Type]int{"emp-1": {leave.Casual: 5}},
			change:     Change{Limits: &limitsChange{Annual: 16, Casual: 4, Sick: 2}},
			wantLimits: map[leave.Type]int{leave.Annual: 16, leave.Casual: 4, leave.Sick: 2},
			wantAudit: []AuditEntry{
				{"hr-1", "emp-1", "limit_casual_2026", "5", "4"},
				{"hr-1", "emp-1", "limit_sick_2026", "3", "2"},
			},
		},
		{
			name:     "department move from none",
			user:     &domain.User{ID: "emp-1", Role: domain.RoleEmployee},
			change:   Change{DepartmentID: intp(finance.ID)},
			wantDept: finance.ID,
			wantAudit: []AuditEntry{
				{"hr-1", "emp-1", "department", "", "Finance"},
			},
		},
		{
			name:   "same department writes nothing",
			user:   &domain.User{ID: "emp-1", Role: domain.RoleEmployee, Department: engineering},
			change: Change{DepartmentID: intp(engineering.ID)},
		},
		{
			name:       "everything at once, in order",
			user:       &domain.User{ID: "emp-1", Role: domain.RoleEmployee, Department: engineering},
			change:     Change{DepartmentID: intp(finance.ID), Salary: &salaryChange{MonthlyBDT: 70000, EffectiveFrom: date("2026-11-01")}, Limits: &limitsChange{Annual: 16, Casual: 5, Sick: 3}},
			wantDept:   finance.ID,
			wantSalary: &Salary{MonthlyBDT: 70000, EffectiveFrom: *date("2026-11-01")},
			wantLimits: map[leave.Type]int{leave.Annual: 16, leave.Casual: 5, leave.Sick: 3},
			wantAudit: []AuditEntry{
				{"hr-1", "emp-1", "department", "Engineering", "Finance"},
				{"hr-1", "emp-1", "salary", "", "BDT 70000 from 2026-11-01"},
				{"hr-1", "emp-1", "limit_casual_2026", "3", "5"},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := &updateStore{users: map[string]*domain.User{"hr-1": actor, "emp-1": tt.user}, history: tt.history, hrCount: 2}
			reads := &leaveReads{overrides: tt.overrides}
			if err := newUpdateService(st, reads).Update(context.Background(), actor, "emp-1", tt.change); err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if st.dept != tt.wantDept {
				t.Errorf("department set to %d, want %d", st.dept, tt.wantDept)
			}
			if !reflect.DeepEqual(st.salary, tt.wantSalary) {
				t.Errorf("salary %+v, want %+v", st.salary, tt.wantSalary)
			}
			if st.salary != nil && st.salaryBy != "hr-1" {
				t.Errorf("salary recorded by %q, want hr-1", st.salaryBy)
			}
			if !reflect.DeepEqual(st.limits, tt.wantLimits) {
				t.Errorf("limits %v, want %v", st.limits, tt.wantLimits)
			}
			if st.limits != nil && st.limitsYear != 2026 {
				t.Errorf("limits saved for %d, want 2026", st.limitsYear)
			}
			if st.txCalls != 1 || st.auditCalls != 1 {
				t.Errorf("want one transaction and one audit write, got %d and %d", st.txCalls, st.auditCalls)
			}
			if len(st.audit) != len(tt.wantAudit) || (len(tt.wantAudit) > 0 && !reflect.DeepEqual(st.audit, tt.wantAudit)) {
				t.Errorf("audit\n got %+v\nwant %+v", st.audit, tt.wantAudit)
			}
		})
	}
}

func TestCreateDepartment(t *testing.T) {
	tests := []struct {
		name      string
		in        string
		storeErr  error
		want      string // stored name
		wantCode  string
		wantState int
	}{
		{name: "simple", in: "Legal", want: "Legal"},
		{name: "spaces are collapsed and trimmed", in: "  Legal \t  Affairs \n", want: "Legal Affairs"},
		{name: "two characters", in: "QA", want: "QA"},
		{name: "sixty characters", in: strings.Repeat("x", 60), want: strings.Repeat("x", 60)},
		{name: "one character", in: "Q", wantCode: "VALIDATION", wantState: 400},
		{name: "one character after trimming", in: "  Q  ", wantCode: "VALIDATION", wantState: 400},
		{name: "blank", in: "   ", wantCode: "VALIDATION", wantState: 400},
		{name: "sixty-one characters", in: strings.Repeat("x", 61), wantCode: "VALIDATION", wantState: 400},
		{name: "duplicate", in: "Finance", storeErr: fmt.Errorf("insert: %w", domain.ErrConflict), wantCode: "DEPARTMENT_EXISTS", wantState: 409},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := &updateStore{createErr: tt.storeErr}
			d, err := newUpdateService(st, nil).CreateDepartment(context.Background(), tt.in)
			if tt.wantCode != "" {
				de, ok := domain.AsError(err)
				if !ok || de.Code != tt.wantCode || de.Status != tt.wantState {
					t.Fatalf("want %d %s, got %v", tt.wantState, tt.wantCode, err)
				}
				return
			}
			if err != nil || d.Name != tt.want {
				t.Fatalf("got %+v, %v; want name %q", d, err, tt.want)
			}
		})
	}

	t.Run("other store errors pass through", func(t *testing.T) {
		boom := errors.New("db down")
		_, err := newUpdateService(&updateStore{createErr: boom}, nil).CreateDepartment(context.Background(), "Legal")
		if !errors.Is(err, boom) {
			t.Fatalf("want the store error, got %v", err)
		}
	})
}

// "2–60 characters" means characters, not bytes: a 21-character Bengali
// name (63 bytes) is accepted.
func TestCreateDepartmentCountsCharacters(t *testing.T) {
	name := strings.Repeat("ক", 21)
	if _, err := newUpdateService(&updateStore{}, nil).CreateDepartment(context.Background(), name); err != nil {
		t.Fatalf("a 21-character name must be accepted: %v", err)
	}
}

func TestDepartmentsAndEmployees(t *testing.T) {
	st := &updateStore{active: []domain.User{{ID: "a"}, {ID: "b"}}}
	reads := &leaveReads{usage: map[string]leave.Usage{"a": {leave.Annual: {Used: 4, Pending: 2}}}}
	svc := newUpdateService(st, reads)
	ctx := context.Background()

	ds, err := svc.Departments(ctx)
	if err != nil || len(ds) != 3 {
		t.Fatalf("got %v, %v", ds, err)
	}

	tests := []struct {
		name                   string
		page, pageSize         int
		wantPage, wantPageSize int
	}{
		{"defaults are clamped up", 0, 0, 1, 1},
		{"negative page", -3, 10, 1, 10},
		{"page size capped at 100", 2, 500, 2, 100},
		{"normal", 3, 25, 3, 25},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rows, total, err := svc.Employees(ctx, "rak", 1, tt.page, tt.pageSize)
			if err != nil {
				t.Fatal(err)
			}
			if want := []any{"rak", 1, tt.wantPage, tt.wantPageSize}; !reflect.DeepEqual(st.activeArgs, want) {
				t.Fatalf("store called with %v, want %v", st.activeArgs, want)
			}
			if total != 42 || len(rows) != 2 {
				t.Fatalf("got %d rows of %d", len(rows), total)
			}
			if a := rows[0].Yearly; a.Used != 4 || a.Pending != 2 || a.Limit != 22 {
				t.Fatalf("yearly totals for a: %+v, want used 4, pending 2, limit 22", a)
			}
			if b := rows[1].Yearly; b.Used != 0 || b.Limit != 22 {
				t.Fatalf("yearly totals for b: %+v", b)
			}
		})
	}
}

func TestEmployeeDetail(t *testing.T) {
	emp := &domain.User{ID: "emp-1", Role: domain.RoleEmployee}
	st := &updateStore{users: map[string]*domain.User{"emp-1": emp}, history: []Salary{{MonthlyBDT: 50000}}}
	reads := &leaveReads{}
	svc := newUpdateService(st, reads)

	d, err := svc.Employee(context.Background(), "emp-1")
	if err != nil {
		t.Fatal(err)
	}
	if d.User != emp || d.Year != 2026 || len(d.Salaries) != 1 || len(d.Balances) != 3 || len(d.Recent) != 1 {
		t.Fatalf("unexpected detail %+v", d)
	}
	if reads.listed == nil || reads.listed.UserID != "emp-1" || reads.listed.PageSize != 5 {
		t.Fatalf("recent requests must be the employee's own 5 latest, got %+v", reads.listed)
	}

	if _, err := svc.Employee(context.Background(), "ghost"); err == nil {
		t.Fatal("want 404 for an unknown employee")
	} else if de, ok := domain.AsError(err); !ok || de.Status != 404 {
		t.Fatalf("want 404, got %v", err)
	}
}
