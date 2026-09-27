package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/account"
	"github.com/suma-iya/leavedesk/backend/internal/auth"
	"github.com/suma-iya/leavedesk/backend/internal/config"
	"github.com/suma-iya/leavedesk/backend/internal/domain"
	"github.com/suma-iya/leavedesk/backend/internal/files"
	"github.com/suma-iya/leavedesk/backend/internal/hr"
	"github.com/suma-iya/leavedesk/backend/internal/leave"
)

// ---- fakes; names start with "api" to stay clear of google_test.go ----

// apiUsers is the middleware's UserLoader.
type apiUsers struct {
	users     map[string]*domain.User
	err       error
	panicWith any
}

func (d *apiUsers) UserByID(_ context.Context, id string) (*domain.User, error) {
	if d.panicWith != nil {
		panic(d.panicWith)
	}
	if d.err != nil {
		return nil, d.err
	}
	if u, ok := d.users[id]; ok {
		return u, nil
	}
	return nil, fmt.Errorf("user by id: %w", domain.ErrNotFound)
}

// apiAccounts adds the profile and password writes to accountStore.
type apiAccounts struct {
	*accountStore
	byID     map[string]*domain.User
	password string
}

func (a *apiAccounts) HasHR(context.Context) (bool, error) { return a.hasHR, nil }
func (a *apiAccounts) UserByID(_ context.Context, id string) (*domain.User, error) {
	if u, ok := a.byID[id]; ok {
		return u, nil
	}
	return nil, domain.ErrNotFound
}
func (a *apiAccounts) UpdateProfile(_ context.Context, id, first, last string, dob domain.Date, avatar *string) error {
	cp := *a.byID[id]
	cp.FirstName, cp.LastName, cp.DateOfBirth, cp.AvatarFileID = first, last, dob.Time, avatar
	a.byID[id] = &cp
	return nil
}
func (a *apiAccounts) UpdatePassword(_ context.Context, _ string, hash string) error {
	a.password = hash
	return nil
}

// apiLeave is an in-memory leave.Store.
type apiLeave struct {
	leave.Store
	reqs  map[int64]*leave.Request
	next  int64
	files *apiFiles
}

func (l *apiLeave) AttachmentOwnedBy(_ context.Context, fileID, userID string) error {
	if f, ok := l.files.rows[fileID]; ok && f.OwnerID == userID && f.Kind == files.Attachment {
		return nil
	}
	return domain.Invalid("That attachment was not found. Upload it again.")
}

func (l *apiLeave) Usage(context.Context, []string, int) (map[string]leave.Usage, error) {
	return map[string]leave.Usage{}, nil
}
func (l *apiLeave) LimitOverrides(context.Context, []string, int) (map[string]map[leave.Type]int, error) {
	return nil, nil
}
func (l *apiLeave) RequestByID(_ context.Context, id int64) (*leave.Request, error) {
	if r, ok := l.reqs[id]; ok {
		cp := *r
		return &cp, nil
	}
	return nil, fmt.Errorf("request: %w", domain.ErrNotFound)
}
func (l *apiLeave) ListRequests(_ context.Context, f leave.Filter) ([]leave.Request, int, error) {
	var out []leave.Request
	for _, r := range l.reqs {
		if f.UserID == "" || r.UserID == f.UserID {
			out = append(out, *r)
		}
	}
	return out, len(out), nil
}
func (l *apiLeave) InUserLock(_ context.Context, _ string, fn func(leave.Store) error) error {
	return fn(l)
}
func (l *apiLeave) ActiveRequests(context.Context, string) ([]leave.Request, error) { return nil, nil }
func (l *apiLeave) InsertRequest(_ context.Context, userID string, d leave.Draft, days int) (int64, error) {
	l.next++
	l.reqs[l.next] = &leave.Request{ID: l.next, UserID: userID, Type: d.Type, Start: *d.StartDate, End: *d.EndDate,
		WorkingDays: days, Status: leave.Pending, AttachmentID: d.AttachmentFileID}
	return l.next, nil
}
func (l *apiLeave) SetStatus(_ context.Context, id int64, from, to leave.Status, decider, note *string) (bool, error) {
	r := l.reqs[id]
	if r.Status != from {
		return false, nil
	}
	r.Status, r.DecidedByID = to, decider
	return true, nil
}
func (l *apiLeave) TeammatesAway(context.Context, *leave.Request) ([]leave.Request, error) {
	return []leave.Request{}, nil
}

// apiHR is an in-memory hr.Store.
type apiHR struct {
	hr.Store
	users *apiUsers
	depts []domain.Department
	audit []hr.AuditEntry
}

func (h *apiHR) UserByID(ctx context.Context, id string) (*domain.User, error) {
	return h.users.UserByID(ctx, id)
}
func (h *apiHR) Departments(context.Context) ([]domain.Department, error) { return h.depts, nil }
func (h *apiHR) CreateDepartment(_ context.Context, name string) (*domain.Department, error) {
	for _, d := range h.depts {
		if strings.EqualFold(d.Name, name) {
			return nil, domain.ErrConflict
		}
	}
	d := domain.Department{ID: len(h.depts) + 1, Name: name}
	h.depts = append(h.depts, d)
	return &d, nil
}
func (h *apiHR) ActiveUsers(context.Context, string, int, int, int) ([]domain.User, int, error) {
	return []domain.User{*h.users.users["emp-1"]}, 1, nil
}
func (h *apiHR) SalaryHistory(context.Context, string) ([]hr.Salary, error) { return nil, nil }
func (h *apiHR) DepartmentByID(_ context.Context, id int) (*domain.Department, error) {
	for _, d := range h.depts {
		if d.ID == id {
			return &d, nil
		}
	}
	return nil, domain.ErrNotFound
}
func (h *apiHR) InTx(_ context.Context, _ string, fn func(hr.Store) error) error { return fn(h) }
func (h *apiHR) SetDepartment(_ context.Context, userID string, id int) error {
	d, _ := h.DepartmentByID(context.Background(), id)
	h.users.users[userID].Department = d
	return nil
}
func (h *apiHR) Audit(_ context.Context, entries []hr.AuditEntry) error {
	h.audit = append(h.audit, entries...)
	return nil
}

// apiFiles is an in-memory files.Store.
type apiFiles struct {
	rows map[string]files.File
}

func (f *apiFiles) InsertFile(_ context.Context, file files.File) (string, error) {
	id := fmt.Sprintf("file-%d", len(f.rows)+1)
	file.ID = id
	f.rows[id] = file
	return id, nil
}
func (f *apiFiles) DeleteFile(_ context.Context, id string) error { delete(f.rows, id); return nil }
func (f *apiFiles) FileByID(_ context.Context, id string) (*files.File, error) {
	if file, ok := f.rows[id]; ok {
		return &file, nil
	}
	return nil, domain.ErrNotFound
}

type apiCalendar struct{}

func (apiCalendar) RequestsBetween(context.Context, time.Time, time.Time, leave.CalendarFilter) ([]leave.Request, error) {
	return nil, nil
}

// ---- test environment ----

var (
	apiHRUser = &domain.User{ID: "hr-1", Email: "hr@company.test", FirstName: "Hasina", LastName: "Begum",
		Role: domain.RoleHR, DateOfBirth: time.Date(1985, 1, 1, 0, 0, 0, 0, time.UTC)}
	apiEmp = &domain.User{ID: "emp-1", Email: "rakib@company.test", FirstName: "Rakib", LastName: "Hasan",
		Role: domain.RoleEmployee, DateOfBirth: time.Date(1998, 12, 2, 0, 0, 0, 0, time.UTC)}
	apiEmp2 = &domain.User{ID: "emp-2", Email: "nadia@company.test", FirstName: "Nadia", LastName: "Rahman",
		Role: domain.RoleEmployee, DateOfBirth: time.Date(1996, 4, 10, 0, 0, 0, 0, time.UTC)}
)

type apiEnv struct {
	h        http.Handler
	srv      *Server
	users    *apiUsers
	accounts *apiAccounts
	leave    *apiLeave
	hr       *apiHR
	files    *apiFiles
}

func newAPI(t *testing.T) *apiEnv {
	t.Helper()
	today := func() time.Time { return time.Date(2026, 9, 26, 0, 0, 0, 0, time.UTC) }
	people := map[string]*domain.User{}
	for _, u := range []*domain.User{apiHRUser, apiEmp, apiEmp2} {
		cp := *u
		people[u.ID] = &cp
	}
	e := &apiEnv{
		users:    &apiUsers{users: people},
		accounts: &apiAccounts{accountStore: &accountStore{hasHR: true}, byID: people},
		leave: &apiLeave{reqs: map[int64]*leave.Request{
			1: {ID: 1, UserID: "emp-1", Type: leave.Annual, Start: date(t, "2026-10-18"), End: date(t, "2026-10-19"), WorkingDays: 2,
				Status: leave.Pending, Employee: leave.Person{ID: "emp-1", FirstName: "Rakib", LastName: "Hasan", DateOfBirth: datePtr(t, "1998-12-02")}},
		}, next: 1},
		files: &apiFiles{rows: map[string]files.File{}},
	}
	for _, u := range people {
		e.accounts.users = append(e.accounts.users, u)
	}
	e.leave.files = e.files
	e.hr = &apiHR{users: e.users, depts: []domain.Department{{ID: 1, Name: "Engineering"}, {ID: 2, Name: "Finance"}}}

	cfg := &config.Config{JWTSecret: testSecret, SessionTTL: time.Hour, Location: time.UTC}
	leaves := leave.NewService(e.leave, leave.NewPolicy(map[string]int{"annual": 16, "casual": 3, "sick": 3}), today)
	e.srv = NewServer(cfg, Deps{
		Users:    e.users,
		Accounts: account.NewService(e.accounts, nil, today),
		Leave:    leaves,
		HR:       hr.NewService(e.hr, leaves, today),
		Files:    files.NewService(e.files, t.TempDir()),
		Calendar: apiCalendar{},
	})
	e.srv.today = today
	e.h = e.srv.Handler()
	return e
}

func date(t *testing.T, s string) domain.Date {
	t.Helper()
	d, err := domain.ParseDate(s)
	if err != nil {
		t.Fatal(err)
	}
	return d
}
func datePtr(t *testing.T, s string) *domain.Date { d := date(t, s); return &d }

// sessionFor is the cookie a sign-in as u would have set.
func sessionFor(t *testing.T, u *domain.User) *http.Cookie {
	t.Helper()
	w := httptest.NewRecorder()
	if err := auth.NewSessions(testSecret, time.Hour, false).Start(w, u); err != nil {
		t.Fatal(err)
	}
	return cookie(w.Result(), auth.CookieName)
}

type apiReply struct {
	res  *http.Response
	body []byte
}

func (r apiReply) json(t *testing.T) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(r.body, &m); err != nil {
		t.Fatalf("body is not a JSON object: %v: %s", err, r.body)
	}
	return m
}

// wantError checks the standard error shape.
func (r apiReply) wantError(t *testing.T, status int, code string) map[string]any {
	t.Helper()
	if r.res.StatusCode != status {
		t.Fatalf("status %d, want %d: %s", r.res.StatusCode, status, r.body)
	}
	if ct := r.res.Header.Get("Content-Type"); ct != "application/json" {
		t.Fatalf("errors must be JSON, got %q", ct)
	}
	m := r.json(t)
	if m["error"] != code || m["message"] == "" || len(m) != 2 {
		t.Fatalf("want {error: %s, message}, got %v", code, m)
	}
	return m
}

func (e *apiEnv) do(t *testing.T, method, path, body string, cookies ...*http.Cookie) apiReply {
	t.Helper()
	var rd io.Reader
	if body != "" {
		rd = strings.NewReader(body)
	}
	r := httptest.NewRequest(method, path, rd)
	if body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	return e.send(t, r, cookies...)
}

func (e *apiEnv) send(t *testing.T, r *http.Request, cookies ...*http.Cookie) apiReply {
	t.Helper()
	for _, c := range cookies {
		if c != nil {
			r.AddCookie(&http.Cookie{Name: c.Name, Value: c.Value})
		}
	}
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, r)
	res := w.Result()
	b, _ := io.ReadAll(res.Body)
	return apiReply{res: res, body: b}
}

// ---- middleware ----

func TestWithUser(t *testing.T) {
	ghost := &domain.User{ID: "deleted-user", Role: domain.RoleEmployee}
	tests := []struct {
		name        string
		cookie      *http.Cookie
		loaderErr   error
		wantStatus  int
		wantCode    string
		wantMsg     string
		wantCleared bool
	}{
		{name: "no session", wantStatus: 401, wantCode: "UNAUTHENTICATED", wantMsg: "Please sign in."},
		{name: "garbage session", cookie: &http.Cookie{Name: auth.CookieName, Value: "garbage"}, wantStatus: 401, wantCode: "UNAUTHENTICATED", wantMsg: "Please sign in."},
		{name: "account no longer exists", cookie: sessionFor(t, ghost), wantStatus: 401, wantCode: "UNAUTHENTICATED",
			wantMsg: "Your account no longer exists.", wantCleared: true},
		{name: "database failure is a 500 that hides the cause", cookie: sessionFor(t, apiEmp), loaderErr: errors.New("dial tcp 10.0.0.5:5432: password=hunter2"),
			wantStatus: 500, wantCode: "INTERNAL", wantMsg: "Something went wrong. Please try again."},
		{name: "signed in", cookie: sessionFor(t, apiEmp), wantStatus: 200},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := newAPI(t)
			e.users.err = tt.loaderErr
			rep := e.do(t, http.MethodGet, "/api/me", "", tt.cookie)
			if tt.wantStatus == 200 {
				if rep.res.StatusCode != 200 {
					t.Fatalf("got %d: %s", rep.res.StatusCode, rep.body)
				}
				m := rep.json(t)
				user, _ := m["user"].(map[string]any)
				balances, _ := m["balances"].([]any)
				if user["id"] != "emp-1" || user["age"] != float64(27) || user["hasPassword"] != false || len(balances) != 3 {
					t.Fatalf("unexpected body %s", rep.body)
				}
				if _, leaked := user["passwordHash"]; leaked {
					t.Fatal("the password hash must never be sent")
				}
				return
			}
			m := rep.wantError(t, tt.wantStatus, tt.wantCode)
			if m["message"] != tt.wantMsg {
				t.Fatalf("message %q, want %q", m["message"], tt.wantMsg)
			}
			if strings.Contains(string(rep.body), "hunter2") {
				t.Fatal("internal error details leaked to the client")
			}
			c := cookie(rep.res, auth.CookieName)
			if tt.wantCleared != (c != nil && c.MaxAge < 0 && c.Value == "") {
				t.Fatalf("session cookie cleared = %v, want %v (%+v)", c != nil, tt.wantCleared, c)
			}
		})
	}
}

func TestRoleIsReloadedFromTheDatabase(t *testing.T) {
	e := newAPI(t)
	// The token was issued while emp-1 was HR; the database now says employee.
	promoted := *apiEmp
	promoted.Role = domain.RoleHR
	rep := e.do(t, http.MethodGet, "/api/hr/employees", "", sessionFor(t, &promoted))
	rep.wantError(t, 403, "FORBIDDEN")

	// And the other way round: a new HR is recognised straight away.
	e.users.users["emp-2"].Role = domain.RoleHR
	if rep := e.do(t, http.MethodGet, "/api/hr/employees", "", sessionFor(t, apiEmp2)); rep.res.StatusCode != 200 {
		t.Fatalf("got %d: %s", rep.res.StatusCode, rep.body)
	}
}

func TestHROnlyRoutes(t *testing.T) {
	routes := []struct{ method, path, body string }{
		{http.MethodPost, "/api/requests/1/decision", `{"status":"approved"}`},
		{http.MethodGet, "/api/requests/1/overlaps", ""},
		{http.MethodGet, "/api/requests/export.csv", ""},
		{http.MethodGet, "/api/hr/employees", ""},
		{http.MethodGet, "/api/hr/employees/export.csv", ""},
		{http.MethodGet, "/api/hr/employees/emp-2", ""},
		{http.MethodPatch, "/api/hr/employees/emp-2", `{"departmentId":2}`},
		{http.MethodPost, "/api/departments", `{"name":"Legal"}`},
	}
	for _, rt := range routes {
		t.Run(rt.method+" "+rt.path, func(t *testing.T) {
			e := newAPI(t)
			e.do(t, rt.method, rt.path, rt.body).wantError(t, 401, "UNAUTHENTICATED")
			e.do(t, rt.method, rt.path, rt.body, sessionFor(t, apiEmp)).wantError(t, 403, "FORBIDDEN")
			if rep := e.do(t, rt.method, rt.path, rt.body, sessionFor(t, apiHRUser)); rep.res.StatusCode >= 400 {
				t.Fatalf("HR got %d: %s", rep.res.StatusCode, rep.body)
			}
		})
	}
}

func TestRecoverPanics(t *testing.T) {
	e := newAPI(t)
	e.users.panicWith = "nil map write"
	rep := e.do(t, http.MethodGet, "/api/me", "", sessionFor(t, apiEmp))
	m := rep.wantError(t, 500, "INTERNAL")
	if strings.Contains(string(rep.body), "nil map") {
		t.Fatalf("panic value leaked: %v", m)
	}
}

// ---- routing ----

func TestRouting(t *testing.T) {
	tests := []struct {
		name, method, path string
		wantStatus         int
		wantCode           string
	}{
		{name: "health", method: http.MethodGet, path: "/api/health", wantStatus: 200},
		{name: "unknown endpoint", method: http.MethodGet, path: "/api/nope", wantStatus: 404, wantCode: "NOT_FOUND"},
		{name: "unknown nested endpoint", method: http.MethodPost, path: "/api/me/avatar", wantStatus: 404, wantCode: "NOT_FOUND"},
		{name: "api root", method: http.MethodGet, path: "/api/", wantStatus: 404, wantCode: "NOT_FOUND"},
		{name: "non-numeric request id", method: http.MethodGet, path: "/api/requests/abc", wantStatus: 404, wantCode: "NOT_FOUND"},
		{name: "zero request id", method: http.MethodGet, path: "/api/requests/0", wantStatus: 404, wantCode: "NOT_FOUND"},
		{name: "negative request id", method: http.MethodGet, path: "/api/requests/-1", wantStatus: 404, wantCode: "NOT_FOUND"},
		{name: "missing request", method: http.MethodGet, path: "/api/requests/999", wantStatus: 404, wantCode: "NOT_FOUND"},
		{name: "unknown file", method: http.MethodGet, path: "/api/files/nope", wantStatus: 404, wantCode: "NOT_FOUND"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rep := newAPI(t).do(t, tt.method, tt.path, "", sessionFor(t, apiEmp))
			if tt.wantCode == "" {
				if rep.res.StatusCode != tt.wantStatus {
					t.Fatalf("got %d, want %d", rep.res.StatusCode, tt.wantStatus)
				}
				return
			}
			rep.wantError(t, tt.wantStatus, tt.wantCode)
		})
	}
}

// A known path with the wrong method is a 405 with an Allow header, not a 404.
func TestWrongMethodIs405(t *testing.T) {
	e := newAPI(t)
	for _, rt := range []struct{ method, path string }{
		{http.MethodDelete, "/api/me"},
		{http.MethodGet, "/api/auth/login"},
		{http.MethodPut, "/api/requests/1"},
	} {
		rep := e.do(t, rt.method, rt.path, "", sessionFor(t, apiEmp))
		if rep.res.StatusCode != http.StatusMethodNotAllowed || rep.res.Header.Get("Allow") == "" {
			t.Errorf("%s %s: got %d (Allow %q), want 405 with an Allow header", rt.method, rt.path, rep.res.StatusCode, rep.res.Header.Get("Allow"))
		}
	}
}

// A wrong method gets a JSON 405 naming the allowed methods; a path that
// doesn't exist is still a JSON 404.
func TestWrongMethodAndUnknownPathAreJSON(t *testing.T) {
	e := newAPI(t)
	rep := e.do(t, http.MethodDelete, "/api/me", "", sessionFor(t, apiEmp))
	rep.wantError(t, 405, "METHOD_NOT_ALLOWED")
	if got := rep.res.Header.Get("Allow"); got != "GET, PATCH" {
		t.Fatalf("Allow = %q, want %q", got, "GET, PATCH")
	}
	e.do(t, http.MethodGet, "/api/auth/login", "").wantError(t, 405, "METHOD_NOT_ALLOWED")
	e.do(t, http.MethodGet, "/api/no-such-thing", "").wantError(t, 404, "NOT_FOUND")
}

// ---- decode and fail ----

func TestDecodeRejectsBadBodies(t *testing.T) {
	big := `{"email":"` + strings.Repeat("a", 1<<20) + `","password":"x"}`
	tests := []struct {
		name, body string
		wantMsg    string // substring of the message
	}{
		{name: "unknown field", body: `{"email":"rakib@company.test","password":"password123","role":"hr"}`, wantMsg: "unknown field"},
		{name: "not JSON", body: `email=rakib`, wantMsg: "Invalid request body"},
		{name: "empty body", body: ``, wantMsg: "Invalid request body"},
		{name: "wrong type", body: `{"email":1,"password":"x"}`, wantMsg: "Invalid request body"},
		{name: "truncated", body: `{"email":"rakib@company.test"`, wantMsg: "Invalid request body"},
		{name: "over 1 MB", body: big, wantMsg: "Invalid request body"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := newAPI(t)
			r := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(tt.body))
			rep := e.send(t, r)
			m := rep.wantError(t, 400, "VALIDATION")
			if msg, _ := m["message"].(string); !strings.Contains(msg, tt.wantMsg) {
				t.Fatalf("message %q, want it to contain %q", msg, tt.wantMsg)
			}
			if cookie(rep.res, auth.CookieName) != nil {
				t.Fatal("a rejected body must not sign anyone in")
			}
		})
	}

	t.Run("decode directly", func(t *testing.T) {
		var dst struct{ Name string }
		under := `{"name":"` + strings.Repeat("x", (1<<20)-20) + `"}`
		if err := decode(httptest.NewRequest(http.MethodPost, "/", strings.NewReader(under)), &dst); err != nil {
			t.Fatalf("a body just under 1 MB must decode: %v", err)
		}
		if len(dst.Name) != (1<<20)-20 {
			t.Fatalf("decoded %d bytes", len(dst.Name))
		}
		err := decode(httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"Name":"a","Extra":1}`)), &dst)
		if de, ok := domain.AsError(err); !ok || de.Status != 400 {
			t.Fatalf("want a 400, got %v", err)
		}
	})
}

func TestFail(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   string
		wantMsg    string
	}{
		{"validation", domain.Invalid("Enter a name."), 400, "VALIDATION", "Enter a name."},
		{"custom code", domain.InvalidCode("INSUFFICIENT_BALANCE", "Not enough."), 400, "INSUFFICIENT_BALANCE", "Not enough."},
		{"forbidden", domain.Forbidden("SELF_APPROVAL", "Not yours."), 403, "SELF_APPROVAL", "Not yours."},
		{"conflict", domain.Conflict("OVERLAP", "Overlaps."), 409, "OVERLAP", "Overlaps."},
		{"wrapped domain error", fmt.Errorf("tx: %w", domain.NotFound("Request not found.")), 404, "NOT_FOUND", "Request not found."},
		{"store not-found sentinel", fmt.Errorf("file by id: %w", domain.ErrNotFound), 404, "NOT_FOUND", "Not found."},
		{"store conflict sentinel is internal", fmt.Errorf("insert: %w", domain.ErrConflict), 500, "INTERNAL", "Something went wrong. Please try again."},
		{"unknown error", errors.New(`pq: relation "users" does not exist`), 500, "INTERNAL", "Something went wrong. Please try again."},
		{"context cancelled", context.Canceled, 500, "INTERNAL", "Something went wrong. Please try again."},
	}
	s := newAPI(t).srv
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			s.fail(w, httptest.NewRequest(http.MethodGet, "/api/x", nil), tt.err)
			var body map[string]string
			if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			if w.Code != tt.wantStatus || body["error"] != tt.wantCode || body["message"] != tt.wantMsg {
				t.Fatalf("got %d %v, want %d %s %q", w.Code, body, tt.wantStatus, tt.wantCode, tt.wantMsg)
			}
		})
	}
}

// ---- auth endpoints ----

func TestLoginAndLogout(t *testing.T) {
	hash, err := auth.HashPassword("password123")
	if err != nil {
		t.Fatal(err)
	}
	e := newAPI(t)
	e.users.users["emp-1"].PasswordHash = &hash

	rep := e.do(t, http.MethodPost, "/api/auth/login", `{"email":"rakib@company.test","password":"wrong-password"}`)
	rep.wantError(t, 401, "UNAUTHENTICATED")
	if cookie(rep.res, auth.CookieName) != nil {
		t.Fatal("a failed login must not set a session")
	}

	rep = e.do(t, http.MethodPost, "/api/auth/login", `{"email":" Rakib@Company.test ","password":"password123"}`)
	if rep.res.StatusCode != 200 || rep.json(t)["id"] != "emp-1" || rep.json(t)["hasPassword"] != true {
		t.Fatalf("got %d: %s", rep.res.StatusCode, rep.body)
	}
	session := cookie(rep.res, auth.CookieName)
	if session == nil || !session.HttpOnly {
		t.Fatalf("want an httpOnly session cookie, got %+v", session)
	}
	if rep := e.do(t, http.MethodGet, "/api/me", "", session); rep.res.StatusCode != 200 {
		t.Fatalf("the new session must work: %d", rep.res.StatusCode)
	}

	rep = e.do(t, http.MethodPost, "/api/auth/logout", "")
	if c := cookie(rep.res, auth.CookieName); rep.res.StatusCode != 204 || c == nil || c.MaxAge >= 0 {
		t.Fatalf("logout: %d, cookie %+v", rep.res.StatusCode, c)
	}
}

func TestBootstrapAndGoogleDisabled(t *testing.T) {
	e := newAPI(t)
	rep := e.do(t, http.MethodGet, "/api/auth/bootstrap", "")
	if m := rep.json(t); rep.res.StatusCode != 200 || m["hasHR"] != true || m["google"] != false {
		t.Fatalf("got %d %s", rep.res.StatusCode, rep.body)
	}
	for _, rt := range []struct{ method, path string }{
		{http.MethodGet, "/api/auth/google/start"},
		{http.MethodGet, "/api/auth/google/callback?code=c&state=s"},
		{http.MethodGet, "/api/auth/google/pending"},
		{http.MethodPost, "/api/auth/google/complete"},
	} {
		e.do(t, rt.method, rt.path, "").wantError(t, 404, "NOT_FOUND")
	}
}

// ---- me ----

func TestUpdateMe(t *testing.T) {
	e := newAPI(t)
	e.files.rows["mine"] = files.File{ID: "mine", OwnerID: "emp-1", Kind: files.Avatar, Mime: "image/png"}
	e.files.rows["theirs"] = files.File{ID: "theirs", OwnerID: "emp-2", Kind: files.Avatar, Mime: "image/png"}
	session := sessionFor(t, apiEmp)

	tests := []struct {
		name, body string
		wantStatus int
		wantCode   string
		wantAvatar string
	}{
		{name: "someone else's photo", body: `{"firstName":"Rakib","lastName":"Hasan","avatarFileId":"theirs"}`, wantStatus: 400, wantCode: "VALIDATION"},
		{name: "own photo", body: `{"firstName":"Rakib","lastName":"Hasan","avatarFileId":"mine"}`, wantStatus: 200, wantAvatar: "/api/files/mine"},
		{name: "cannot change role", body: `{"firstName":"Rakib","lastName":"Hasan","role":"hr"}`, wantStatus: 400, wantCode: "VALIDATION"},
		{name: "cannot change email", body: `{"firstName":"Rakib","lastName":"Hasan","email":"boss@company.test"}`, wantStatus: 400, wantCode: "VALIDATION"},
		{name: "under 18", body: `{"firstName":"Rakib","lastName":"Hasan","dateOfBirth":"2010-01-01"}`, wantStatus: 400, wantCode: "VALIDATION"},
		{name: "bad date", body: `{"firstName":"Rakib","lastName":"Hasan","dateOfBirth":"01/02/1998"}`, wantStatus: 400, wantCode: "VALIDATION"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rep := e.do(t, http.MethodPatch, "/api/me", tt.body, session)
			if tt.wantCode != "" {
				rep.wantError(t, tt.wantStatus, tt.wantCode)
				return
			}
			if m := rep.json(t); rep.res.StatusCode != tt.wantStatus || m["avatarUrl"] != tt.wantAvatar {
				t.Fatalf("got %d %s", rep.res.StatusCode, rep.body)
			}
		})
	}
}

func TestChangePasswordEndpoint(t *testing.T) {
	hash, err := auth.HashPassword("old-password")
	if err != nil {
		t.Fatal(err)
	}
	e := newAPI(t)
	e.users.users["emp-1"].PasswordHash = &hash

	e.do(t, http.MethodPost, "/api/me/password", `{"currentPassword":"nope","newPassword":"new-password","confirmPassword":"new-password"}`,
		sessionFor(t, apiEmp)).wantError(t, 400, "VALIDATION")
	if e.accounts.password != "" {
		t.Fatal("a refused change must not be saved")
	}
	// emp-2 signed up with Google and has no password yet.
	rep := e.do(t, http.MethodPost, "/api/me/password", `{"newPassword":"new-password","confirmPassword":"new-password"}`, sessionFor(t, apiEmp2))
	if rep.res.StatusCode != 204 || !auth.CheckPassword(e.accounts.password, "new-password") {
		t.Fatalf("got %d %s", rep.res.StatusCode, rep.body)
	}
}

func TestMyBalances(t *testing.T) {
	tests := []struct {
		query      string
		wantStatus int
	}{
		{"", 200}, {"?year=2027", 200}, {"?year=2000", 200}, {"?year=2100", 200},
		{"?year=1999", 400}, {"?year=2101", 400}, {"?year=abc", 400}, {"?year=", 200},
	}
	e := newAPI(t)
	for _, tt := range tests {
		rep := e.do(t, http.MethodGet, "/api/me/balances"+tt.query, "", sessionFor(t, apiEmp))
		if tt.wantStatus != 200 {
			rep.wantError(t, tt.wantStatus, "VALIDATION")
			continue
		}
		var bs []map[string]any
		if err := json.Unmarshal(rep.body, &bs); err != nil || rep.res.StatusCode != 200 || len(bs) != 3 {
			t.Errorf("%q: got %d %s", tt.query, rep.res.StatusCode, rep.body)
		}
	}
}

// ---- requests ----

func TestRequestEndpoints(t *testing.T) {
	e := newAPI(t)
	emp, other, hrs := sessionFor(t, apiEmp), sessionFor(t, apiEmp2), sessionFor(t, apiHRUser)

	// Filters.
	e.do(t, http.MethodGet, "/api/requests?page=x", "", emp).wantError(t, 400, "VALIDATION")
	e.do(t, http.MethodGet, "/api/requests?from=2026-13-01", "", emp).wantError(t, 400, "VALIDATION")
	e.do(t, http.MethodGet, "/api/requests?status=archived", "", emp).wantError(t, 400, "VALIDATION")
	e.do(t, http.MethodGet, "/api/requests?scope=all", "", emp).wantError(t, 403, "FORBIDDEN")
	rep := e.do(t, http.MethodGet, "/api/requests?scope=all&status=pending,approved", "", hrs)
	if m := rep.json(t); rep.res.StatusCode != 200 || m["total"] != float64(1) || m["pageSize"] != float64(10) {
		t.Fatalf("HR list: %d %s", rep.res.StatusCode, rep.body)
	}
	if !strings.Contains(string(rep.body), `"yearly"`) {
		t.Fatal("HR lists carry each person's yearly totals")
	}

	// Detail: owner and HR see it with the requester's age; others get a 404.
	rep = e.do(t, http.MethodGet, "/api/requests/1", "", emp)
	if rep.res.StatusCode != 200 || !strings.Contains(string(rep.body), `"age":27`) {
		t.Fatalf("owner detail: %d %s", rep.res.StatusCode, rep.body)
	}
	e.do(t, http.MethodGet, "/api/requests/1", "", other).wantError(t, 404, "NOT_FOUND")
	if rep := e.do(t, http.MethodGet, "/api/requests/1/overlaps", "", hrs); rep.res.StatusCode != 200 || string(bytes.TrimSpace(rep.body)) != "[]" {
		t.Fatalf("overlaps: %d %s", rep.res.StatusCode, rep.body)
	}

	// Create.
	e.do(t, http.MethodPost, "/api/requests", `{"type":"annual","startDate":"2026-10-20","endDate":"2026-10-18"}`, emp).wantError(t, 400, "VALIDATION")
	e.do(t, http.MethodPost, "/api/requests", `{"type":"annual","startDate":"2026-10-18","endDate":"2026-10-19","status":"approved"}`, emp).wantError(t, 400, "VALIDATION")
	rep = e.do(t, http.MethodPost, "/api/requests", `{"type":"sick","startDate":"2026-10-21","endDate":"2026-10-21","reason":"flu"}`, other)
	if m := rep.json(t); rep.res.StatusCode != 201 || m["status"] != "pending" || m["workingDays"] != float64(1) {
		t.Fatalf("create: %d %s", rep.res.StatusCode, rep.body)
	}

	// Decide: never your own, only HR.
	e.do(t, http.MethodPost, "/api/requests/1/decision", `{"status":"maybe"}`, hrs).wantError(t, 400, "VALIDATION")
	rep = e.do(t, http.MethodPost, "/api/requests/1/decision", `{"status":"approved","note":"ok"}`, hrs)
	if rep.res.StatusCode != 200 || rep.json(t)["status"] != "approved" {
		t.Fatalf("decide: %d %s", rep.res.StatusCode, rep.body)
	}
	e.do(t, http.MethodPost, "/api/requests/1/decision", `{"status":"rejected"}`, hrs).wantError(t, 409, "NOT_PENDING")

	// Cancel: only the owner, only while pending.
	e.do(t, http.MethodPost, "/api/requests/1/cancel", "", emp).wantError(t, 409, "NOT_PENDING")
	e.do(t, http.MethodPost, "/api/requests/2/cancel", "", emp).wantError(t, 404, "NOT_FOUND")
	if rep := e.do(t, http.MethodPost, "/api/requests/2/cancel", "", other); rep.res.StatusCode != 200 || rep.json(t)["status"] != "cancelled" {
		t.Fatalf("cancel: %d %s", rep.res.StatusCode, rep.body)
	}
}

func TestExportRequestsCSV(t *testing.T) {
	e := newAPI(t)
	rep := e.do(t, http.MethodGet, "/api/requests/export.csv?status=pending", "", sessionFor(t, apiHRUser))
	if rep.res.StatusCode != 200 || !strings.HasPrefix(rep.res.Header.Get("Content-Type"), "text/csv") {
		t.Fatalf("got %d %q", rep.res.StatusCode, rep.res.Header.Get("Content-Type"))
	}
	if !strings.HasPrefix(rep.res.Header.Get("Content-Disposition"), `attachment; filename="leave-requests-`) {
		t.Fatalf("disposition %q", rep.res.Header.Get("Content-Disposition"))
	}
	lines := strings.Split(strings.TrimSpace(string(rep.body)), "\n")
	// Nobody decided the pending request, so "Decided by/on" and "Note" are dropped.
	if len(lines) != 2 || strings.TrimSpace(lines[0]) != "Employee,Department,Type,From,To,Working days,Status,Submitted" {
		t.Fatalf("unexpected CSV:\n%s", rep.body)
	}
	if !strings.HasPrefix(lines[1], "Rakib Hasan,,Annual,2026-10-18,2026-10-19,2,pending,") {
		t.Fatalf("unexpected row %q", lines[1])
	}
}

func TestNonEmptyColumns(t *testing.T) {
	rows := [][]string{
		{"a", "", "", "x"},
		{"b", "", "y", ""},
	}
	tests := []struct {
		always int
		rows   [][]string
		want   []int
	}{
		{0, rows, []int{0, 2, 3}},
		{2, rows, []int{0, 1, 2, 3}},
		{1, nil, []int{0}},
		{4, rows, []int{0, 1, 2, 3}},
	}
	for _, tt := range tests {
		got := nonEmptyColumns(4, tt.rows, tt.always)
		if fmt.Sprint(got) != fmt.Sprint(tt.want) {
			t.Errorf("always=%d: got %v, want %v", tt.always, got, tt.want)
		}
	}
	if got := pick([]string{"a", "b", "c"}, []int{2, 0}); fmt.Sprint(got) != "[c a]" {
		t.Errorf("pick: %v", got)
	}
}

// ---- HR ----

func TestHREndpoints(t *testing.T) {
	e := newAPI(t)
	hrs := sessionFor(t, apiHRUser)

	e.do(t, http.MethodPatch, "/api/hr/employees/hr-1", `{"salary":{"monthlyBdt":90000,"effectiveFrom":"2026-10-01"}}`, hrs).wantError(t, 403, "SELF_EDIT")
	e.do(t, http.MethodPatch, "/api/hr/employees/ghost", `{"departmentId":1}`, hrs).wantError(t, 404, "NOT_FOUND")
	e.do(t, http.MethodPatch, "/api/hr/employees/emp-1", `{"name":"Boss"}`, hrs).wantError(t, 400, "VALIDATION")
	e.do(t, http.MethodGet, "/api/hr/employees/ghost", "", hrs).wantError(t, 404, "NOT_FOUND")

	rep := e.do(t, http.MethodGet, "/api/hr/employees/emp-1", "", hrs)
	if m := rep.json(t); rep.res.StatusCode != 200 || m["year"] != float64(2026) || m["salary"] == nil {
		t.Fatalf("employee detail: %d %s", rep.res.StatusCode, rep.body)
	}

	rep = e.do(t, http.MethodGet, "/api/hr/employees?q=rak&page=0", "", hrs)
	if m := rep.json(t); rep.res.StatusCode != 200 || m["total"] != float64(1) || m["page"] != float64(1) {
		t.Fatalf("employees: %d %s", rep.res.StatusCode, rep.body)
	}
	rep = e.do(t, http.MethodGet, "/api/hr/employees/export.csv", "", hrs)
	if rep.res.StatusCode != 200 || !strings.Contains(string(rep.body), "Rakib Hasan,rakib@company.test,,27,,0,22,22") {
		t.Fatalf("employees CSV: %d %s", rep.res.StatusCode, rep.body)
	}
}

func TestDepartmentEndpoints(t *testing.T) {
	e := newAPI(t)
	rep := e.do(t, http.MethodGet, "/api/departments", "", sessionFor(t, apiEmp))
	var ds []domain.Department
	if err := json.Unmarshal(rep.body, &ds); err != nil || rep.res.StatusCode != 200 || len(ds) != 2 {
		t.Fatalf("got %d %s", rep.res.StatusCode, rep.body)
	}

	hrs := sessionFor(t, apiHRUser)
	e.do(t, http.MethodPost, "/api/departments", `{"name":"x"}`, hrs).wantError(t, 400, "VALIDATION")
	e.do(t, http.MethodPost, "/api/departments", `{"name":"finance"}`, hrs).wantError(t, 409, "DEPARTMENT_EXISTS")
	rep = e.do(t, http.MethodPost, "/api/departments", `{"name":"  Legal   Affairs "}`, hrs)
	if m := rep.json(t); rep.res.StatusCode != 201 || m["name"] != "Legal Affairs" {
		t.Fatalf("got %d %s", rep.res.StatusCode, rep.body)
	}
}

// ---- files ----

func uploadRequest(t *testing.T, kind, name string, data []byte) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	if kind != "" {
		_ = mw.WriteField("kind", kind)
	}
	if data != nil {
		fw, err := mw.CreateFormFile("file", name)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = fw.Write(data)
	}
	_ = mw.Close()
	r := httptest.NewRequest(http.MethodPost, "/api/files", &buf)
	r.Header.Set("Content-Type", mw.FormDataContentType())
	return r
}

func TestFileEndpoints(t *testing.T) {
	png := append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 200)...)
	pdf := append([]byte("%PDF-1.7\n"), make([]byte, 200)...)
	e := newAPI(t)
	emp, other, hrs := sessionFor(t, apiEmp), sessionFor(t, apiEmp2), sessionFor(t, apiHRUser)

	e.send(t, uploadRequest(t, "avatar", "a.png", png)).wantError(t, 401, "UNAUTHENTICATED")
	e.send(t, uploadRequest(t, "bogus", "a.png", png), emp).wantError(t, 400, "VALIDATION")
	e.send(t, uploadRequest(t, "avatar", "", nil), emp).wantError(t, 400, "VALIDATION")
	e.send(t, uploadRequest(t, "avatar", "a.pdf", pdf), emp).wantError(t, 400, "VALIDATION")
	notMultipart := httptest.NewRequest(http.MethodPost, "/api/files", strings.NewReader(`{"kind":"avatar"}`))
	e.send(t, notMultipart, emp).wantError(t, 400, "VALIDATION")

	upload := func(kind, name string, data []byte) string {
		rep := e.send(t, uploadRequest(t, kind, name, data), emp)
		m := rep.json(t)
		if rep.res.StatusCode != 201 || m["url"] != "/api/files/"+m["id"].(string) || m["sizeBytes"] != float64(len(data)) {
			t.Fatalf("upload: %d %s", rep.res.StatusCode, rep.body)
		}
		return m["url"].(string)
	}
	avatarURL := upload("avatar", "../../me.png", png)
	attachmentURL := upload("attachment", "note.pdf", pdf)

	// Any signed-in user may load an avatar.
	rep := e.do(t, http.MethodGet, avatarURL, "", other)
	if rep.res.StatusCode != 200 || !bytes.Equal(rep.body, png) {
		t.Fatalf("avatar for another user: %d", rep.res.StatusCode)
	}
	h := rep.res.Header
	if h.Get("Content-Type") != "image/png" || h.Get("X-Content-Type-Options") != "nosniff" ||
		h.Get("Content-Disposition") != "inline; filename*=UTF-8''me.png" {
		t.Fatalf("unexpected headers %v", h)
	}
	e.do(t, http.MethodGet, avatarURL, "").wantError(t, 401, "UNAUTHENTICATED")

	// Attachments: owner and HR only; others get a 404.
	e.do(t, http.MethodGet, attachmentURL, "", other).wantError(t, 404, "NOT_FOUND")
	for _, c := range []*http.Cookie{emp, hrs} {
		if rep := e.do(t, http.MethodGet, attachmentURL, "", c); rep.res.StatusCode != 200 || rep.res.Header.Get("Content-Type") != "application/pdf" {
			t.Fatalf("attachment: %d", rep.res.StatusCode)
		}
	}
}

func TestCreateRequestWithAttachment(t *testing.T) {
	e := newAPI(t)
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("type", "sick")
	_ = mw.WriteField("startDate", "2026-10-21")
	_ = mw.WriteField("endDate", "2026-10-21")
	_ = mw.WriteField("reason", "flu")
	fw, _ := mw.CreateFormFile("attachment", "note.pdf")
	_, _ = fw.Write(append([]byte("%PDF-1.7\n"), make([]byte, 100)...))
	_ = mw.Close()
	r := httptest.NewRequest(http.MethodPost, "/api/requests", &buf)
	r.Header.Set("Content-Type", mw.FormDataContentType())
	rep := e.send(t, r, sessionFor(t, apiEmp2))
	if rep.res.StatusCode != 201 {
		t.Fatalf("got %d %s", rep.res.StatusCode, rep.body)
	}
	if req := e.leave.reqs[2]; req == nil || req.AttachmentID == nil || e.files.rows[*req.AttachmentID].Kind != files.Attachment {
		t.Fatalf("the request must point at the stored attachment: %+v", req)
	}

	var bad bytes.Buffer
	mw = multipart.NewWriter(&bad)
	_ = mw.WriteField("type", "sick")
	_ = mw.WriteField("startDate", "21/10/2026")
	_ = mw.Close()
	r = httptest.NewRequest(http.MethodPost, "/api/requests", &bad)
	r.Header.Set("Content-Type", mw.FormDataContentType())
	e.send(t, r, sessionFor(t, apiEmp2)).wantError(t, 400, "VALIDATION")
}

// ---- calendar ----

func TestCalendarEndpoint(t *testing.T) {
	e := newAPI(t)
	emp := sessionFor(t, apiEmp)
	e.do(t, http.MethodGet, "/api/calendar?month=2026-10&type=holiday", "", emp).wantError(t, 400, "VALIDATION")
	e.do(t, http.MethodGet, "/api/calendar?month=2026-10&department=eng", "", emp).wantError(t, 400, "VALIDATION")

	tests := []struct {
		query     string
		wantMonth string
		wantDays  int
	}{
		{"?month=2026-10&department=1&includePending=false", "2026-10", 35},
		{"", "2026-09", 35},               // no month: this month
		{"?month=October", "2026-09", 35}, // unreadable month: this month
		{"?month=2026-02", "2026-02", 28}, // Feb 2026 starts on a Sunday and ends on a Saturday
	}
	for _, tt := range tests {
		rep := e.do(t, http.MethodGet, "/api/calendar"+tt.query, "", emp)
		var body struct {
			Month string            `json:"month"`
			Days  []json.RawMessage `json:"days"`
		}
		if err := json.Unmarshal(rep.body, &body); err != nil || rep.res.StatusCode != 200 {
			t.Fatalf("%q: %d %s", tt.query, rep.res.StatusCode, rep.body)
		}
		if body.Month != tt.wantMonth || len(body.Days) != tt.wantDays {
			t.Errorf("%q: month %s with %d days, want %s with %d", tt.query, body.Month, len(body.Days), tt.wantMonth, tt.wantDays)
		}
	}
}
