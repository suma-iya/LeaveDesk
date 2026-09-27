package leave

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
)

// pathStore is an in-memory Store that records every write, for the
// service paths memStore does not cover.
type pathStore struct {
	Store
	reqs      map[int64]*Request
	overrides map[string]map[Type]int
	nextID    int64

	lookupErr    error
	statusErr    error
	stale        bool // SetStatus/UpdatePendingRequest find the row already decided
	attachErr    error
	attachChecks []string

	inserted   []Draft
	updated    []Draft
	statusCall *struct {
		id       int64
		from, to Status
		decider  *string
		note     *string
	}
	listed    *Filter
	teammates []Request
}

func newPathStore(reqs ...Request) *pathStore {
	st := &pathStore{reqs: map[int64]*Request{}, nextID: 100}
	for i := range reqs {
		r := reqs[i]
		st.reqs[r.ID] = &r
	}
	return st
}

func (m *pathStore) InUserLock(_ context.Context, _ string, fn func(Store) error) error { return fn(m) }
func (m *pathStore) RequestByID(_ context.Context, id int64) (*Request, error) {
	if m.lookupErr != nil {
		return nil, m.lookupErr
	}
	if r, ok := m.reqs[id]; ok {
		cp := *r
		return &cp, nil
	}
	return nil, fmt.Errorf("request by id: %w", domain.ErrNotFound)
}
func (m *pathStore) ActiveRequests(_ context.Context, userID string) ([]Request, error) {
	var out []Request
	for _, r := range m.reqs {
		if r.UserID == userID && (r.Status == Pending || r.Status == Approved) {
			out = append(out, *r)
		}
	}
	return out, nil
}
func (m *pathStore) Usage(_ context.Context, _ []string, year int) (map[string]Usage, error) {
	out := map[string]Usage{}
	for _, r := range m.reqs {
		if r.Year() != year || (r.Status != Pending && r.Status != Approved) {
			continue
		}
		if out[r.UserID] == nil {
			out[r.UserID] = Usage{}
		}
		e := out[r.UserID][r.Type]
		if r.Status == Approved {
			e.Used += r.WorkingDays
		} else {
			e.Pending += r.WorkingDays
		}
		out[r.UserID][r.Type] = e
	}
	return out, nil
}
func (m *pathStore) LimitOverrides(context.Context, []string, int) (map[string]map[Type]int, error) {
	return m.overrides, nil
}
func (m *pathStore) AttachmentOwnedBy(_ context.Context, fileID, _ string) error {
	m.attachChecks = append(m.attachChecks, fileID)
	return m.attachErr
}
func (m *pathStore) InsertRequest(_ context.Context, userID string, d Draft, days int) (int64, error) {
	m.inserted = append(m.inserted, d)
	m.nextID++
	m.reqs[m.nextID] = &Request{ID: m.nextID, UserID: userID, Type: d.Type, Start: *d.StartDate, End: *d.EndDate,
		WorkingDays: days, Reason: d.Reason, AttachmentID: d.AttachmentFileID, Status: Pending}
	return m.nextID, nil
}
func (m *pathStore) UpdatePendingRequest(_ context.Context, id int64, d Draft, days int) (bool, error) {
	m.updated = append(m.updated, d)
	if m.stale {
		return false, nil
	}
	r := m.reqs[id]
	r.Type, r.Start, r.End, r.WorkingDays, r.Reason = d.Type, *d.StartDate, *d.EndDate, days, d.Reason
	return true, nil
}
func (m *pathStore) SetStatus(_ context.Context, id int64, from, to Status, decider, note *string) (bool, error) {
	m.statusCall = &struct {
		id       int64
		from, to Status
		decider  *string
		note     *string
	}{id, from, to, decider, note}
	if m.statusErr != nil {
		return false, m.statusErr
	}
	if m.stale || m.reqs[id].Status != from {
		return false, nil
	}
	m.reqs[id].Status = to
	return true, nil
}
func (m *pathStore) ListRequests(_ context.Context, f Filter) ([]Request, int, error) {
	m.listed = &f
	return nil, 0, nil
}
func (m *pathStore) TeammatesAway(context.Context, *Request) ([]Request, error) {
	return m.teammates, nil
}

var (
	pathPolicy = Policy{Defaults: map[Type]int{Annual: 16, Casual: 3, Sick: 3}}
	emp        = &domain.User{ID: "emp-1", Role: domain.RoleEmployee}
	emp2       = &domain.User{ID: "emp-2", Role: domain.RoleEmployee}
	hrUser     = &domain.User{ID: "hr-1", Role: domain.RoleHR}
)

func pathService(st *pathStore) *Service { return NewService(st, pathPolicy, time.Now) }

// wantDomainErr fails unless err is a *domain.Error with the status and code.
func wantDomainErr(t *testing.T, err error, status int, code string) {
	t.Helper()
	de, ok := domain.AsError(err)
	if !ok || de.Status != status || de.Code != code {
		t.Fatalf("want %d %s, got %v", status, code, err)
	}
}

func pendingReq(id int64, user string) Request {
	return Request{ID: id, UserID: user, Type: Annual, Start: *dp("2026-10-04"), End: *dp("2026-10-05"), WorkingDays: 2, Status: Pending}
}

func TestServiceGet(t *testing.T) {
	st := newPathStore(pendingReq(1, "emp-1"))
	svc := pathService(st)
	tests := []struct {
		name   string
		viewer *domain.User
		id     int64
		wantOK bool
	}{
		{"owner", emp, 1, true},
		{"any HR", hrUser, 1, true},
		{"another employee gets a 404, not a 403", emp2, 1, false},
		{"unknown id", hrUser, 999, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r, err := svc.Get(context.Background(), tt.viewer, tt.id)
			if !tt.wantOK {
				wantDomainErr(t, err, 404, "NOT_FOUND")
				return
			}
			if err != nil || r.ID != tt.id {
				t.Fatalf("got %+v, %v", r, err)
			}
		})
	}

	t.Run("store failure passes through", func(t *testing.T) {
		boom := errors.New("db down")
		st := newPathStore()
		st.lookupErr = boom
		if _, err := pathService(st).Get(context.Background(), hrUser, 1); !errors.Is(err, boom) {
			t.Fatalf("want the store error, got %v", err)
		}
	})
}

func TestServiceList(t *testing.T) {
	tests := []struct {
		name     string
		user     *domain.User
		scope    string
		filter   Filter
		want     Filter // what reaches the store
		wantCode string
		wantStat int
	}{
		{name: "default scope is mine", user: emp, filter: Filter{Page: 2, PageSize: 10},
			want: Filter{UserID: "emp-1", Page: 2, PageSize: 10}},
		{name: "mine for HR is still their own", user: hrUser, scope: "mine", filter: Filter{UserID: "emp-1"},
			want: Filter{UserID: "hr-1", Page: 1, PageSize: 1}},
		{name: "all for HR", user: hrUser, scope: "all", filter: Filter{Statuses: []Status{Pending, Approved}, Type: Sick, Query: "  fever  ", PageSize: 500},
			want: Filter{Statuses: []Status{Pending, Approved}, Type: Sick, Query: "fever", Page: 1, PageSize: 100}},
		{name: "all for an employee", user: emp, scope: "all", wantCode: "FORBIDDEN", wantStat: 403},
		{name: "unknown scope", user: hrUser, scope: "team", wantCode: "VALIDATION", wantStat: 400},
		{name: "unknown status", user: emp, filter: Filter{Statuses: []Status{"approved", "archived"}}, wantCode: "VALIDATION", wantStat: 400},
		{name: "unknown type", user: emp, filter: Filter{Type: "holiday"}, wantCode: "VALIDATION", wantStat: 400},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := newPathStore()
			_, _, err := pathService(st).List(context.Background(), tt.user, tt.scope, tt.filter)
			if tt.wantCode != "" {
				wantDomainErr(t, err, tt.wantStat, tt.wantCode)
				if st.listed != nil {
					t.Fatal("a refused listing must not query the store")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(*st.listed, tt.want) {
				t.Fatalf("store got %+v, want %+v", *st.listed, tt.want)
			}
		})
	}
}

func TestServiceCancel(t *testing.T) {
	approved := pendingReq(2, "emp-1")
	approved.Status = Approved
	tests := []struct {
		name     string
		user     *domain.User
		id       int64
		stale    bool
		wantCode string
		wantStat int
	}{
		{name: "owner cancels a pending request", user: emp, id: 1},
		{name: "another employee cannot see it", user: emp2, id: 1, wantCode: "NOT_FOUND", wantStat: 404},
		{name: "HR cannot cancel someone else's", user: hrUser, id: 1, wantCode: "FORBIDDEN", wantStat: 403},
		{name: "approved cannot be cancelled", user: emp, id: 2, wantCode: "NOT_PENDING", wantStat: 409},
		{name: "decided in the meantime", user: emp, id: 1, stale: true, wantCode: "NOT_PENDING", wantStat: 409},
		{name: "unknown id", user: emp, id: 404, wantCode: "NOT_FOUND", wantStat: 404},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := newPathStore(pendingReq(1, "emp-1"), approved)
			st.stale = tt.stale
			r, err := pathService(st).Cancel(context.Background(), tt.user, tt.id)
			if tt.wantCode != "" {
				wantDomainErr(t, err, tt.wantStat, tt.wantCode)
				if !tt.stale && st.statusCall != nil {
					t.Fatal("a refused cancel must not reach SetStatus")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			c := st.statusCall
			if c.id != 1 || c.from != Pending || c.to != Cancelled || c.decider != nil || c.note != nil {
				t.Fatalf("unexpected SetStatus call %+v", c)
			}
			if r.Status != Cancelled {
				t.Fatalf("returned status %s, want cancelled", r.Status)
			}
		})
	}

	t.Run("store failure passes through", func(t *testing.T) {
		boom := errors.New("db down")
		st := newPathStore(pendingReq(1, "emp-1"))
		st.statusErr = boom
		if _, err := pathService(st).Cancel(context.Background(), emp, 1); !errors.Is(err, boom) {
			t.Fatalf("want the store error, got %v", err)
		}
	})
}

func TestServiceDecide(t *testing.T) {
	own := pendingReq(3, "hr-1")
	approved := pendingReq(2, "emp-1")
	approved.Status = Approved
	tests := []struct {
		name     string
		decider  *domain.User
		id       int64
		decision Decision
		stale    bool
		wantNote *string
		wantCode string
		wantStat int
	}{
		{name: "approve with a trimmed note", decider: hrUser, id: 1, decision: Decision{Status: Approved, Note: "  Enjoy!  "}, wantNote: ptrS("Enjoy!")},
		{name: "reject without a note stores NULL", decider: hrUser, id: 1, decision: Decision{Status: Rejected, Note: "   "}},
		{name: "note of exactly 1000 characters", decider: hrUser, id: 1, decision: Decision{Status: Rejected, Note: strings.Repeat("ন", 1000)},
			wantNote: ptrS(strings.Repeat("ন", 1000))},
		{name: "note over 1000 characters", decider: hrUser, id: 1, decision: Decision{Status: Rejected, Note: strings.Repeat("n", 1001)}, wantCode: "VALIDATION", wantStat: 400},
		{name: "pending is not a decision", decider: hrUser, id: 1, decision: Decision{Status: Pending}, wantCode: "VALIDATION", wantStat: 400},
		{name: "cancelled is not a decision", decider: hrUser, id: 1, decision: Decision{Status: Cancelled}, wantCode: "VALIDATION", wantStat: 400},
		{name: "empty status", decider: hrUser, id: 1, decision: Decision{}, wantCode: "VALIDATION", wantStat: 400},
		{name: "HR cannot decide their own", decider: hrUser, id: 3, decision: Decision{Status: Approved}, wantCode: "SELF_APPROVAL", wantStat: 403},
		{name: "already decided", decider: hrUser, id: 2, decision: Decision{Status: Rejected}, wantCode: "NOT_PENDING", wantStat: 409},
		{name: "another HR won the race", decider: hrUser, id: 1, decision: Decision{Status: Approved}, stale: true, wantCode: "NOT_PENDING", wantStat: 409},
		{name: "employee deciding their own", decider: emp, id: 1, decision: Decision{Status: Approved}, wantCode: "FORBIDDEN", wantStat: 403},
		{name: "employee deciding someone else's cannot see it", decider: emp2, id: 1, decision: Decision{Status: Approved}, wantCode: "NOT_FOUND", wantStat: 404},
		{name: "unknown id", decider: hrUser, id: 999, decision: Decision{Status: Approved}, wantCode: "NOT_FOUND", wantStat: 404},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := newPathStore(pendingReq(1, "emp-1"), approved, own)
			st.stale = tt.stale
			r, err := pathService(st).Decide(context.Background(), tt.decider, tt.id, tt.decision)
			if tt.wantCode != "" {
				wantDomainErr(t, err, tt.wantStat, tt.wantCode)
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			c := st.statusCall
			if c.from != Pending || c.to != tt.decision.Status || c.decider == nil || *c.decider != "hr-1" {
				t.Fatalf("unexpected SetStatus call %+v", c)
			}
			if !reflect.DeepEqual(c.note, tt.wantNote) {
				t.Fatalf("note %v, want %v", c.note, tt.wantNote)
			}
			if r.Status != tt.decision.Status {
				t.Fatalf("returned %s, want %s", r.Status, tt.decision.Status)
			}
		})
	}
}

func ptrS(s string) *string { return &s }

func TestServiceCreatePaths(t *testing.T) {
	tests := []struct {
		name       string
		draft      Draft
		existing   []Request
		overrides  map[string]map[Type]int
		attachErr  error
		wantChecks []string
		wantDays   int
		wantCode   string
		wantStat   int
	}{
		{name: "reason is trimmed", draft: Draft{Type: Annual, StartDate: dp("2026-10-18"), EndDate: dp("2026-10-20"), Reason: "  family trip \n"}, wantDays: 3},
		{name: "own attachment is checked", draft: Draft{Type: Sick, StartDate: dp("2026-10-18"), EndDate: dp("2026-10-18"), AttachmentFileID: ptrS("f1")},
			wantChecks: []string{"f1"}, wantDays: 1},
		{name: "someone else's attachment", draft: Draft{Type: Sick, StartDate: dp("2026-10-18"), EndDate: dp("2026-10-18"), AttachmentFileID: ptrS("f2")},
			attachErr: domain.Invalid("That attachment was not found. Upload it again."), wantChecks: []string{"f2"}, wantCode: "VALIDATION", wantStat: 400},
		{name: "empty attachment id is not checked", draft: Draft{Type: Sick, StartDate: dp("2026-10-18"), EndDate: dp("2026-10-18"), AttachmentFileID: ptrS("")}, wantDays: 1},
		{name: "override raises the limit", draft: Draft{Type: Casual, StartDate: dp("2026-10-18"), EndDate: dp("2026-10-22")},
			overrides: map[string]map[Type]int{"emp-1": {Casual: 5}}, wantDays: 5},
		{name: "override lowers the limit", draft: Draft{Type: Annual, StartDate: dp("2026-10-18"), EndDate: dp("2026-10-20")},
			overrides: map[string]map[Type]int{"emp-1": {Annual: 2}}, wantCode: "INSUFFICIENT_BALANCE", wantStat: 400},
		{name: "overlaps an approved request", draft: Draft{Type: Annual, StartDate: dp("2026-10-05"), EndDate: dp("2026-10-06")},
			existing: []Request{{ID: 7, UserID: "emp-1", Type: Sick, Start: *dp("2026-10-06"), End: *dp("2026-10-06"), WorkingDays: 1, Status: Approved}},
			wantCode: "OVERLAP", wantStat: 409},
		{name: "a rejected request does not block the dates", draft: Draft{Type: Annual, StartDate: dp("2026-10-05"), EndDate: dp("2026-10-06")},
			existing: []Request{{ID: 7, UserID: "emp-1", Type: Annual, Start: *dp("2026-10-06"), End: *dp("2026-10-06"), WorkingDays: 1, Status: Rejected}}, wantDays: 2},
		{name: "someone else's leave does not block the dates", draft: Draft{Type: Annual, StartDate: dp("2026-10-05"), EndDate: dp("2026-10-06")},
			existing: []Request{{ID: 7, UserID: "emp-2", Type: Annual, Start: *dp("2026-10-06"), End: *dp("2026-10-06"), WorkingDays: 1, Status: Approved}}, wantDays: 2},
		{name: "balance counts the start date's year", draft: Draft{Type: Casual, StartDate: dp("2026-12-31"), EndDate: dp("2027-01-03")},
			existing: []Request{{ID: 7, UserID: "emp-1", Type: Casual, Start: *dp("2027-02-01"), End: *dp("2027-02-03"), WorkingDays: 3, Status: Approved}}, wantDays: 2}, // Thu 31 Dec + Sun 3 Jan
		{name: "invalid draft", draft: Draft{Type: Annual}, wantCode: "VALIDATION", wantStat: 400},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := newPathStore(tt.existing...)
			st.overrides, st.attachErr = tt.overrides, tt.attachErr
			r, err := pathService(st).Create(context.Background(), emp, tt.draft)
			if !reflect.DeepEqual(st.attachChecks, tt.wantChecks) {
				t.Fatalf("attachment checks %v, want %v", st.attachChecks, tt.wantChecks)
			}
			if tt.wantCode != "" {
				wantDomainErr(t, err, tt.wantStat, tt.wantCode)
				if len(st.inserted) != 0 {
					t.Fatal("a refused draft must not be inserted")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if r.WorkingDays != tt.wantDays || r.UserID != "emp-1" || r.Status != Pending {
				t.Fatalf("created %+v, want %d days", r, tt.wantDays)
			}
			if r.Reason != strings.TrimSpace(tt.draft.Reason) {
				t.Fatalf("reason %q was not trimmed", r.Reason)
			}
		})
	}
}

// An empty attachmentFileId means "no attachment": it is stored as NULL,
// never as "" (which the uuid column would refuse with a 500).
func TestServiceCreateEmptyAttachmentStoresNull(t *testing.T) {
	st := newPathStore()
	_, err := pathService(st).Create(context.Background(), emp, Draft{Type: Sick, StartDate: dp("2026-10-18"), EndDate: dp("2026-10-18"), AttachmentFileID: ptrS("")})
	if err != nil {
		t.Fatal(err)
	}
	if got := st.inserted[0].AttachmentFileID; got != nil {
		t.Fatalf("want a NULL attachment, got %q", *got)
	}
}

func TestServiceUpdatePaths(t *testing.T) {
	approved := pendingReq(2, "emp-1")
	approved.Status = Approved
	nextYear := Request{ID: 5, UserID: "emp-1", Type: Casual, Start: *dp("2027-01-10"), End: *dp("2027-01-10"), WorkingDays: 1, Status: Pending}
	fullCasual := Request{ID: 6, UserID: "emp-1", Type: Casual, Start: *dp("2026-11-01"), End: *dp("2026-11-03"), WorkingDays: 3, Status: Pending}

	tests := []struct {
		name     string
		user     *domain.User
		id       int64
		draft    Draft
		stale    bool
		wantCode string
		wantStat int
	}{
		{name: "owner edits a pending request", user: emp, id: 1, draft: Draft{Type: Annual, StartDate: dp("2026-10-11"), EndDate: dp("2026-10-12"), Reason: " moved "}},
		{name: "another employee cannot see it", user: emp2, id: 1, draft: Draft{Type: Annual, StartDate: dp("2026-10-11"), EndDate: dp("2026-10-12")}, wantCode: "NOT_FOUND", wantStat: 404},
		{name: "HR cannot edit someone else's", user: hrUser, id: 1, draft: Draft{Type: Annual, StartDate: dp("2026-10-11"), EndDate: dp("2026-10-12")}, wantCode: "FORBIDDEN", wantStat: 403},
		{name: "approved cannot be edited", user: emp, id: 2, draft: Draft{Type: Annual, StartDate: dp("2026-10-11"), EndDate: dp("2026-10-12")}, wantCode: "NOT_PENDING", wantStat: 409},
		{name: "decided while editing", user: emp, id: 1, stale: true, draft: Draft{Type: Annual, StartDate: dp("2026-10-11"), EndDate: dp("2026-10-12")}, wantCode: "NOT_PENDING", wantStat: 409},
		{name: "own days are refunded in the same year", user: emp, id: 6, draft: Draft{Type: Casual, StartDate: dp("2026-11-02"), EndDate: dp("2026-11-04")}},
		// Moving a 3-day 2026 request into 2027, where 1 casual day is already pending:
		// nothing is refunded in 2027, so only 2 are available.
		{name: "no refund when moving to another year", user: emp, id: 6, draft: Draft{Type: Casual, StartDate: dp("2027-02-01"), EndDate: dp("2027-02-03")},
			wantCode: "INSUFFICIENT_BALANCE", wantStat: 400},
		{name: "still cannot overlap your other requests", user: emp, id: 1, draft: Draft{Type: Annual, StartDate: dp("2026-10-04"), EndDate: dp("2026-10-04")},
			wantCode: "OVERLAP", wantStat: 409},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Request 1 is pending on 11–12 Oct after the edit; the approved one sits on 4–5 Oct.
			first := pendingReq(1, "emp-1")
			first.Start, first.End = *dp("2026-10-18"), *dp("2026-10-19")
			st := newPathStore(first, approved, nextYear, fullCasual)
			st.stale = tt.stale
			r, err := pathService(st).Update(context.Background(), tt.user, tt.id, tt.draft)
			if tt.wantCode != "" {
				wantDomainErr(t, err, tt.wantStat, tt.wantCode)
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if !r.Start.Equal(tt.draft.StartDate.Time) || r.Reason != strings.TrimSpace(tt.draft.Reason) {
				t.Fatalf("returned %+v", r)
			}
		})
	}
}

func TestServiceYearTotalsAndTeammates(t *testing.T) {
	st := newPathStore(
		Request{ID: 1, UserID: "a", Type: Annual, Start: *dp("2026-03-01"), End: *dp("2026-03-03"), WorkingDays: 3, Status: Approved},
		Request{ID: 2, UserID: "a", Type: Sick, Start: *dp("2026-04-01"), End: *dp("2026-04-01"), WorkingDays: 1, Status: Pending},
		Request{ID: 3, UserID: "b", Type: Casual, Start: *dp("2026-05-03"), End: *dp("2026-05-03"), WorkingDays: 1, Status: Approved},
	)
	st.overrides = map[string]map[Type]int{"b": {Casual: 10}}
	st.teammates = []Request{{ID: 9}}
	svc := pathService(st)
	ctx := context.Background()

	totals, err := svc.YearTotals(ctx, []string{"a", "b", "c"}, 2026)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]YearTotal{
		"a": {Used: 3, Pending: 1, Limit: 22},
		"b": {Used: 1, Pending: 0, Limit: 29},
		"c": {Limit: 22},
	}
	if !reflect.DeepEqual(totals, want) {
		t.Fatalf("got %+v, want %+v", totals, want)
	}

	away, err := svc.TeammatesAway(ctx, hrUser, 1)
	if err != nil || len(away) != 1 {
		t.Fatalf("got %v, %v", away, err)
	}
	if _, err := svc.TeammatesAway(ctx, hrUser, 999); err == nil {
		t.Fatal("want 404 for an unknown request")
	}
	if svc.Policy().Defaults[Annual] != 16 {
		t.Fatal("Policy() must return the configured policy")
	}
}

type fakeCalendar struct {
	from, to time.Time
	filter   CalendarFilter
	requests []Request
}

func (f *fakeCalendar) RequestsBetween(_ context.Context, from, to time.Time, cf CalendarFilter) ([]Request, error) {
	f.from, f.to, f.filter = from, to, cf
	return f.requests, nil
}

func TestServiceCalendar(t *testing.T) {
	svc := pathService(newPathStore())
	cs := &fakeCalendar{requests: []Request{{ID: 1, Start: *dp("2026-10-06"), End: *dp("2026-10-06"), Status: Approved}}}

	if _, err := svc.Calendar(context.Background(), cs, day("2026-10-01"), CalendarFilter{Type: "holiday"}); err == nil {
		t.Fatal("want a 400 for an unknown type")
	} else {
		wantDomainErr(t, err, 400, "VALIDATION")
	}

	days, err := svc.Calendar(context.Background(), cs, day("2026-10-15"), CalendarFilter{Type: Sick, DepartmentID: 2, IncludePending: true})
	if err != nil {
		t.Fatal(err)
	}
	if cs.from.Format(time.DateOnly) != "2026-09-27" || cs.to.Format(time.DateOnly) != "2026-10-31" || cs.filter.DepartmentID != 2 {
		t.Fatalf("queried %s – %s with %+v", cs.from, cs.to, cs.filter)
	}
	if len(days) != 35 {
		t.Fatalf("want 5 weeks, got %d days", len(days))
	}
}

func TestPastTenseAndLabels(t *testing.T) {
	for verb, want := range map[string]string{"cancel": "cancelled", "edit": "edited", "update": "updated"} {
		if got := pastTense(verb); got != want {
			t.Errorf("pastTense(%q) = %q, want %q", verb, got, want)
		}
	}
	for typ, want := range map[Type]string{Annual: "Annual", Casual: "Casual", Sick: "Sick", "other": "other"} {
		if got := typ.Label(); got != want {
			t.Errorf("%q.Label() = %q, want %q", typ, got, want)
		}
	}
	if p := NewPolicy(map[string]int{"annual": 20, "sick": 5}); p.Defaults[Annual] != 20 || p.Defaults[Casual] != 0 || p.Defaults[Sick] != 5 {
		t.Fatalf("NewPolicy: %+v", p.Defaults)
	}
	if Days(1) != "1 day" || Days(0) != "0 days" || Days(2) != "2 days" {
		t.Fatal("Days pluralisation")
	}
}
