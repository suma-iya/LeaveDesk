package handler

import (
	"net/http"

	"github.com/suma-iya/employee-leave-tracker/backend/internal/auth"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/middleware"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/model"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/respond"
)

// Routes registers every endpoint. Go 1.22+ ServeMux patterns include the
// HTTP method and path wildcards like {id}, so no router library is needed.
func (h *Handler) Routes(tokens *auth.TokenManager) http.Handler {
	mux := http.NewServeMux()

	authenticated := middleware.Authenticate(tokens)
	managerOnly := func(fn http.HandlerFunc) http.Handler {
		return authenticated(middleware.RequireRole(model.RoleManager)(fn))
	}
	anyUser := func(fn http.HandlerFunc) http.Handler { return authenticated(fn) }

	// Public
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		respond.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/auth/config", h.AuthConfig)
	mux.HandleFunc("POST /api/auth/login", h.Login)
	mux.HandleFunc("POST /api/auth/google", h.GoogleLogin)

	// Any logged-in user
	mux.Handle("GET /api/auth/me", anyUser(h.Me))
	mux.Handle("GET /api/leaves/mine", anyUser(h.MyLeaves))
	mux.Handle("GET /api/leaves/mine/summary", anyUser(h.MySummary))
	mux.Handle("POST /api/leaves", anyUser(h.ApplyLeave))
	mux.Handle("DELETE /api/leaves/{id}", anyUser(h.CancelLeave))

	// Manager only
	mux.Handle("GET /api/dashboard", managerOnly(h.Dashboard))
	mux.Handle("GET /api/leaves", managerOnly(h.ListLeaves))
	mux.Handle("PATCH /api/leaves/{id}/status", managerOnly(h.ReviewLeave))
	mux.Handle("GET /api/employees", managerOnly(h.ListEmployees))
	mux.Handle("POST /api/employees", managerOnly(h.CreateEmployee))
	mux.Handle("GET /api/employees/{id}", managerOnly(h.GetEmployee))
	mux.Handle("PUT /api/employees/{id}", managerOnly(h.UpdateEmployee))
	mux.Handle("DELETE /api/employees/{id}", managerOnly(h.DeleteEmployee))

	// Unknown /api paths get a JSON 404 rather than the default text one.
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		respond.Error(w, http.StatusNotFound, "route not found")
	})

	// Outermost first: every request is logged, and panics are recovered.
	return middleware.Logger(middleware.Recover(mux))
}
