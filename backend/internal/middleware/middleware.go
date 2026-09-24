// Package middleware wraps handlers with cross-cutting behaviour:
// request logging, panic recovery, JWT authentication and role checks.
package middleware

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/suma-iya/employee-leave-tracker/backend/internal/auth"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/model"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/respond"
)

// statusRecorder remembers the status code so Logger can print it.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

// Logger prints one line per request: method, path, status, duration.
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		log.Printf("%s %s %d %s", r.Method, r.URL.Path, rec.status, time.Since(start).Round(time.Microsecond))
	})
}

// Recover turns a panic in any handler into a 500 instead of a crash.
func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				log.Printf("panic serving %s %s: %v", r.Method, r.URL.Path, v)
				respond.Error(w, http.StatusInternalServerError, "internal server error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

type contextKey struct{}

// UserLookup is the one repository method Authenticate needs.
type UserLookup interface {
	GetByID(ctx context.Context, id int64) (*model.User, error)
}

// Authenticate requires a valid "Authorization: Bearer <jwt>" header.
// After checking the signature it also loads the user, so a deleted
// account is locked out at once and the role always comes from the
// database, not from a token that may be up to JWT_TTL old.
func Authenticate(tokens *auth.TokenManager, users UserLookup) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
			if !ok || raw == "" {
				respond.Error(w, http.StatusUnauthorized, "missing bearer token")
				return
			}
			claims, err := tokens.Parse(raw)
			if err != nil {
				respond.Error(w, http.StatusUnauthorized, "invalid or expired token")
				return
			}
			userID, _ := claims.UserID() // already validated by Parse
			user, err := users.GetByID(r.Context(), userID)
			if errors.Is(err, model.ErrNotFound) {
				respond.Error(w, http.StatusUnauthorized, "account no longer exists")
				return
			}
			if err != nil {
				log.Printf("authenticate: %v", err)
				respond.Error(w, http.StatusInternalServerError, "internal server error")
				return
			}
			claims.Role = user.Role
			ctx := context.WithValue(r.Context(), contextKey{}, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireRole must run after Authenticate. It returns 403 when the
// authenticated user does not have the given role.
func RequireRole(role model.Role) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := ClaimsFrom(r.Context())
			if !ok || claims.Role != role {
				respond.Error(w, http.StatusForbidden, "this action requires the "+string(role)+" role")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func ClaimsFrom(ctx context.Context) (*auth.Claims, bool) {
	claims, ok := ctx.Value(contextKey{}).(*auth.Claims)
	return claims, ok
}
