package leave

import (
	"errors"
	"testing"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
)

func day(s string) time.Time   { t, _ := time.Parse(time.DateOnly, s); return t }
func dp(s string) *domain.Date { d := domain.DateOf(day(s)); return &d }

func TestWorkingDays(t *testing.T) {
	tests := []struct {
		name       string
		start, end string
		want       int
	}{
		{"single weekday", "2026-10-06", "2026-10-06", 1},
		{"Sun–Thu week", "2026-10-04", "2026-10-08", 5},
		{"Fri only", "2026-10-09", "2026-10-09", 0},
		{"Fri–Sat weekend", "2026-10-09", "2026-10-10", 0},
		{"Thu to Sun skips Fri+Sat", "2026-10-08", "2026-10-11", 2},
		{"two full weeks", "2026-10-04", "2026-10-17", 10},
		{"end before start", "2026-10-08", "2026-10-04", 0},
		{"across months", "2026-09-29", "2026-10-02", 3},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := WorkingDays(day(tt.start), day(tt.end)); got != tt.want {
				t.Fatalf("got %d, want %d", got, tt.want)
			}
		})
	}
}

func TestFormatRange(t *testing.T) {
	tests := []struct{ start, end, want string }{
		{"2026-10-06", "2026-10-06", "06 Oct 2026"},
		{"2026-10-04", "2026-10-08", "04–08 Oct 2026"},
		{"2026-09-29", "2026-10-02", "29 Sep – 02 Oct 2026"},
		{"2026-12-28", "2027-01-03", "28 Dec 2026 – 03 Jan 2027"},
	}
	for _, tt := range tests {
		if got := FormatRange(day(tt.start), day(tt.end)); got != tt.want {
			t.Errorf("FormatRange(%s, %s) = %q, want %q", tt.start, tt.end, got, tt.want)
		}
	}
}

func TestBalances(t *testing.T) {
	p := Policy{Defaults: map[Type]int{Annual: 16, Casual: 3, Sick: 3}}
	usage := Usage{Annual: {Used: 5, Pending: 5}, Sick: {Used: 1, Pending: 1}}
	bs := p.Balances(map[Type]int{Casual: 5}, usage)

	want := map[Type]Balance{
		Annual: {Type: Annual, Limit: 16, Used: 5, Pending: 5, Available: 6, IsDefault: true},
		Casual: {Type: Casual, Limit: 5, Used: 0, Pending: 0, Available: 5, IsDefault: false},
		Sick:   {Type: Sick, Limit: 3, Used: 1, Pending: 1, Available: 1, IsDefault: true},
	}
	for _, b := range bs {
		if b != want[b.Type] {
			t.Errorf("%s: got %+v, want %+v", b.Type, b, want[b.Type])
		}
	}
}

func TestValidate(t *testing.T) {
	own := []Request{{ID: 2041, Status: Pending, Start: domain.DateOf(day("2026-10-04")), End: domain.DateOf(day("2026-10-08"))}}
	balances := []Balance{
		{Type: Annual, Limit: 16, Used: 5, Pending: 5, Available: 6},
		{Type: Casual, Limit: 3, Used: 2, Available: 1},
		{Type: Sick, Limit: 3, Used: 3, Available: 0},
	}
	tests := []struct {
		name     string
		draft    Draft
		wantDays int
		wantMsg  string // exact message; "" means valid
	}{
		{name: "valid annual", draft: Draft{Type: Annual, StartDate: dp("2026-10-18"), EndDate: dp("2026-10-20")}, wantDays: 3},
		{name: "exactly all that's left", draft: Draft{Type: Annual, StartDate: dp("2026-10-18"), EndDate: dp("2026-10-25")}, wantDays: 6},
		{name: "overlap with own pending", draft: Draft{Type: Annual, StartDate: dp("2026-10-06"), EndDate: dp("2026-10-07")},
			wantMsg: "These dates overlap your pending request LV-2041 (04–08 Oct 2026)."},
		{name: "touching the last day overlaps", draft: Draft{Type: Annual, StartDate: dp("2026-10-08"), EndDate: dp("2026-10-11")},
			wantMsg: "These dates overlap your pending request LV-2041 (04–08 Oct 2026)."},
		{name: "not enough annual", draft: Draft{Type: Annual, StartDate: dp("2026-10-18"), EndDate: dp("2026-10-28")},
			wantMsg: "Not enough Annual leave: 6 days available, 9 requested."},
		{name: "singular day", draft: Draft{Type: Casual, StartDate: dp("2026-10-18"), EndDate: dp("2026-10-19")},
			wantMsg: "Not enough Casual leave: 1 day available, 2 requested."},
		{name: "none left", draft: Draft{Type: Sick, StartDate: dp("2026-10-18"), EndDate: dp("2026-10-18")},
			wantMsg: "Not enough Sick leave: 0 days available, 1 requested."},
		{name: "weekend only", draft: Draft{Type: Annual, StartDate: dp("2026-10-16"), EndDate: dp("2026-10-17")},
			wantMsg: "Pick at least one working day. Fridays and Saturdays are weekends."},
		{name: "end before start", draft: Draft{Type: Annual, StartDate: dp("2026-10-20"), EndDate: dp("2026-10-18")},
			wantMsg: "The last day cannot be before the first day."},
		{name: "missing dates", draft: Draft{Type: Annual}, wantMsg: "Pick your first and last day off."},
		{name: "bad type", draft: Draft{Type: "holiday", StartDate: dp("2026-10-18"), EndDate: dp("2026-10-18")},
			wantMsg: "Choose a leave type: annual, casual or sick."},
		{name: "overlap is checked before balance", draft: Draft{Type: Sick, StartDate: dp("2026-10-05"), EndDate: dp("2026-10-05")},
			wantMsg: "These dates overlap your pending request LV-2041 (04–08 Oct 2026)."},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			days, err := Validate(tt.draft, own, balances)
			if tt.wantMsg == "" {
				if err != nil || days != tt.wantDays {
					t.Fatalf("want %d days and no error, got %d, %v", tt.wantDays, days, err)
				}
				return
			}
			var de *domain.Error
			if !errors.As(err, &de) || de.Message != tt.wantMsg {
				t.Fatalf("want message %q, got %v", tt.wantMsg, err)
			}
		})
	}
}

func TestCanDecide(t *testing.T) {
	hr := &domain.User{ID: "hr-1", Role: domain.RoleHR}
	emp := &domain.User{ID: "emp-1", Role: domain.RoleEmployee}
	tests := []struct {
		name     string
		decider  *domain.User
		request  Request
		wantCode string
	}{
		{"HR decides someone else's pending request", hr, Request{ID: 1, UserID: "emp-1", Status: Pending}, ""},
		{"HR cannot decide their own", hr, Request{ID: 1, UserID: "hr-1", Status: Pending}, "SELF_APPROVAL"},
		{"employees cannot decide", emp, Request{ID: 1, UserID: "emp-2", Status: Pending}, "FORBIDDEN"},
		{"already approved", hr, Request{ID: 1, UserID: "emp-1", Status: Approved}, "NOT_PENDING"},
		{"cancelled", hr, Request{ID: 1, UserID: "emp-1", Status: Cancelled}, "NOT_PENDING"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := CanDecide(tt.decider, &tt.request)
			var de *domain.Error
			if tt.wantCode == "" && err != nil || tt.wantCode != "" && (!errors.As(err, &de) || de.Code != tt.wantCode) {
				t.Fatalf("want code %q, got %v", tt.wantCode, err)
			}
		})
	}
}

func TestValidateLimit(t *testing.T) {
	tests := []struct {
		name                string
		days, used, pending int
		wantMsg             string
	}{
		{"above floor", 10, 2, 1, ""},
		{"exactly the floor", 3, 2, 1, ""},
		{"below the floor", 2, 2, 1, "Casual: can't be below 3: 2 used, 1 pending."},
		{"negative", -1, 0, 0, "Casual limit must be between 0 and 365 days."},
		{"zero with nothing used", 0, 0, 0, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateLimit(Casual, tt.days, tt.used, tt.pending)
			if tt.wantMsg == "" {
				if err != nil {
					t.Fatalf("unexpected %v", err)
				}
				return
			}
			var de *domain.Error
			if !errors.As(err, &de) || de.Message != tt.wantMsg {
				t.Fatalf("want %q, got %v", tt.wantMsg, err)
			}
		})
	}
}

func TestCanChange(t *testing.T) {
	owner := &domain.User{ID: "u1"}
	other := &domain.User{ID: "u2", Role: domain.RoleHR}
	pending := &Request{ID: 5, UserID: "u1", Status: Pending}
	if err := CanChange(owner, pending, "edit"); err != nil {
		t.Fatalf("owner may edit pending: %v", err)
	}
	if err := CanChange(other, pending, "edit"); err == nil {
		t.Fatal("even HR cannot edit someone else's request")
	}
	if err := CanChange(owner, &Request{UserID: "u1", Status: Rejected}, "cancel"); err == nil {
		t.Fatal("rejected requests cannot be cancelled")
	}
}
