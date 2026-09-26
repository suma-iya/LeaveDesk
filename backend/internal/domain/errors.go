// Package domain holds the types and error codes shared by every layer.
package domain

import (
	"errors"
	"fmt"
	"net/http"
)

// Error is a failure the client should see: an HTTP status, a stable code
// for the UI to switch on, and a human message shown as-is.
type Error struct {
	Status  int
	Code    string
	Message string
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

func newErr(status int, code, format string, args ...any) *Error {
	return &Error{Status: status, Code: code, Message: fmt.Sprintf(format, args...)}
}

func Invalid(format string, args ...any) *Error {
	return newErr(http.StatusBadRequest, "VALIDATION", format, args...)
}
func InvalidCode(code, format string, args ...any) *Error {
	return newErr(http.StatusBadRequest, code, format, args...)
}
func Unauthenticated(format string, args ...any) *Error {
	return newErr(http.StatusUnauthorized, "UNAUTHENTICATED", format, args...)
}
func Forbidden(code, format string, args ...any) *Error {
	return newErr(http.StatusForbidden, code, format, args...)
}
func NotFound(format string, args ...any) *Error {
	return newErr(http.StatusNotFound, "NOT_FOUND", format, args...)
}
func Conflict(code, format string, args ...any) *Error {
	return newErr(http.StatusConflict, code, format, args...)
}

var (
	ErrNotFound = errors.New("not found")        // store: no such row
	ErrConflict = errors.New("unique violation") // store: duplicate key
)

// AsError extracts a *Error from a wrapped error chain.
func AsError(err error) (*Error, bool) {
	var e *Error
	ok := errors.As(err, &e)
	return e, ok
}
