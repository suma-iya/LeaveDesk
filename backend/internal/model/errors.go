package model

import "errors"

// Sentinel error kinds let services say *what* went wrong without knowing
// about HTTP. The handler layer maps each kind to a status code.
var (
	ErrInvalid      = errors.New("invalid input") // 400
	ErrUnauthorized = errors.New("unauthorized")  // 401
	ErrForbidden    = errors.New("forbidden")     // 403
	ErrNotFound     = errors.New("not found")     // 404
	ErrConflict     = errors.New("conflict")      // 409
)

// Error pairs a kind with a message that is safe to show the user.
// errors.Is(err, ErrConflict) works through Unwrap.
type Error struct {
	Kind    error
	Message string
}

func (e *Error) Error() string { return e.Message }
func (e *Error) Unwrap() error { return e.Kind }

func Invalid(msg string) error      { return &Error{Kind: ErrInvalid, Message: msg} }
func Unauthorized(msg string) error { return &Error{Kind: ErrUnauthorized, Message: msg} }
func Forbidden(msg string) error    { return &Error{Kind: ErrForbidden, Message: msg} }
func NotFound(msg string) error     { return &Error{Kind: ErrNotFound, Message: msg} }
func Conflict(msg string) error     { return &Error{Kind: ErrConflict, Message: msg} }
