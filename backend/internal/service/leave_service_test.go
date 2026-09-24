package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/suma-iya/employee-leave-tracker/backend/internal/model"
)

// fakeLeaveStore embeds the interface so it only needs to implement the
// methods a test actually calls; anything else would panic loudly.
type fakeLeaveStore struct {
	LeaveStore
	overlap  bool
	raceLost bool // Create fails like the DB exclusion constraint would
	created  *model.Leave
	leaves   map[int64]*model.Leave
	reviewed bool
}

func (f *fakeLeaveStore) HasOverlap(context.Context, int64, model.Date, model.Date) (bool, error) {
	return f.overlap, nil
}

func (f *fakeLeaveStore) Create(_ context.Context, l *model.Leave) (*model.Leave, error) {
	if f.raceLost {
		return nil, model.ErrConflict
	}
	l.ID, l.Status = 1, model.StatusPending
	f.created = l
	return l, nil
}

func (f *fakeLeaveStore) GetByID(_ context.Context, id int64) (*model.Leave, error) {
	if l, ok := f.leaves[id]; ok {
		return l, nil
	}
	return nil, model.ErrNotFound
}

func (f *fakeLeaveStore) Review(_ context.Context, id int64, status model.LeaveStatus, comment string, _ int64) (bool, error) {
	l, ok := f.leaves[id]
	if !ok || l.Status != model.StatusPending {
		return false, nil
	}
	l.Status, l.ManagerComment = status, comment
	f.reviewed = true
	return true, nil
}

func (f *fakeLeaveStore) DeletePending(_ context.Context, id, userID int64) (bool, error) {
	l, ok := f.leaves[id]
	if !ok || l.UserID != userID || l.Status != model.StatusPending {
		return false, nil
	}
	delete(f.leaves, id)
	return true, nil
}

// "Today" is frozen at 2026-09-24 in Dhaka for every test.
func newTestLeaveService(store *fakeLeaveStore) *LeaveService {
	dhaka, _ := time.LoadLocation("Asia/Dhaka")
	now := func() time.Time { return time.Date(2026, 9, 24, 10, 0, 0, 0, dhaka) }
	return NewLeaveService(store, nil, dhaka, now)
}

func date(s string) *model.Date {
	d, err := model.ParseDate(s)
	if err != nil {
		panic(err)
	}
	return &d
}

func TestLeaveService_Apply(t *testing.T) {
	tests := []struct {
		name     string
		input    ApplyLeaveInput
		overlap  bool
		raceLost bool
		wantErr  error // nil means success
	}{
		{
			name:  "valid annual leave",
			input: ApplyLeaveInput{Type: model.LeaveAnnual, StartDate: date("2026-10-01"), EndDate: date("2026-10-03"), Reason: "Trip"},
		},
		{
			name:  "single day starting today",
			input: ApplyLeaveInput{Type: model.LeaveCasual, StartDate: date("2026-09-24"), EndDate: date("2026-09-24"), Reason: "Errand"},
		},
		{
			name:  "sick leave may be in the past",
			input: ApplyLeaveInput{Type: model.LeaveSick, StartDate: date("2026-09-20"), EndDate: date("2026-09-21"), Reason: "Flu"},
		},
		{
			name:    "unknown leave type",
			input:   ApplyLeaveInput{Type: "HOLIDAY", StartDate: date("2026-10-01"), EndDate: date("2026-10-01"), Reason: "x"},
			wantErr: model.ErrInvalid,
		},
		{
			name:    "missing dates",
			input:   ApplyLeaveInput{Type: model.LeaveAnnual, Reason: "x"},
			wantErr: model.ErrInvalid,
		},
		{
			name:    "end before start",
			input:   ApplyLeaveInput{Type: model.LeaveAnnual, StartDate: date("2026-10-05"), EndDate: date("2026-10-01"), Reason: "x"},
			wantErr: model.ErrInvalid,
		},
		{
			name:    "annual leave in the past",
			input:   ApplyLeaveInput{Type: model.LeaveAnnual, StartDate: date("2026-09-23"), EndDate: date("2026-09-25"), Reason: "x"},
			wantErr: model.ErrInvalid,
		},
		{
			name:    "blank reason",
			input:   ApplyLeaveInput{Type: model.LeaveAnnual, StartDate: date("2026-10-01"), EndDate: date("2026-10-01"), Reason: "   "},
			wantErr: model.ErrInvalid,
		},
		{
			name:    "overlaps an existing leave",
			input:   ApplyLeaveInput{Type: model.LeaveAnnual, StartDate: date("2026-10-01"), EndDate: date("2026-10-02"), Reason: "x"},
			overlap: true,
			wantErr: model.ErrConflict,
		},
		{
			name:     "concurrent overlap caught by the database",
			input:    ApplyLeaveInput{Type: model.LeaveAnnual, StartDate: date("2026-10-01"), EndDate: date("2026-10-02"), Reason: "x"},
			raceLost: true,
			wantErr:  model.ErrConflict,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := &fakeLeaveStore{overlap: tt.overlap, raceLost: tt.raceLost}
			leave, err := newTestLeaveService(store).Apply(context.Background(), 7, tt.input)

			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("want error %v, got %v", tt.wantErr, err)
				}
				if store.created != nil {
					t.Fatal("leave must not be stored when validation fails")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if leave.UserID != 7 || leave.Status != model.StatusPending {
				t.Fatalf("want pending leave for user 7, got %+v", leave)
			}
		})
	}
}

func TestLeaveService_Review(t *testing.T) {
	tests := []struct {
		name       string
		leaveID    int64
		initial    model.LeaveStatus
		input      ReviewInput
		wantErr    error
		wantStatus model.LeaveStatus
	}{
		{name: "approve pending", leaveID: 1, initial: model.StatusPending,
			input: ReviewInput{Status: model.StatusApproved}, wantStatus: model.StatusApproved},
		{name: "reject pending with comment", leaveID: 1, initial: model.StatusPending,
			input: ReviewInput{Status: model.StatusRejected, Comment: "Busy week"}, wantStatus: model.StatusRejected},
		{name: "cannot set back to pending", leaveID: 1, initial: model.StatusPending,
			input: ReviewInput{Status: model.StatusPending}, wantErr: model.ErrInvalid},
		{name: "already approved", leaveID: 1, initial: model.StatusApproved,
			input: ReviewInput{Status: model.StatusRejected}, wantErr: model.ErrConflict},
		{name: "unknown leave", leaveID: 99, initial: model.StatusPending,
			input: ReviewInput{Status: model.StatusApproved}, wantErr: model.ErrNotFound},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := &fakeLeaveStore{leaves: map[int64]*model.Leave{1: {ID: 1, UserID: 7, Status: tt.initial}}}
			leave, err := newTestLeaveService(store).Review(context.Background(), 2, tt.leaveID, tt.input)

			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("want error %v, got %v", tt.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if leave.Status != tt.wantStatus {
				t.Fatalf("want status %s, got %s", tt.wantStatus, leave.Status)
			}
		})
	}
}

func TestLeaveService_Cancel(t *testing.T) {
	tests := []struct {
		name    string
		userID  int64
		status  model.LeaveStatus
		wantErr error
	}{
		{name: "owner cancels pending", userID: 7, status: model.StatusPending},
		{name: "someone else's leave", userID: 8, status: model.StatusPending, wantErr: model.ErrForbidden},
		{name: "already approved", userID: 7, status: model.StatusApproved, wantErr: model.ErrConflict},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := &fakeLeaveStore{leaves: map[int64]*model.Leave{1: {ID: 1, UserID: 7, Status: tt.status}}}
			err := newTestLeaveService(store).Cancel(context.Background(), tt.userID, 1)
			if !errors.Is(err, tt.wantErr) && !(tt.wantErr == nil && err == nil) {
				t.Fatalf("want error %v, got %v", tt.wantErr, err)
			}
		})
	}
}
