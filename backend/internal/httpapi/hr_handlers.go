package httpapi

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
	"github.com/suma-iya/leavedesk/backend/internal/hr"
	"github.com/suma-iya/leavedesk/backend/internal/leave"
)

type employeeRowView struct {
	userView
	Yearly leave.YearTotal `json:"yearly"`
}

func (s *Server) employeeRows(r *http.Request, pageSize int) ([]employeeRowView, int, int, error) {
	q := r.URL.Query()
	dept, _ := strconv.Atoi(q.Get("department"))
	page, _ := strconv.Atoi(q.Get("page"))
	if n, err := strconv.Atoi(q.Get("pageSize")); err == nil && pageSize == 0 {
		pageSize = n
	}
	if pageSize == 0 {
		pageSize = 8
	}
	rows, total, err := s.hr.Employees(r.Context(), q.Get("q"), dept, page, pageSize)
	if err != nil {
		return nil, 0, 0, err
	}
	views := make([]employeeRowView, len(rows))
	for i := range rows {
		views[i] = employeeRowView{userView: viewUser(&rows[i].User, s.today()), Yearly: rows[i].Yearly}
	}
	return views, total, max(page, 1), nil
}

// GET /api/hr/employees?q=&department=&page=
func (s *Server) employees(w http.ResponseWriter, r *http.Request, _ *domain.User) error {
	views, total, page, err := s.employeeRows(r, 0)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": views, "total": total, "page": page})
	return nil
}

// GET /api/hr/employees/{id} — the only endpoint that returns salary.
func (s *Server) employee(w http.ResponseWriter, r *http.Request, _ *domain.User) error {
	d, err := s.hr.Employee(r.Context(), pathID(r))
	if err != nil {
		return err
	}
	var current *hr.Salary
	if len(d.Salaries) > 0 {
		current = &d.Salaries[0]
	}
	recent := make([]requestView, len(d.Recent))
	for i := range d.Recent {
		recent[i] = viewRequest(&d.Recent[i])
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"employee": viewUser(d.User, s.today()),
		"salary":   map[string]any{"current": current, "history": d.Salaries},
		"year":     d.Year, "balances": d.Balances, "defaults": s.leave.Policy().Defaults,
		"recentRequests": recent,
	})
	return nil
}

// PATCH /api/hr/employees/{id}
func (s *Server) updateEmployee(w http.ResponseWriter, r *http.Request, u *domain.User) error {
	var c hr.Change
	if err := decode(r, &c); err != nil {
		return err
	}
	if err := s.hr.Update(r.Context(), u, pathID(r), c); err != nil {
		return err
	}
	return s.employee(w, r, u)
}

// GET /api/departments (any active user)
func (s *Server) departments(w http.ResponseWriter, r *http.Request, _ *domain.User) error {
	ds, err := s.hr.Departments(r.Context())
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, ds)
	return nil
}

// POST /api/departments (HR)  {"name": "Legal"}
func (s *Server) createDepartment(w http.ResponseWriter, r *http.Request, _ *domain.User) error {
	var in struct{ Name string }
	if err := decode(r, &in); err != nil {
		return err
	}
	d, err := s.hr.CreateDepartment(r.Context(), in.Name)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, d)
	return nil
}

func startCSV(w http.ResponseWriter, name string) *csv.Writer {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s-%s.csv"`, name, time.Now().Format("2006-01-02")))
	return csv.NewWriter(w)
}

// GET /api/requests/export.csv — HR, same filters as the table, every page.
func (s *Server) exportRequests(w http.ResponseWriter, r *http.Request, u *domain.User) error {
	scope, f, err := parseFilter(r)
	if err != nil {
		return err
	}
	if scope == "" {
		scope = "all"
	}
	var all []leave.Request
	for f.Page, f.PageSize = 1, 100; ; f.Page++ {
		items, total, err := s.leave.List(r.Context(), u, scope, f)
		if err != nil {
			return err
		}
		all = append(all, items...)
		if len(all) >= total || len(items) == 0 {
			break
		}
	}
	// Build every cell, then drop columns that are empty in every row
	// (e.g. "Decided by" and "Note" when exporting pending requests).
	header := []string{"Employee", "Department", "Type", "From", "To", "Working days", "Status", "Submitted", "Decided by", "Decided on", "Note"}
	rows := make([][]string, 0, len(all))
	for _, q := range all {
		dept, decider, decided := "", "", ""
		if q.Employee.Department != nil {
			dept = q.Employee.Department.Name
		}
		if q.DecidedBy != nil {
			decider = q.DecidedBy.FirstName + " " + q.DecidedBy.LastName
		}
		if q.DecidedAt != nil {
			decided = q.DecidedAt.In(s.cfg.Location).Format(time.DateOnly)
		}
		rows = append(rows, []string{q.Employee.FirstName + " " + q.Employee.LastName, dept, q.Type.Label(),
			q.Start.String(), q.End.String(), strconv.Itoa(q.WorkingDays), string(q.Status),
			q.SubmittedAt.In(s.cfg.Location).Format(time.DateOnly), decider, decided, q.DecisionNote})
	}
	keep := nonEmptyColumns(len(header), rows, 8) // the first 8 columns always stay
	out := startCSV(w, "leave-requests")
	_ = out.Write(pick(header, keep))
	for _, row := range rows {
		_ = out.Write(pick(row, keep))
	}
	out.Flush()
	return out.Error()
}

// GET /api/hr/employees/export.csv — People table export.
func (s *Server) exportEmployees(w http.ResponseWriter, r *http.Request, _ *domain.User) error {
	rows, _, _, err := s.employeeRows(r, 100)
	if err != nil {
		return err
	}
	out := startCSV(w, "employees")
	_ = out.Write([]string{"Name", "Email", "Department", "Age", "Joined", "Leave used", "Leave limit", "Left"})
	for _, e := range rows {
		dept, joined := "", ""
		if e.Department != nil {
			dept = e.Department.Name
		}
		if e.JoinedOn != nil {
			joined = e.JoinedOn.String()
		}
		_ = out.Write([]string{e.FirstName + " " + e.LastName, e.Email, dept, strconv.Itoa(e.Age), joined,
			strconv.Itoa(e.Yearly.Used), strconv.Itoa(e.Yearly.Limit), strconv.Itoa(e.Yearly.Limit - e.Yearly.Used)})
	}
	out.Flush()
	return out.Error()
}

// nonEmptyColumns returns the indexes to export: the first `always` columns,
// plus any later column that has a value in at least one row.
func nonEmptyColumns(width int, rows [][]string, always int) []int {
	var keep []int
	for c := 0; c < width; c++ {
		used := c < always
		for _, row := range rows {
			if used {
				break
			}
			used = row[c] != ""
		}
		if used {
			keep = append(keep, c)
		}
	}
	return keep
}

func pick(row []string, keep []int) []string {
	out := make([]string, len(keep))
	for i, c := range keep {
		out[i] = row[c]
	}
	return out
}
