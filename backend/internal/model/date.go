package model

import (
	"database/sql/driver"
	"fmt"
	"time"
)

const DateLayout = "2006-01-02"

// Date is a calendar day with no time or timezone. It travels as
// "YYYY-MM-DD" in JSON and maps to a Postgres DATE column.
type Date struct{ time.Time }

func ParseDate(s string) (Date, error) {
	t, err := time.Parse(DateLayout, s)
	if err != nil {
		return Date{}, fmt.Errorf("invalid date %q, expected YYYY-MM-DD", s)
	}
	return Date{t}, nil
}

// DateOf returns the calendar day of t in its own location.
func DateOf(t time.Time) Date {
	return Date{time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)}
}

func (d Date) String() string { return d.Format(DateLayout) }

func (d Date) MarshalJSON() ([]byte, error) { return []byte(`"` + d.String() + `"`), nil }

func (d *Date) UnmarshalJSON(b []byte) error {
	if len(b) < 2 || b[0] != '"' || b[len(b)-1] != '"' {
		return fmt.Errorf("date must be a string in YYYY-MM-DD format")
	}
	parsed, err := ParseDate(string(b[1 : len(b)-1]))
	if err != nil {
		return err
	}
	*d = parsed
	return nil
}

// Value lets pgx write a Date into a DATE column.
func (d Date) Value() (driver.Value, error) { return d.String(), nil }

// Scan lets pgx read a DATE column into a Date.
func (d *Date) Scan(src any) error {
	t, ok := src.(time.Time)
	if !ok {
		return fmt.Errorf("cannot scan %T into Date", src)
	}
	*d = DateOf(t)
	return nil
}
