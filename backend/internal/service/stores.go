// Package service holds the business rules. It depends on these small
// interfaces rather than on the concrete repositories, which keeps the
// rules unit-testable with in-memory fakes.
package service

import (
	"context"

	"github.com/suma-iya/employee-leave-tracker/backend/internal/model"
)

type UserStore interface {
	Create(ctx context.Context, u *model.User) error
	GetByID(ctx context.Context, id int64) (*model.User, error)
	GetByEmail(ctx context.Context, email string) (*model.User, error)
	GetByGoogleID(ctx context.Context, googleID string) (*model.User, error)
	LinkGoogleID(ctx context.Context, userID int64, googleID string) error
	ListEmployees(ctx context.Context) ([]model.EmployeeRow, error)
	Update(ctx context.Context, u *model.User) error
	Delete(ctx context.Context, id int64) error
	CountByRole(ctx context.Context, role model.Role) (int, error)
}

type LeaveStore interface {
	Create(ctx context.Context, l *model.Leave) (*model.Leave, error)
	GetByID(ctx context.Context, id int64) (*model.Leave, error)
	List(ctx context.Context, f model.LeaveFilter, timezone string) ([]model.Leave, error)
	HasOverlap(ctx context.Context, userID int64, start, end model.Date) (bool, error)
	Review(ctx context.Context, id int64, status model.LeaveStatus, comment string, reviewerID int64) (bool, error)
	DeletePending(ctx context.Context, id, userID int64) (bool, error)
	StatusCounts(ctx context.Context, userID int64) (model.StatusCounts, error)
	CountCreatedOn(ctx context.Context, day model.Date, timezone string) (int, error)
	CountOnLeave(ctx context.Context, day model.Date) (int, error)
	ApprovedDaysInYear(ctx context.Context, userID int64, year int) (int, error)
}
