package handler

import (
	"net/http"

	"github.com/suma-iya/employee-leave-tracker/backend/internal/respond"
)

// GET /api/auth/config — public settings the login page needs.
func (h *Handler) AuthConfig(w http.ResponseWriter, r *http.Request) {
	respond.JSON(w, http.StatusOK, map[string]string{"google_client_id": h.googleClientID})
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// POST /api/auth/login
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	session, err := h.auth.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		writeError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, session)
}

type googleLoginRequest struct {
	Credential string `json:"credential"` // the ID token from Google Identity Services
}

// POST /api/auth/google
func (h *Handler) GoogleLogin(w http.ResponseWriter, r *http.Request) {
	var req googleLoginRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	session, err := h.auth.GoogleLogin(r.Context(), req.Credential)
	if err != nil {
		writeError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, session)
}

// GET /api/auth/me
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	user, err := h.auth.Me(r.Context(), currentUserID(r))
	if err != nil {
		writeError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, user)
}
