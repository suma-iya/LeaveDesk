package leave

import (
	"context"
	"testing"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
)

// memStore is an in-memory Store: enough to test Create and Update end to end.
type memStore struct {
	Store
	requests map[int64]*Request
	nextID   int64
}

func (m *memStore) InUserLock(_ context.Context, _ string, fn func(Store) error) error { return fn(m) }
func (m *memStore) RequestByID(_ context.Context, id int64) (*Request, error) {
	if r, ok := m.requests[id]; ok {
		return r, nil
	}
	return nil, domain.ErrNotFound
}
func (m *memStore) ActiveRequests(_ context.Context, userID string) ([]Request, error) {
	var out []Request
	for _, r := range m.requests {
		if r.UserID == userID && (r.Status == Pending || r.Status == Approved) {
			out = append(out, *r)
		}
	}
	return out, nil
}
func (m *memStore) Usage(_ context.Context, ids []string, year int) (map[string]Usage, error) {
	out := map[string]Usage{}
	for _, r := range m.requests {
		if r.Year() != year {
			continue
		}
		u := out[r.UserID]
		if u == nil {
			u = Usage{}
		}
		e := u[r.Type]
		switch r.Status {
		case Approved:
			e.Used += r.WorkingDays
		case Pending:
			e.Pending += r.WorkingDays
		}
		u[r.Type] = e
		out[r.UserID] = u
	}
	return out, nil
}
func (m *memStore) LimitOverrides(context.Context, []string, int) (map[string]map[Type]int, error) {
	return nil, nil
}
func (m *memStore) InsertRequest(_ context.Context, userID string, d Draft, days int) (int64, error) {
	m.nextID++
	m.requests[m.nextID] = &Request{ID: m.nextID, UserID: userID, Type: d.Type, Start: *d.StartDate, End: *d.EndDate, WorkingDays: days, Status: Pending}
	return m.nextID, nil
}
func (m *memStore) UpdatePendingRequest(_ context.Context, id int64, d Draft, days int) (bool, error) {
	r := m.requests[id]
	r.Type, r.Start, r.End, r.WorkingDays = d.Type, *d.StartDate, *d.EndDate, days
	return true, nil
}

func TestCreateAndEditUseTheBalance(t *testing.T) {
	st := &memStore{requests: map[int64]*Request{}, nextID: 1999}
	svc := NewService(st, Policy{Defaults: map[Type]int{Annual: 16, Casual: 3, Sick: 3}}, time.Now)
	u := &domain.User{ID: "nusrat", Role: domain.RoleEmployee, Status: domain.StatusActive}
	ctx := context.Background()

	// 3 casual days is the whole allowance.
	r, err := svc.Create(ctx, u, Draft{Type: Casual, StartDate: dp("2026-10-18"), EndDate: dp("2026-10-20")})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	// A 4th casual day is refused…
	if _, err := svc.Create(ctx, u, Draft{Type: Casual, StartDate: dp("2026-11-01"), EndDate: dp("2026-11-01")}); err == nil {
		t.Fatal("expected not enough casual leave")
	}
	// …but editing the same request to other 3 days works: its own days are given back.
	if _, err := svc.Update(ctx, u, r.ID, Draft{Type: Casual, StartDate: dp("2026-10-19"), EndDate: dp("2026-10-21")}); err != nil {
		t.Fatalf("edit should not overlap itself or double-count: %v", err)
	}
}
