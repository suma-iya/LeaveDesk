package service

import (
	"context"
	"errors"
	"net/mail"
	"strings"
	"time"

	"github.com/suma-iya/employee-leave-tracker/backend/internal/auth"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/model"
)

type EmployeeService struct {
	users    UserStore
	leaves   LeaveStore
	location *time.Location
	now      func() time.Time
}

func NewEmployeeService(users UserStore, leaves LeaveStore, location *time.Location, now func() time.Time) *EmployeeService {
	return &EmployeeService{users: users, leaves: leaves, location: location, now: now}
}

// EmployeeInput is the body for create/update. Password is optional:
// without one the employee can only sign in with Google.
type EmployeeInput struct {
	Name       string `json:"name"`
	Email      string `json:"email"`
	Department string `json:"department"`
	Password   string `json:"password"`
}

func (in *EmployeeInput) normalise() error {
	in.Name = strings.TrimSpace(in.Name)
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.Department = strings.TrimSpace(in.Department)

	if in.Name == "" {
		return model.Invalid("name is required")
	}
	if _, err := mail.ParseAddress(in.Email); err != nil {
		return model.Invalid("a valid email is required")
	}
	if in.Password != "" && len(in.Password) < 8 {
		return model.Invalid("password must be at least 8 characters")
	}
	return nil
}

func (s *EmployeeService) List(ctx context.Context) ([]model.EmployeeRow, error) {
	return s.users.ListEmployees(ctx)
}

func (s *EmployeeService) Create(ctx context.Context, in EmployeeInput) (*model.User, error) {
	if err := in.normalise(); err != nil {
		return nil, err
	}
	user := &model.User{Name: in.Name, Email: in.Email, Department: in.Department, Role: model.RoleEmployee}
	if in.Password != "" {
		hash, err := auth.HashPassword(in.Password)
		if err != nil {
			return nil, err
		}
		user.PasswordHash = &hash
	}
	if err := s.users.Create(ctx, user); err != nil {
		if errors.Is(err, model.ErrConflict) {
			return nil, model.Conflict("email already in use")
		}
		return nil, err
	}
	return user, nil
}

// EmployeeDetail is the manager's view of one employee.
type EmployeeDetail struct {
	Employee *model.User           `json:"employee"`
	Summary  model.EmployeeSummary `json:"summary"`
	Leaves   []model.Leave         `json:"leaves"`
}

func (s *EmployeeService) Get(ctx context.Context, id int64) (*EmployeeDetail, error) {
	user, err := s.getEmployee(ctx, id)
	if err != nil {
		return nil, err
	}
	leaves, err := s.leaves.List(ctx, model.LeaveFilter{UserID: id}, s.location.String())
	if err != nil {
		return nil, err
	}
	summary, err := summarise(ctx, s.leaves, id, s.now().In(s.location).Year())
	if err != nil {
		return nil, err
	}
	return &EmployeeDetail{Employee: user, Summary: summary, Leaves: leaves}, nil
}

func (s *EmployeeService) Update(ctx context.Context, id int64, in EmployeeInput) (*model.User, error) {
	if err := in.normalise(); err != nil {
		return nil, err
	}
	user, err := s.getEmployee(ctx, id)
	if err != nil {
		return nil, err
	}
	user.Name, user.Email, user.Department = in.Name, in.Email, in.Department
	if in.Password != "" {
		hash, err := auth.HashPassword(in.Password)
		if err != nil {
			return nil, err
		}
		user.PasswordHash = &hash
	}
	if err := s.users.Update(ctx, user); err != nil {
		if errors.Is(err, model.ErrConflict) {
			return nil, model.Conflict("email already in use")
		}
		return nil, err
	}
	return user, nil
}

func (s *EmployeeService) Delete(ctx context.Context, id int64) error {
	if _, err := s.getEmployee(ctx, id); err != nil {
		return err
	}
	return s.users.Delete(ctx, id)
}

// getEmployee loads a user and treats managers as "not found", so this
// API can never be used to edit or delete a manager account.
func (s *EmployeeService) getEmployee(ctx context.Context, id int64) (*model.User, error) {
	user, err := s.users.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if user.Role != model.RoleEmployee {
		return nil, model.NotFound("employee not found")
	}
	return user, nil
}

func summarise(ctx context.Context, leaves LeaveStore, userID int64, year int) (model.EmployeeSummary, error) {
	counts, err := leaves.StatusCounts(ctx, userID)
	if err != nil {
		return model.EmployeeSummary{}, err
	}
	days, err := leaves.ApprovedDaysInYear(ctx, userID, year)
	if err != nil {
		return model.EmployeeSummary{}, err
	}
	return model.EmployeeSummary{StatusCounts: counts, ApprovedDaysThisYear: days}, nil
}
