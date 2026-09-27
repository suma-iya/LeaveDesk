package httpapi

import (
	"net/http"
	"strings"
)

// Handler registers every endpoint. Go 1.22+ ServeMux patterns carry the
// method and {wildcards}, so the standard library is enough.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Auth
	mux.Handle("GET /api/auth/bootstrap", s.public(s.bootstrap))
	mux.Handle("POST /api/auth/register", s.public(s.register))
	mux.Handle("POST /api/auth/login", s.public(s.login))
	mux.Handle("POST /api/auth/logout", s.public(s.logout))
	mux.Handle("GET /api/auth/google/start", s.public(s.googleStart))
	mux.Handle("GET /api/auth/google/callback", s.public(s.googleCallback))
	mux.Handle("GET /api/auth/google/pending", s.public(s.googlePending))
	mux.Handle("POST /api/auth/google/complete", s.public(s.googleComplete))

	// Me
	mux.Handle("GET /api/me", s.signedIn(s.me))
	mux.Handle("PATCH /api/me", s.signedIn(s.updateMe))
	mux.Handle("POST /api/me/password", s.signedIn(s.changePassword))
	mux.Handle("GET /api/me/balances", s.signedIn(s.myBalances))

	// Leave requests
	mux.Handle("GET /api/requests", s.signedIn(s.listRequests))
	mux.Handle("POST /api/requests", s.signedIn(s.createRequest))
	mux.Handle("GET /api/requests/{id}", s.signedIn(s.getRequest))
	mux.Handle("PATCH /api/requests/{id}", s.signedIn(s.updateRequest))
	mux.Handle("POST /api/requests/{id}/cancel", s.signedIn(s.cancelRequest))
	mux.Handle("POST /api/requests/{id}/decision", s.hrOnly(s.decideRequest))
	mux.Handle("GET /api/requests/{id}/overlaps", s.hrOnly(s.requestOverlaps))
	mux.Handle("GET /api/requests/export.csv", s.hrOnly(s.exportRequests))

	// HR
	mux.Handle("GET /api/hr/employees", s.hrOnly(s.employees))
	mux.Handle("GET /api/hr/employees/export.csv", s.hrOnly(s.exportEmployees))
	mux.Handle("GET /api/hr/employees/{id}", s.hrOnly(s.employee))
	mux.Handle("PATCH /api/hr/employees/{id}", s.hrOnly(s.updateEmployee))
	mux.Handle("GET /api/departments", s.signedIn(s.departments))

	// Calendar and files
	mux.Handle("GET /api/calendar", s.signedIn(s.calendar))
	mux.Handle("POST /api/files", s.signedIn(s.uploadFile))
	mux.Handle("GET /api/files/{id}", s.signedIn(s.getFile))
	mux.Handle("POST /api/departments", s.hrOnly(s.createDepartment))

	mux.Handle("/api/", s.public(func(w http.ResponseWriter, r *http.Request) error {
		if allowed := allowedMethods(mux, r); len(allowed) > 0 {
			w.Header().Set("Allow", strings.Join(allowed, ", "))
			writeErr(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "This endpoint does not accept "+r.Method+".")
			return nil
		}
		writeErr(w, http.StatusNotFound, "NOT_FOUND", "No such endpoint.")
		return nil
	}))

	return logRequests(recoverPanics(mux))
}

// allowedMethods lists the methods a real route accepts at r's path. The
// /api/ catch-all matches every method, so ServeMux never answers 405 itself.
func allowedMethods(mux *http.ServeMux, r *http.Request) []string {
	var allowed []string
	for _, method := range []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		probe := r.Clone(r.Context())
		probe.Method = method
		if _, pattern := mux.Handler(probe); pattern != "" && pattern != "/api/" {
			allowed = append(allowed, method)
		}
	}
	return allowed
}
