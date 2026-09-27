package domain

import (
	"errors"
	"fmt"
	"net/http"
	"testing"
)

func TestErrorConstructors(t *testing.T) {
	tests := []struct {
		name       string
		err        *Error
		wantStatus int
		wantCode   string
		wantMsg    string
	}{
		{"Invalid", Invalid("Enter %s.", "a name"), http.StatusBadRequest, "VALIDATION", "Enter a name."},
		{"InvalidCode", InvalidCode("NO_WORKING_DAYS", "Pick %d day.", 1), http.StatusBadRequest, "NO_WORKING_DAYS", "Pick 1 day."},
		{"Unauthenticated", Unauthenticated("Please sign in."), http.StatusUnauthorized, "UNAUTHENTICATED", "Please sign in."},
		{"Forbidden", Forbidden("SELF_EDIT", "Not %s.", "yours"), http.StatusForbidden, "SELF_EDIT", "Not yours."},
		{"NotFound", NotFound("Request %d not found.", 7), http.StatusNotFound, "NOT_FOUND", "Request 7 not found."},
		{"Conflict", Conflict("OVERLAP", "Overlaps %q.", "x"), http.StatusConflict, "OVERLAP", `Overlaps "x".`},
		{"a literal percent is kept with %s", Invalid("%s", "100% sure"), http.StatusBadRequest, "VALIDATION", "100% sure"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := tt.err
			if e.Status != tt.wantStatus || e.Code != tt.wantCode || e.Message != tt.wantMsg {
				t.Fatalf("got %d %s %q, want %d %s %q", e.Status, e.Code, e.Message, tt.wantStatus, tt.wantCode, tt.wantMsg)
			}
			if got, want := e.Error(), tt.wantCode+": "+tt.wantMsg; got != want {
				t.Fatalf("Error() = %q, want %q", got, want)
			}
		})
	}
}

func TestAsError(t *testing.T) {
	base := Conflict("LAST_HR", "Only one HR.")
	tests := []struct {
		name   string
		err    error
		wantOK bool
	}{
		{"direct", base, true},
		{"wrapped once", fmt.Errorf("update: %w", base), true},
		{"wrapped twice", fmt.Errorf("tx: %w", fmt.Errorf("update: %w", base)), true},
		{"joined", errors.Join(errors.New("other"), base), true},
		{"plain error", errors.New("boom"), false},
		{"store sentinel is not a client error", fmt.Errorf("user: %w", ErrNotFound), false},
		{"nil", nil, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := AsError(tt.err)
			if ok != tt.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tt.wantOK)
			}
			if ok && got != base {
				t.Fatalf("want the original *Error, got %+v", got)
			}
			if !ok && got != nil {
				t.Fatalf("want nil on failure, got %+v", got)
			}
		})
	}
}

func TestSentinelErrors(t *testing.T) {
	if !errors.Is(fmt.Errorf("file by id: %w", ErrNotFound), ErrNotFound) {
		t.Fatal("ErrNotFound must survive wrapping")
	}
	if !errors.Is(fmt.Errorf("insert: %w", ErrConflict), ErrConflict) {
		t.Fatal("ErrConflict must survive wrapping")
	}
	if errors.Is(ErrNotFound, ErrConflict) {
		t.Fatal("the sentinels must be distinct")
	}
}
