package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/account"
	"github.com/suma-iya/leavedesk/backend/internal/auth"
	"github.com/suma-iya/leavedesk/backend/internal/config"
	"github.com/suma-iya/leavedesk/backend/internal/domain"
	"github.com/suma-iya/leavedesk/backend/internal/leave"
)

// UserLoader is what the auth middleware needs to reload the caller.
type UserLoader interface {
	UserByID(ctx context.Context, id string) (*domain.User, error)
}

// Server holds the services the handlers call. Handlers stay thin: decode,
// call one service method, encode.
type Server struct {
	cfg      *config.Config
	sessions *auth.Sessions
	google   *auth.Google // nil when Google sign-in is not configured
	users    UserLoader
	accounts *account.Service
	leave    *leave.Service
	today    func() time.Time
}

// Deps are the services the HTTP layer calls.
type Deps struct {
	Users    UserLoader
	Accounts *account.Service
	Leave    *leave.Service
}

func NewServer(cfg *config.Config, d Deps) *Server {
	s := &Server{
		cfg:      cfg,
		sessions: auth.NewSessions(cfg.JWTSecret, cfg.SessionTTL, cfg.CookieSecure),
		users:    d.Users,
		accounts: d.Accounts,
		leave:    d.Leave,
		today:    func() time.Time { return domain.DateOf(time.Now().In(cfg.Location)).Time },
	}
	if cfg.GoogleEnabled() {
		s.google = auth.NewGoogle(cfg.GoogleClientID, cfg.GoogleClientSecret, cfg.GoogleRedirectURL, cfg.AllowedEmailDomains)
	}
	return s
}

// handlerFunc returns an error instead of writing it; fail() turns it into JSON.
type handlerFunc func(w http.ResponseWriter, r *http.Request) error

// userFunc also receives the signed-in user, reloaded from the database.
type userFunc func(w http.ResponseWriter, r *http.Request, u *domain.User) error

func (s *Server) public(h handlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := h(w, r); err != nil {
			s.fail(w, r, err)
		}
	})
}

// signedIn allows any account, including pending ones.
func (s *Server) signedIn(h userFunc) http.Handler {
	return s.withUser(func(w http.ResponseWriter, r *http.Request, u *domain.User) error { return h(w, r, u) })
}

// active is the pending-account gate: until HR approves them, users get
// 403 ACCOUNT_PENDING from everything except sign-out and /me.
func (s *Server) active(h userFunc) http.Handler {
	return s.withUser(func(w http.ResponseWriter, r *http.Request, u *domain.User) error {
		if !u.IsActive() {
			return domain.Forbidden("ACCOUNT_PENDING", "Your account is waiting for HR approval.")
		}
		return h(w, r, u)
	})
}

func (s *Server) hrOnly(h userFunc) http.Handler {
	return s.active(func(w http.ResponseWriter, r *http.Request, u *domain.User) error {
		if !u.IsHR() {
			return domain.Forbidden("FORBIDDEN", "Only HR can do this.")
		}
		return h(w, r, u)
	})
}

// withUser verifies the session cookie and reloads the user, so a role or
// status change (or a deleted account) applies on the very next request.
func (s *Server) withUser(h userFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := s.sessions.Read(r)
		if err != nil {
			s.fail(w, r, domain.Unauthenticated("Please sign in."))
			return
		}
		u, err := s.users.UserByID(r.Context(), id)
		if errors.Is(err, domain.ErrNotFound) {
			s.sessions.End(w)
			s.fail(w, r, domain.Unauthenticated("Your account no longer exists."))
			return
		}
		if err != nil {
			s.fail(w, r, err)
			return
		}
		if err := h(w, r, u); err != nil {
			s.fail(w, r, err)
		}
	})
}

// fail maps an error to {"error": CODE, "message": ...}. Unknown errors are
// logged and hidden behind a generic 500.
func (s *Server) fail(w http.ResponseWriter, r *http.Request, err error) {
	if de, ok := domain.AsError(err); ok {
		writeErr(w, de.Status, de.Code, de.Message)
		return
	}
	if errors.Is(err, domain.ErrNotFound) {
		writeErr(w, http.StatusNotFound, "NOT_FOUND", "Not found.")
		return
	}
	slog.Error("request failed", "method", r.Method, "path", r.URL.Path, "err", err)
	writeErr(w, http.StatusInternalServerError, "INTERNAL", "Something went wrong. Please try again.")
}

// decode reads a JSON body (max 1 MB) and rejects unknown fields.
func decode(r *http.Request, dst any) error {
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return domain.Invalid("Invalid request body: %v", err)
	}
	return nil
}

func pathID(r *http.Request) string { return r.PathValue("id") }
