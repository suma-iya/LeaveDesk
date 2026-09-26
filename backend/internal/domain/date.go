package domain

import (
	"fmt"
	"time"
)

// Date is a calendar day that travels as "yyyy-MM-dd" in JSON.
type Date struct{ time.Time }

func ParseDate(s string) (Date, error) {
	t, err := time.Parse(time.DateOnly, s)
	if err != nil {
		return Date{}, fmt.Errorf("invalid date %q, expected yyyy-MM-dd", s)
	}
	return Date{t}, nil
}

func DateOf(t time.Time) Date {
	return Date{time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)}
}

func (d Date) String() string { return d.Format(time.DateOnly) }

func (d Date) MarshalJSON() ([]byte, error) { return []byte(`"` + d.String() + `"`), nil }

func (d *Date) UnmarshalJSON(b []byte) error {
	if len(b) < 2 || b[0] != '"' {
		return fmt.Errorf("dates must be strings in yyyy-MM-dd format")
	}
	parsed, err := ParseDate(string(b[1 : len(b)-1]))
	if err != nil {
		return err
	}
	*d = parsed
	return nil
}

// OptionalDate formats a nullable date for JSON (null when missing).
func OptionalDate(t *time.Time) *Date {
	if t == nil {
		return nil
	}
	d := DateOf(*t)
	return &d
}
