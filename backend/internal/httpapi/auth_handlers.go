package httpapi

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"log/slog"
	"net/http"
	"net/url"

	"github.com/suma-iya/leavedesk/backend/internal/account"
	"github.com/suma-iya/leavedesk/backend/internal/domain"
)

// GET /api/auth/bootstrap — lets the Register page show the first-run notice.
func (s *Server) bootstrap(w http.ResponseWriter, r *http.Request) error {
	hasHR, err := s.accounts.HasHR(r.Context())
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, map[string]bool{"hasHR": hasHR, "google": s.google != nil})
	return nil
}

// POST /api/auth/register — creates the account and signs it in.
func (s *Server) register(w http.ResponseWriter, r *http.Request) error {
	var in account.RegisterInput
	if err := decode(r, &in); err != nil {
		return err
	}
	u, err := s.accounts.Register(r.Context(), in)
	if err != nil {
		return err
	}
	if err := s.sessions.Start(w, u); err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, viewUser(u, s.today()))
	return nil
}

// POST /api/auth/login
func (s *Server) login(w http.ResponseWriter, r *http.Request) error {
	var in struct{ Email, Password string }
	if err := decode(r, &in); err != nil {
		return err
	}
	u, err := s.accounts.Login(r.Context(), in.Email, in.Password)
	if err != nil {
		return err
	}
	if err := s.sessions.Start(w, u); err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, viewUser(u, s.today()))
	return nil
}

// POST /api/auth/logout — works even with an expired or missing cookie.
func (s *Server) logout(w http.ResponseWriter, _ *http.Request) error {
	s.sessions.End(w)
	w.WriteHeader(http.StatusNoContent)
	return nil
}

const stateCookie = "ld_oauth_state"

// GET /api/auth/google/start — redirects to Google's consent screen.
func (s *Server) googleStart(w http.ResponseWriter, r *http.Request) error {
	if s.google == nil {
		return domain.NotFound("Google sign-in is not configured.")
	}
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return err
	}
	state := hex.EncodeToString(buf)
	http.SetCookie(w, &http.Cookie{Name: stateCookie, Value: state, Path: "/api/auth/google", MaxAge: 600,
		HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: s.cfg.CookieSecure})
	http.Redirect(w, r, s.google.AuthURL(state), http.StatusFound)
	return nil
}

// GET /api/auth/google/callback — Google sends the browser back here.
// Success signs in and goes to the app; failure goes to /login?error=...
func (s *Server) googleCallback(w http.ResponseWriter, r *http.Request) error {
	if s.google == nil {
		return domain.NotFound("Google sign-in is not configured.")
	}
	back := func(message string) error {
		http.Redirect(w, r, "/login?error="+url.QueryEscape(message), http.StatusFound)
		return nil
	}
	cookie, err := r.Cookie(stateCookie)
	state := r.URL.Query().Get("state")
	if err != nil || state == "" || subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(state)) != 1 {
		return back("Google sign-in expired. Please try again.")
	}
	identity, err := s.google.Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		slog.Warn("google sign-in rejected", "err", err)
		return back("Google sign-in could not be verified.")
	}
	u, err := s.accounts.GoogleSignIn(r.Context(), identity)
	if err != nil {
		if de, ok := domain.AsError(err); ok {
			return back(de.Message)
		}
		return err
	}
	if err := s.sessions.Start(w, u); err != nil {
		return err
	}
	http.Redirect(w, r, "/", http.StatusFound)
	return nil
}

// GET /api/me — the signed-in user plus this year's balance per type.
func (s *Server) me(w http.ResponseWriter, r *http.Request, u *domain.User) error {
	balances, err := s.leave.Balances(r.Context(), u.ID, s.today().Year())
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": viewUser(u, s.today()), "balances": balances})
	return nil
}

// PATCH /api/me — own first/last name, date of birth, avatar.
func (s *Server) updateMe(w http.ResponseWriter, r *http.Request, u *domain.User) error {
	var in account.ProfileInput
	if err := decode(r, &in); err != nil {
		return err
	}
	updated, err := s.accounts.UpdateProfile(r.Context(), u, in, func(fileID string) error {
		return s.files.OwnedAvatar(r.Context(), u, fileID)
	})
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, viewUser(updated, s.today()))
	return nil
}

// POST /api/me/password
func (s *Server) changePassword(w http.ResponseWriter, r *http.Request, u *domain.User) error {
	var in struct{ CurrentPassword, NewPassword, ConfirmPassword string }
	if err := decode(r, &in); err != nil {
		return err
	}
	if err := s.accounts.ChangePassword(r.Context(), u, in.CurrentPassword, in.NewPassword, in.ConfirmPassword); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
