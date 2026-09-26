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

	mux.Handle("/api/", s.public(func(w http.ResponseWriter, r *http.Request) error {
		writeErr(w, http.StatusNotFound, "NOT_FOUND", "No such endpoint.")
		return nil
	}))

	return logRequests(recoverPanics(mux))
}
