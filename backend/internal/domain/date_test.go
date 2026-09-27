package domain

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestParseDate(t *testing.T) {
	tests := []struct {
		name    string
		in      string
		want    string // "" = error
		wantErr bool
	}{
		{name: "plain day", in: "2026-09-26", want: "2026-09-26"},
		{name: "leap day in a leap year", in: "2024-02-29", want: "2024-02-29"},
		{name: "leap day in a common year", in: "2025-02-29", wantErr: true},
		{name: "day 31 in a 30-day month", in: "2026-09-31", wantErr: true},
		{name: "month 13", in: "2026-13-01", wantErr: true},
		{name: "no zero padding", in: "2026-9-26", wantErr: true},
		{name: "day first", in: "26-09-2026", wantErr: true},
		{name: "timestamp is not a date", in: "2026-09-26T10:00:00Z", wantErr: true},
		{name: "leading space", in: " 2026-09-26", wantErr: true},
		{name: "empty", in: "", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d, err := ParseDate(tt.in)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("want an error, got %s", d)
				}
				if !strings.Contains(err.Error(), "expected yyyy-MM-dd") || !strings.Contains(err.Error(), `"`+tt.in+`"`) {
					t.Fatalf("error should quote the input and the expected format, got %q", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if d.String() != tt.want || d.Location() != time.UTC || d.Hour() != 0 {
				t.Fatalf("got %s (%s), want %s at UTC midnight", d, d.Location(), tt.want)
			}
		})
	}
}

func TestDateOf(t *testing.T) {
	dhaka := time.FixedZone("BST", 6*60*60)
	tests := []struct {
		name string
		in   time.Time
		want string
	}{
		{name: "UTC midday", in: time.Date(2026, 9, 26, 12, 30, 0, 0, time.UTC), want: "2026-09-26"},
		{name: "keeps the calendar day of the time's own zone", in: time.Date(2026, 9, 27, 2, 0, 0, 0, dhaka), want: "2026-09-27"},
		{name: "last nanosecond of the year", in: time.Date(2026, 12, 31, 23, 59, 59, 999999999, time.UTC), want: "2026-12-31"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d := DateOf(tt.in)
			if d.String() != tt.want {
				t.Fatalf("got %s, want %s", d, tt.want)
			}
			if d.Location() != time.UTC || d.Hour() != 0 || d.Minute() != 0 || d.Nanosecond() != 0 {
				t.Fatalf("want UTC midnight, got %v", d.Time)
			}
		})
	}
}

func TestDateJSON(t *testing.T) {
	type payload struct {
		Day      Date  `json:"day"`
		Optional *Date `json:"optional"`
	}

	t.Run("marshal", func(t *testing.T) {
		d, _ := ParseDate("2026-02-03")
		got, err := json.Marshal(payload{Day: d})
		if err != nil {
			t.Fatal(err)
		}
		if string(got) != `{"day":"2026-02-03","optional":null}` {
			t.Fatalf("got %s", got)
		}
	})

	tests := []struct {
		name    string
		body    string
		want    string
		wantNil bool // Optional stays nil
		wantErr bool
	}{
		{name: "valid", body: `{"day":"2026-10-06","optional":"2026-10-07"}`, want: "2026-10-06"},
		{name: "null optional stays nil", body: `{"day":"2026-10-06","optional":null}`, want: "2026-10-06", wantNil: true},
		{name: "number is refused", body: `{"day":20261006}`, wantErr: true},
		{name: "impossible date", body: `{"day":"2026-02-30"}`, wantErr: true},
		{name: "timestamp is refused", body: `{"day":"2026-10-06T00:00:00Z"}`, wantErr: true},
		{name: "empty string", body: `{"day":""}`, wantErr: true},
		{name: "bool", body: `{"day":true}`, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var p payload
			err := json.Unmarshal([]byte(tt.body), &p)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("want an error, got %+v", p)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if p.Day.String() != tt.want {
				t.Fatalf("day %s, want %s", p.Day, tt.want)
			}
			if (p.Optional == nil) != tt.wantNil {
				t.Fatalf("optional = %v, want nil=%v", p.Optional, tt.wantNil)
			}
		})
	}

	t.Run("round trip", func(t *testing.T) {
		in, _ := ParseDate("2028-02-29")
		b, _ := json.Marshal(in)
		var out Date
		if err := json.Unmarshal(b, &out); err != nil || !out.Equal(in.Time) {
			t.Fatalf("got %v, %v; want %v", out, err, in)
		}
	})

	t.Run("UnmarshalJSON called directly with short or unquoted input", func(t *testing.T) {
		for _, raw := range []string{``, `"`, `null`, `2026-10-06`} {
			var d Date
			if err := d.UnmarshalJSON([]byte(raw)); err == nil {
				t.Errorf("%q: want an error, got %s", raw, d)
			}
		}
	})
}

func TestOptionalDate(t *testing.T) {
	if got := OptionalDate(nil); got != nil {
		t.Fatalf("nil time must give nil, got %v", got)
	}
	joined := time.Date(2024, 3, 1, 18, 45, 0, 0, time.UTC)
	got := OptionalDate(&joined)
	if got == nil || got.String() != "2024-03-01" || got.Hour() != 0 {
		t.Fatalf("got %v, want 2024-03-01 at midnight", got)
	}
	b, _ := json.Marshal(struct {
		J *Date `json:"joinedOn"`
	}{OptionalDate(nil)})
	if string(b) != `{"joinedOn":null}` {
		t.Fatalf("a missing date must encode as null, got %s", b)
	}
}
