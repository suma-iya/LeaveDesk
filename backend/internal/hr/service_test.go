package hr

import (
	"context"
	"testing"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
)

var (
	engineering = &domain.Department{ID: 1, Name: "Engineering"}
	finance     = &domain.Department{ID: 2, Name: "Finance"}
	humanRes    = &domain.Department{ID: 3, Name: "Human Resources"}
)

// roleStore records department and role changes and the audit rows.
type roleStore struct {
	Store
	user    *domain.User
	hrCount int
	dept    int
	role    domain.Role
	locked  bool
	audit   []AuditEntry
}

func (f *roleStore) UserByID(context.Context, string) (*domain.User, error) { return f.user, nil }
func (f *roleStore) DepartmentByID(_ context.Context, id int) (*domain.Department, error) {
	for _, d := range []*domain.Department{engineering, finance, humanRes} {
		if d.ID == id {
			return d, nil
		}
	}
	return nil, domain.ErrNotFound
}
func (f *roleStore) InTx(_ context.Context, _ string, fn func(Store) error) error { return fn(f) }
func (f *roleStore) SetDepartment(_ context.Context, _ string, id int) error {
	f.dept = id
	return nil
}
func (f *roleStore) LockRoles(context.Context) error { f.locked = true; return nil }
func (f *roleStore) HRCount(context.Context) (int, error) {
	if !f.locked {
		panic("HRCount must run under LockRoles")
	}
	return f.hrCount, nil
}
func (f *roleStore) SetUserRole(_ context.Context, _ string, role domain.Role) error {
	f.role = role
	return nil
}
func (f *roleStore) Audit(_ context.Context, entries []AuditEntry) error {
	f.audit = entries
	return nil
}

func TestDepartmentDecidesHRRole(t *testing.T) {
	actor := &domain.User{ID: "actor", Role: domain.RoleHR}
	tests := []struct {
		name     string
		role     domain.Role
		from     *domain.Department
		to       *domain.Department
		hrCount  int
		wantRole domain.Role // "" = role untouched
		wantCode string
	}{
		{name: "employee moved into Human Resources becomes HR", role: domain.RoleEmployee, from: engineering, to: humanRes, hrCount: 1, wantRole: domain.RoleHR},
		{name: "employee without a department moved into HR becomes HR", role: domain.RoleEmployee, to: humanRes, hrCount: 1, wantRole: domain.RoleHR},
		{name: "HR moved out of Human Resources becomes an employee", role: domain.RoleHR, from: humanRes, to: finance, hrCount: 2, wantRole: domain.RoleEmployee},
		{name: "the last HR cannot leave Human Resources", role: domain.RoleHR, from: humanRes, to: finance, hrCount: 1, wantCode: "LAST_HR"},
		{name: "HR outside the HR department keeps the role", role: domain.RoleHR, from: engineering, to: finance, hrCount: 1},
		{name: "employee moved between other departments stays an employee", role: domain.RoleEmployee, from: engineering, to: finance, hrCount: 1},
		{name: "HR already in Human Resources, no move", role: domain.RoleHR, from: humanRes, to: humanRes, hrCount: 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fs := &roleStore{user: &domain.User{ID: "u1", FirstName: "Sumaiya", LastName: "Akter", Role: tt.role, Department: tt.from}, hrCount: tt.hrCount}
			svc := NewService(fs, nil, func() time.Time { return time.Date(2026, 9, 26, 0, 0, 0, 0, time.UTC) })
			err := svc.Update(context.Background(), actor, "u1", Change{DepartmentID: &tt.to.ID})

			if tt.wantCode != "" {
				de, ok := domain.AsError(err)
				if !ok || de.Code != tt.wantCode || de.Status != 409 {
					t.Fatalf("want 409 %s, got %v", tt.wantCode, err)
				}
				if fs.role != "" || fs.audit != nil {
					t.Fatalf("a refused change must write nothing: role %q, audit %v", fs.role, fs.audit)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if fs.role != tt.wantRole {
				t.Fatalf("role set to %q, want %q", fs.role, tt.wantRole)
			}
			var roleAudit *AuditEntry
			for i := range fs.audit {
				if fs.audit[i].Field == "role" {
					roleAudit = &fs.audit[i]
				}
			}
			switch {
			case tt.wantRole == "" && roleAudit != nil:
				t.Fatalf("unexpected role audit %+v", roleAudit)
			case tt.wantRole != "" && (roleAudit == nil || roleAudit.Old != string(tt.role) || roleAudit.New != string(tt.wantRole)):
				t.Fatalf("want a role audit %s → %s, got %+v", tt.role, tt.wantRole, roleAudit)
			}
		})
	}
}

func TestIsHRDepartment(t *testing.T) {
	for name, want := range map[string]bool{
		"Human Resources": true, " human resources ": true, "HR": true, "hr": true,
		"Engineering": false, "HR Tech": false, "": false,
	} {
		if got := domain.IsHRDepartment(name); got != want {
			t.Errorf("IsHRDepartment(%q) = %v, want %v", name, got, want)
		}
	}
}
