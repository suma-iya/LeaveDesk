package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/suma-iya/employee-leave-tracker/backend/internal/model"
)

const maxReasonLength = 500

type LeaveService struct {
	leaves   LeaveStore
	users    UserStore
	location *time.Location
	now      func() time.Time // injectable so tests can freeze "today"
}

func NewLeaveService(leaves LeaveStore, users UserStore, location *time.Location, now func() time.Time) *LeaveService {
	return &LeaveService{leaves: leaves, users: users, location: location, now: now}
}

// Today is the current calendar day in the company's timezone.
func (s *LeaveService) Today() model.Date {
	return model.DateOf(s.now().In(s.location))
}

func (s *LeaveService) Timezone() string { return s.location.String() }

type ApplyLeaveInput struct {
	Type      model.LeaveType `json:"leave_type"`
	StartDate *model.Date     `json:"start_date"`
	EndDate   *model.Date     `json:"end_date"`
	Reason    string          `json:"reason"`
}

// Apply validates and stores a new PENDING leave request.
func (s *LeaveService) Apply(ctx context.Context, userID int64, in ApplyLeaveInput) (*model.Leave, error) {
	in.Reason = strings.TrimSpace(in.Reason)
	if err := s.validateApply(in); err != nil {
		return nil, err
	}

	overlap, err := s.leaves.HasOverlap(ctx, userID, *in.StartDate, *in.EndDate)
	if err != nil {
		return nil, err
	}
	if overlap {
		return nil, errOverlap
	}

	leave, err := s.leaves.Create(ctx, &model.Leave{
		UserID:    userID,
		Type:      in.Type,
		StartDate: *in.StartDate,
		EndDate:   *in.EndDate,
		Reason:    in.Reason,
	})
	// A concurrent request can slip past HasOverlap; the database's
	// leaves_no_overlap constraint then rejects it as a conflict.
	if errors.Is(err, model.ErrConflict) {
		return nil, errOverlap
	}
	return leave, err
}

var errOverlap = model.Conflict("you already have a pending or approved leave in these dates")

func (s *LeaveService) validateApply(in ApplyLeaveInput) error {
	switch {
	case !in.Type.Valid():
		return model.Invalid("leave_type must be one of ANNUAL, SICK, CASUAL, UNPAID")
	case in.StartDate == nil || in.EndDate == nil:
		return model.Invalid("start_date and end_date are required")
	case in.EndDate.Before(in.StartDate.Time):
		return model.Invalid("end_date cannot be before start_date")
	// Sick leave may be recorded after the fact; other types are planned.
	case in.Type != model.LeaveSick && in.StartDate.Before(s.Today().Time):
		return model.Invalid("start_date cannot be in the past")
	case in.Reason == "":
		return model.Invalid("reason is required")
	case len(in.Reason) > maxReasonLength:
		return model.Invalid(fmt.Sprintf("reason must be at most %d characters", maxReasonLength))
	}
	return nil
}

func (s *LeaveService) ListMine(ctx context.Context, userID int64) ([]model.Leave, error) {
	return s.leaves.List(ctx, model.LeaveFilter{UserID: userID}, s.Timezone())
}

func (s *LeaveService) MySummary(ctx context.Context, userID int64) (model.EmployeeSummary, error) {
	return summarise(ctx, s.leaves, userID, s.now().In(s.location).Year())
}

func (s *LeaveService) List(ctx context.Context, f model.LeaveFilter) ([]model.Leave, error) {
	if f.Status != "" && !f.Status.Valid() {
		return nil, model.Invalid("status must be PENDING, APPROVED or REJECTED")
	}
	return s.leaves.List(ctx, f, s.Timezone())
}

type ReviewInput struct {
	Status  model.LeaveStatus `json:"status"`
	Comment string            `json:"comment"`
}

// Review approves or rejects a PENDING leave.
func (s *LeaveService) Review(ctx context.Context, managerID, leaveID int64, in ReviewInput) (*model.Leave, error) {
	in.Comment = strings.TrimSpace(in.Comment)
	if in.Status != model.StatusApproved && in.Status != model.StatusRejected {
		return nil, model.Invalid("status must be APPROVED or REJECTED")
	}
	if len(in.Comment) > maxReasonLength {
		return nil, model.Invalid(fmt.Sprintf("comment must be at most %d characters", maxReasonLength))
	}

	updated, err := s.leaves.Review(ctx, leaveID, in.Status, in.Comment, managerID)
	if err != nil {
		return nil, err
	}
	if !updated {
		// Either the id does not exist (GetByID returns ErrNotFound)
		// or it has already been reviewed.
		if _, err := s.leaves.GetByID(ctx, leaveID); err != nil {
			return nil, err
		}
		return nil, model.Conflict("only PENDING leaves can be reviewed")
	}
	return s.leaves.GetByID(ctx, leaveID)
}

// Cancel lets an employee withdraw their own request while it is PENDING.
func (s *LeaveService) Cancel(ctx context.Context, userID, leaveID int64) error {
	deleted, err := s.leaves.DeletePending(ctx, leaveID, userID)
	if err != nil {
		return err
	}
	if deleted {
		return nil
	}
	leave, err := s.leaves.GetByID(ctx, leaveID)
	if err != nil {
		return err
	}
	if leave.UserID != userID {
		return model.Forbidden("this is not your leave request")
	}
	return model.Conflict("only PENDING leaves can be cancelled")
}

// Dashboard gathers the manager's headline numbers for one day.
func (s *LeaveService) Dashboard(ctx context.Context, day model.Date) (*model.DashboardStats, error) {
	counts, err := s.leaves.StatusCounts(ctx, 0)
	if err != nil {
		return nil, err
	}
	requests, err := s.leaves.CountCreatedOn(ctx, day, s.Timezone())
	if err != nil {
		return nil, err
	}
	onLeave, err := s.leaves.CountOnLeave(ctx, day)
	if err != nil {
		return nil, err
	}
	employees, err := s.users.CountByRole(ctx, model.RoleEmployee)
	if err != nil {
		return nil, err
	}
	return &model.DashboardStats{
		StatusCounts:   counts,
		Date:           day,
		RequestsOnDate: requests,
		OnLeaveOnDate:  onLeave,
		TotalEmployees: employees,
	}, nil
}
