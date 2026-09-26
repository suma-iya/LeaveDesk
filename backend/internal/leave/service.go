package leave

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
)

// Filter narrows a request listing. Zero values mean "any".
type Filter struct {
	UserID       string // only this person's requests
	Statuses     []Status
	Type         Type
	DepartmentID int
	Query        string // employee name, reason or HR note
	From, To     *domain.Date
	Year         int
	Page         int
	PageSize     int
}

type Store interface {
	RequestByID(ctx context.Context, id int64) (*Request, error)
	ListRequests(ctx context.Context, f Filter) ([]Request, int, error)
	// ActiveRequests: the user's pending and approved requests.
	ActiveRequests(ctx context.Context, userID string) ([]Request, error)
	Usage(ctx context.Context, userIDs []string, year int) (map[string]Usage, error)
	LimitOverrides(ctx context.Context, userIDs []string, year int) (map[string]map[Type]int, error)
	InsertRequest(ctx context.Context, userID string, d Draft, workingDays int) (int64, error)
	UpdatePendingRequest(ctx context.Context, id int64, d Draft, workingDays int) (bool, error)
	// SetStatus changes status only if it is still `from` (atomic check).
	SetStatus(ctx context.Context, id int64, from, to Status, deciderID *string, note *string) (bool, error)
	TeammatesAway(ctx context.Context, r *Request) ([]Request, error)
	AttachmentOwnedBy(ctx context.Context, fileID, userID string) error
	// InUserLock runs fn in a transaction holding a per-user lock, so two
	// requests from the same person can't both pass the overlap/balance checks.
	InUserLock(ctx context.Context, userID string, fn func(Store) error) error
}

type Service struct {
	store  Store
	policy Policy
	today  func() time.Time
}

func NewService(s Store, p Policy, today func() time.Time) *Service {
	return &Service{store: s, policy: p, today: today}
}

func (s *Service) Policy() Policy { return s.policy }

// Balances for one person and year.
func (s *Service) Balances(ctx context.Context, userID string, year int) ([]Balance, error) {
	return balancesWith(ctx, s.store, s.policy, userID, year)
}

func balancesWith(ctx context.Context, st Store, p Policy, userID string, year int) ([]Balance, error) {
	usage, err := st.Usage(ctx, []string{userID}, year)
	if err != nil {
		return nil, err
	}
	overrides, err := st.LimitOverrides(ctx, []string{userID}, year)
	if err != nil {
		return nil, err
	}
	return p.Balances(overrides[userID], usage[userID]), nil
}

// YearTotal is the "8/22 used" figure shown next to people in HR tables.
type YearTotal struct {
	Used    int `json:"used"`
	Pending int `json:"pending"`
	Limit   int `json:"limit"`
}

// YearTotals sums all types for many people at once (one query each).
func (s *Service) YearTotals(ctx context.Context, userIDs []string, year int) (map[string]YearTotal, error) {
	usage, err := s.store.Usage(ctx, userIDs, year)
	if err != nil {
		return nil, err
	}
	overrides, err := s.store.LimitOverrides(ctx, userIDs, year)
	if err != nil {
		return nil, err
	}
	out := map[string]YearTotal{}
	for _, id := range userIDs {
		var t YearTotal
		for _, b := range s.policy.Balances(overrides[id], usage[id]) {
			t.Used += b.Used
			t.Pending += b.Pending
			t.Limit += b.Limit
		}
		out[id] = t
	}
	return out, nil
}

// List: scope "mine" is anyone's own requests; scope "all" is HR only.
func (s *Service) List(ctx context.Context, u *domain.User, scope string, f Filter) ([]Request, int, error) {
	switch scope {
	case "", "mine":
		f.UserID = u.ID
	case "all":
		if !u.IsHR() {
			return nil, 0, domain.Forbidden("FORBIDDEN", "Only HR can see everyone's requests.")
		}
	default:
		return nil, 0, domain.Invalid("scope must be mine or all.")
	}
	for _, st := range f.Statuses {
		if !st.Valid() {
			return nil, 0, domain.Invalid("Unknown status %q.", st)
		}
	}
	if f.Type != "" && !f.Type.Valid() {
		return nil, 0, domain.Invalid("Unknown leave type %q.", f.Type)
	}
	f.Page, f.PageSize = max(f.Page, 1), min(max(f.PageSize, 1), 100)
	f.Query = strings.TrimSpace(f.Query)
	return s.store.ListRequests(ctx, f)
}

// Get: the owner or any HR; others get 404 so ids can't be probed.
func (s *Service) Get(ctx context.Context, u *domain.User, id int64) (*Request, error) {
	r, err := s.store.RequestByID(ctx, id)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, domain.NotFound("Request not found.")
	}
	if err != nil {
		return nil, err
	}
	if r.UserID != u.ID && !u.IsHR() {
		return nil, domain.NotFound("Request not found.")
	}
	return r, nil
}

func (s *Service) Create(ctx context.Context, u *domain.User, d Draft) (*Request, error) {
	d.Reason = strings.TrimSpace(d.Reason)
	var id int64
	err := s.store.InUserLock(ctx, u.ID, func(tx Store) error {
		days, err := s.check(ctx, tx, u, d, nil)
		if err != nil {
			return err
		}
		id, err = tx.InsertRequest(ctx, u.ID, d, days)
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.store.RequestByID(ctx, id)
}

// Update edits a pending request; its own days are given back before the
// balance check, and it is excluded from the overlap check.
func (s *Service) Update(ctx context.Context, u *domain.User, id int64, d Draft) (*Request, error) {
	d.Reason = strings.TrimSpace(d.Reason)
	current, err := s.Get(ctx, u, id)
	if err != nil {
		return nil, err
	}
	if err := CanChange(u, current, "edit"); err != nil {
		return nil, err
	}
	err = s.store.InUserLock(ctx, u.ID, func(tx Store) error {
		days, err := s.check(ctx, tx, u, d, current)
		if err != nil {
			return err
		}
		ok, err := tx.UpdatePendingRequest(ctx, id, d, days)
		if err == nil && !ok {
			return domain.Conflict("NOT_PENDING", "%s was decided in the meantime.", current.Code())
		}
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.store.RequestByID(ctx, id)
}

func (s *Service) check(ctx context.Context, tx Store, u *domain.User, d Draft, editing *Request) (int, error) {
	if d.AttachmentFileID != nil && *d.AttachmentFileID != "" {
		if err := tx.AttachmentOwnedBy(ctx, *d.AttachmentFileID, u.ID); err != nil {
			return 0, err
		}
	} else {
		d.AttachmentFileID = nil
	}
	own, err := tx.ActiveRequests(ctx, u.ID)
	if err != nil {
		return 0, err
	}
	var balances []Balance
	if d.StartDate != nil {
		year := d.StartDate.Year()
		if balances, err = balancesWith(ctx, tx, s.policy, u.ID, year); err != nil {
			return 0, err
		}
		if editing != nil {
			own = without(own, editing.ID)
			if editing.Year() == year {
				balances = refund(balances, editing)
			}
		}
	}
	return Validate(d, own, balances)
}

func without(rs []Request, id int64) []Request {
	out := rs[:0:0]
	for _, r := range rs {
		if r.ID != id {
			out = append(out, r)
		}
	}
	return out
}

// refund adds a pending request's days back to "available".
func refund(bs []Balance, r *Request) []Balance {
	out := append([]Balance(nil), bs...)
	for i := range out {
		if out[i].Type == r.Type {
			out[i].Pending -= r.WorkingDays
			out[i].Available += r.WorkingDays
		}
	}
	return out
}

func (s *Service) Cancel(ctx context.Context, u *domain.User, id int64) (*Request, error) {
	r, err := s.Get(ctx, u, id)
	if err != nil {
		return nil, err
	}
	if err := CanChange(u, r, "cancel"); err != nil {
		return nil, err
	}
	if ok, err := s.store.SetStatus(ctx, id, Pending, Cancelled, nil, nil); err != nil || !ok {
		if err == nil {
			err = domain.Conflict("NOT_PENDING", "%s was decided in the meantime.", r.Code())
		}
		return nil, err
	}
	return s.store.RequestByID(ctx, id)
}

type Decision struct {
	Status Status `json:"status"`
	Note   string `json:"note"`
}

// Decide approves or rejects. The status check is repeated inside the
// UPDATE, so two HR clicking at once can't both win.
func (s *Service) Decide(ctx context.Context, hr *domain.User, id int64, d Decision) (*Request, error) {
	if d.Status != Approved && d.Status != Rejected {
		return nil, domain.Invalid("Decision must be approved or rejected.")
	}
	d.Note = strings.TrimSpace(d.Note)
	if len([]rune(d.Note)) > MaxReasonLength {
		return nil, domain.Invalid("Keep the note under %d characters.", MaxReasonLength)
	}
	r, err := s.Get(ctx, hr, id)
	if err != nil {
		return nil, err
	}
	if err := CanDecide(hr, r); err != nil {
		return nil, err
	}
	var note *string
	if d.Note != "" {
		note = &d.Note
	}
	ok, err := s.store.SetStatus(ctx, id, Pending, d.Status, &hr.ID, note)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, domain.Conflict("NOT_PENDING", "%s was decided by someone else a moment ago.", r.Code())
	}
	return s.store.RequestByID(ctx, id)
}

// TeammatesAway: people in the requester's department with pending or
// approved leave overlapping the request (HR review page).
func (s *Service) TeammatesAway(ctx context.Context, hr *domain.User, id int64) ([]Request, error) {
	r, err := s.Get(ctx, hr, id)
	if err != nil {
		return nil, err
	}
	return s.store.TeammatesAway(ctx, r)
}
