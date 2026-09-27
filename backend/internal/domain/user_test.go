package domain

import (
	"testing"
	"time"
)

func TestAge(t *testing.T) {
	d := func(s string) time.Time { t, _ := time.Parse(time.DateOnly, s); return t }
	tests := []struct {
		name       string
		dob, today string
		want       int
	}{
		{name: "birthday today", dob: "2008-09-26", today: "2026-09-26", want: 18},
		{name: "day before the birthday", dob: "2008-09-27", today: "2026-09-26", want: 17},
		{name: "day after the birthday", dob: "2008-09-25", today: "2026-09-26", want: 18},
		{name: "birthday month not reached", dob: "2000-10-01", today: "2026-09-30", want: 25},
		{name: "birthday month passed", dob: "2000-08-31", today: "2026-09-01", want: 26},
		{name: "born today", dob: "2026-09-26", today: "2026-09-26", want: 0},
		{name: "new year's eve vs new year's day", dob: "2000-12-31", today: "2026-01-01", want: 25},
		// Feb 29 birthdays: in a common year the birthday counts on Mar 1.
		{name: "leapling on Feb 28 of a common year", dob: "2008-02-29", today: "2026-02-28", want: 17},
		{name: "leapling on Mar 1 of a common year", dob: "2008-02-29", today: "2026-03-01", want: 18},
		{name: "leapling on Feb 29 of a leap year", dob: "2008-02-29", today: "2028-02-29", want: 20},
		{name: "leapling on Feb 28 of a leap year", dob: "2008-02-29", today: "2028-02-28", want: 19},
		{name: "Feb 28 birthday in a leap year", dob: "2008-02-28", today: "2028-02-28", want: 20},
		{name: "future date of birth is negative", dob: "2027-01-01", today: "2026-09-26", want: -1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Age(d(tt.dob), d(tt.today)); got != tt.want {
				t.Fatalf("Age(%s, %s) = %d, want %d", tt.dob, tt.today, got, tt.want)
			}
		})
	}

	t.Run("time of day is ignored", func(t *testing.T) {
		dob := time.Date(2008, 9, 26, 23, 59, 0, 0, time.UTC)
		today := time.Date(2026, 9, 26, 0, 0, 0, 0, time.UTC)
		if got := Age(dob, today); got != 18 {
			t.Fatalf("got %d, want 18", got)
		}
	})
}

func TestIsHRDepartmentDomain(t *testing.T) {
	tests := []struct {
		name string
		want bool
	}{
		{"Human Resources", true},
		{"HUMAN RESOURCES", true},
		{"  human resources\t", true},
		{"HR", true},
		{" hr ", true},
		{"Human  Resources", false}, // inner spaces are not collapsed
		{"Human Resource", false},
		{"HR Tech", false},
		{"H.R.", false},
		{"Engineering", false},
		{"", false},
	}
	for _, tt := range tests {
		if got := IsHRDepartment(tt.name); got != tt.want {
			t.Errorf("IsHRDepartment(%q) = %v, want %v", tt.name, got, tt.want)
		}
	}
}

func TestUserHelpers(t *testing.T) {
	avatar := "0b9c-uuid"
	tests := []struct {
		name     string
		user     User
		wantName string
		wantHR   bool
		wantURL  string
	}{
		{name: "HR with a photo", user: User{FirstName: "Sumaiya", LastName: "Akter", Role: RoleHR, AvatarFileID: &avatar},
			wantName: "Sumaiya Akter", wantHR: true, wantURL: "/api/files/0b9c-uuid"},
		{name: "employee without a photo", user: User{FirstName: "Rakib", LastName: "Hasan", Role: RoleEmployee},
			wantName: "Rakib Hasan"},
		{name: "unknown role is not HR", user: User{FirstName: "A", LastName: "B", Role: "admin"}, wantName: "A B"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.user.FullName(); got != tt.wantName {
				t.Errorf("FullName = %q, want %q", got, tt.wantName)
			}
			if got := tt.user.IsHR(); got != tt.wantHR {
				t.Errorf("IsHR = %v, want %v", got, tt.wantHR)
			}
			if got := tt.user.AvatarURL(); got != tt.wantURL {
				t.Errorf("AvatarURL = %q, want %q", got, tt.wantURL)
			}
		})
	}
}
