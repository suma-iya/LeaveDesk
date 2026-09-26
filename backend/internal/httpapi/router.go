package httpapi

import "net/http"

// Router registers every endpoint on a standard-library ServeMux.
// Go 1.22+ patterns carry the method and {wildcards}, so no router library is needed.
func Router() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	return mux
}
