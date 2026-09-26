package httpapi

import "net/http"

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

	// Me
	mux.Handle("GET /api/me", s.signedIn(s.me))
	mux.Handle("PATCH /api/me", s.active(s.updateMe))
	mux.Handle("POST /api/me/password", s.active(s.changePassword))
	mux.Handle("GET /api/me/balances", s.active(s.myBalances))

	// Leave requests
	mux.Handle("GET /api/requests", s.active(s.listRequests))
	mux.Handle("POST /api/requests", s.active(s.createRequest))
	mux.Handle("GET /api/requests/{id}", s.active(s.getRequest))
	mux.Handle("PATCH /api/requests/{id}", s.active(s.updateRequest))
	mux.Handle("POST /api/requests/{id}/cancel", s.active(s.cancelRequest))
	mux.Handle("POST /api/requests/{id}/decision", s.hrOnly(s.decideRequest))
	mux.Handle("GET /api/requests/{id}/overlaps", s.hrOnly(s.requestOverlaps))
	mux.Handle("GET /api/requests/export.csv", s.hrOnly(s.exportRequests))

	// HR
	mux.Handle("GET /api/hr/registrations", s.hrOnly(s.registrations))
	mux.Handle("POST /api/hr/registrations/{id}/approve", s.hrOnly(s.approveRegistration))
	mux.Handle("POST /api/hr/registrations/{id}/reject", s.hrOnly(s.rejectRegistration))
	mux.Handle("GET /api/hr/employees", s.hrOnly(s.employees))
	mux.Handle("GET /api/hr/employees/export.csv", s.hrOnly(s.exportEmployees))
	mux.Handle("GET /api/hr/employees/{id}", s.hrOnly(s.employee))
	mux.Handle("PATCH /api/hr/employees/{id}", s.hrOnly(s.updateEmployee))
	mux.Handle("GET /api/departments", s.active(s.departments))

	// Calendar and files
	mux.Handle("GET /api/calendar", s.active(s.calendar))
	mux.Handle("POST /api/files", s.active(s.uploadFile))
	mux.Handle("GET /api/files/{id}", s.signedIn(s.getFile))
	mux.Handle("POST /api/departments", s.hrOnly(s.createDepartment))

	mux.Handle("/api/", s.public(func(w http.ResponseWriter, r *http.Request) error {
		writeErr(w, http.StatusNotFound, "NOT_FOUND", "No such endpoint.")
		return nil
	}))

	return logRequests(recoverPanics(mux))
}
