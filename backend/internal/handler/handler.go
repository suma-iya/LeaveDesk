// Package handler is the HTTP layer: it decodes requests, calls a service
// and encodes the result. It contains no business rules and no SQL.
package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/suma-iya/employee-leave-tracker/backend/internal/middleware"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/model"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/respond"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/service"
)

type Handler struct {
	auth           *service.AuthService
	employees      *service.EmployeeService
	leaves         *service.LeaveService
	googleClientID string
}

func New(auth *service.AuthService, employees *service.EmployeeService, leaves *service.LeaveService, googleClientID string) *Handler {
	return &Handler{auth: auth, employees: employees, leaves: leaves, googleClientID: googleClientID}
}

const maxBodyBytes = 1 << 20 // 1 MB

// decodeJSON reads a JSON body, rejecting unknown fields and oversized bodies.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return model.Invalid(fmt.Sprintf("invalid JSON body: %v", err))
	}
	return nil
}

// pathID reads a numeric {id} from the URL pattern.
func pathID(r *http.Request) (int64, error) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		return 0, model.Invalid("id must be a positive integer")
	}
	return id, nil
}

// currentUserID reads the user id from the JWT claims put in the context
// by the Authenticate middleware.
func currentUserID(r *http.Request) int64 {
	claims, ok := middleware.ClaimsFrom(r.Context())
	if !ok {
		return 0
	}
	id, _ := claims.UserID()
	return id
}

// writeError maps a domain error kind to an HTTP status. Unknown errors
// become 500 and are logged, but their details are never sent to the client.
func writeError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, model.ErrInvalid):
		status = http.StatusBadRequest
	case errors.Is(err, model.ErrUnauthorized):
		status = http.StatusUnauthorized
	case errors.Is(err, model.ErrForbidden):
		status = http.StatusForbidden
	case errors.Is(err, model.ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, model.ErrConflict):
		status = http.StatusConflict
	}

	if status == http.StatusInternalServerError {
		log.Printf("internal error: %v", err)
		respond.Error(w, status, "internal server error")
		return
	}

	var appErr *model.Error
	if errors.As(err, &appErr) {
		respond.Error(w, status, appErr.Message)
		return
	}
	respond.Error(w, status, http.StatusText(status))
}
