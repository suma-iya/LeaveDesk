package httpapi

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
	"github.com/suma-iya/leavedesk/backend/internal/leave"
)

// requestView adds the display code (LV-2041) and, in HR lists, the
// requester's yearly totals for the balance bar.
type requestView struct {
	*leave.Request
	Code   string           `json:"code"`
	Yearly *leave.YearTotal `json:"yearly,omitempty"`
}

func viewRequest(r *leave.Request) requestView { return requestView{Request: r, Code: r.Code()} }

func requestID(r *http.Request) (int64, error) {
	id, err := strconv.ParseInt(strings.TrimPrefix(strings.ToUpper(pathID(r)), "LV-"), 10, 64)
	if err != nil || id <= 0 {
		return 0, domain.NotFound("Request not found.")
	}
	return id, nil
}

// parseFilter reads the query string shared by the list and CSV export.
func parseFilter(r *http.Request) (scope string, f leave.Filter, err error) {
	q := r.URL.Query()
	scope = q.Get("scope")
	for _, st := range strings.Split(q.Get("status"), ",") {
		if st = strings.TrimSpace(st); st != "" {
			f.Statuses = append(f.Statuses, leave.Status(st))
		}
	}
	f.Type = leave.Type(q.Get("type"))
	f.Query = q.Get("q")
	ints := map[string]*int{"department": &f.DepartmentID, "year": &f.Year, "page": &f.Page, "pageSize": &f.PageSize}
	for key, dst := range ints {
		if raw := q.Get(key); raw != "" {
			n, convErr := strconv.Atoi(raw)
			if convErr != nil {
				return "", f, domain.Invalid("%s must be a number.", key)
			}
			*dst = n
		}
	}
	for key, dst := range map[string]**domain.Date{"from": &f.From, "to": &f.To} {
		if raw := q.Get(key); raw != "" {
			d, parseErr := domain.ParseDate(raw)
			if parseErr != nil {
				return "", f, domain.Invalid("%s: %v", key, parseErr)
			}
			*dst = &d
		}
	}
	if f.PageSize == 0 {
		f.PageSize = 8
	}
	return scope, f, nil
}

// GET /api/requests?scope=mine|all&status=&type=&department=&q=&from=&to=&year=&page=&pageSize=
func (s *Server) listRequests(w http.ResponseWriter, r *http.Request, u *domain.User) error {
	scope, f, err := parseFilter(r)
	if err != nil {
		return err
	}
	items, total, err := s.leave.List(r.Context(), u, scope, f)
	if err != nil {
		return err
	}
	views := make([]requestView, len(items))
	for i := range items {
		views[i] = viewRequest(&items[i])
	}
	// HR tables show each person's yearly "8/22 used" bar.
	if scope == "all" && len(items) > 0 {
		ids := make([]string, 0, len(items))
		for _, it := range items {
			ids = append(ids, it.UserID)
		}
		totals, err := s.leave.YearTotals(r.Context(), ids, s.today().Year())
		if err != nil {
			return err
		}
		for i := range views {
			t := totals[views[i].UserID]
			views[i].Yearly = &t
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": views, "total": total, "page": max(f.Page, 1), "pageSize": f.PageSize})
	return nil
}

// POST /api/requests
func (s *Server) createRequest(w http.ResponseWriter, r *http.Request, u *domain.User) error {
	if isMultipart(r) {
		return s.createRequestMultipart(w, r, u)
	}
	var d leave.Draft
	if err := decode(r, &d); err != nil {
		return err
	}
	created, err := s.leave.Create(r.Context(), u, d)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, viewRequest(created))
	return nil
}

// GET /api/requests/{id} — owner or HR. Includes the requester's balances
// for that year (the review page's "If approved" line needs them).
func (s *Server) getRequest(w http.ResponseWriter, r *http.Request, u *domain.User) error {
	id, err := requestID(r)
	if err != nil {
		return err
	}
	req, err := s.leave.Get(r.Context(), u, id)
	if err != nil {
		return err
	}
	balances, err := s.leave.Balances(r.Context(), req.UserID, req.Year())
	if err != nil {
		return err
	}
	if req.Employee.DateOfBirth != nil {
		age := domain.Age(req.Employee.DateOfBirth.Time, s.today())
		req.Employee.Age = &age
	}
	writeJSON(w, http.StatusOK, map[string]any{"request": viewRequest(req), "balances": balances})
	return nil
}

// PATCH /api/requests/{id} — owner, pending only.
func (s *Server) updateRequest(w http.ResponseWriter, r *http.Request, u *domain.User) error {
	id, err := requestID(r)
	if err != nil {
		return err
	}
	var d leave.Draft
	if err := decode(r, &d); err != nil {
		return err
	}
	updated, err := s.leave.Update(r.Context(), u, id, d)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, viewRequest(updated))
	return nil
}

// POST /api/requests/{id}/cancel — owner, pending only.
func (s *Server) cancelRequest(w http.ResponseWriter, r *http.Request, u *domain.User) error {
	id, err := requestID(r)
	if err != nil {
		return err
	}
	cancelled, err := s.leave.Cancel(r.Context(), u, id)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, viewRequest(cancelled))
	return nil
}

// POST /api/requests/{id}/decision — HR, never their own, pending only.
func (s *Server) decideRequest(w http.ResponseWriter, r *http.Request, u *domain.User) error {
	id, err := requestID(r)
	if err != nil {
		return err
	}
	var d leave.Decision
	if err := decode(r, &d); err != nil {
		return err
	}
	decided, err := s.leave.Decide(r.Context(), u, id, d)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, viewRequest(decided))
	return nil
}

// GET /api/requests/{id}/overlaps — HR: teammates away in the same range.
func (s *Server) requestOverlaps(w http.ResponseWriter, r *http.Request, u *domain.User) error {
	id, err := requestID(r)
	if err != nil {
		return err
	}
	away, err := s.leave.TeammatesAway(r.Context(), u, id)
	if err != nil {
		return err
	}
	views := make([]requestView, len(away))
	for i := range away {
		views[i] = viewRequest(&away[i])
	}
	writeJSON(w, http.StatusOK, views)
	return nil
}

// GET /api/me/balances?year=2026
func (s *Server) myBalances(w http.ResponseWriter, r *http.Request, u *domain.User) error {
	year := s.today().Year()
	if raw := r.URL.Query().Get("year"); raw != "" {
		y, err := strconv.Atoi(raw)
		if err != nil || y < 2000 || y > 2100 {
			return domain.Invalid("year must be a year like 2026.")
		}
		year = y
	}
	balances, err := s.leave.Balances(r.Context(), u.ID, year)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, balances)
	return nil
}
