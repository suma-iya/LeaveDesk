package domain

import (
	"strings"
	"time"
)

type Role string

const (
	RoleHR       Role = "hr"
	RoleEmployee Role = "employee"
)

type Department struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type User struct {
	ID           string      `json:"id"`
	Email        string      `json:"email"`
	FirstName    string      `json:"firstName"`
	LastName     string      `json:"lastName"`
	DateOfBirth  time.Time   `json:"-"`
	Role         Role        `json:"role"`
	Department   *Department `json:"department"`
	JoinedOn     *time.Time  `json:"-"`
	AvatarFileID *string     `json:"-"`
	CreatedAt    time.Time   `json:"createdAt"`

	PasswordHash *string `json:"-"`
	GoogleSub    *string `json:"-"`
}

// IsHRDepartment reports whether a department is Human Resources. Its
// members are HR: moving someone in makes them HR, moving them out makes
// them an employee again.
func IsHRDepartment(name string) bool {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "human resources", "hr":
		return true
	}
	return false
}

func (u *User) FullName() string { return u.FirstName + " " + u.LastName }
func (u *User) IsHR() bool       { return u.Role == RoleHR }

// Age in whole years on the given day. Age is never stored.
func Age(dob, today time.Time) int {
	years := today.Year() - dob.Year()
	if today.Month() < dob.Month() || (today.Month() == dob.Month() && today.Day() < dob.Day()) {
		years--
	}
	return years
}

// AvatarURL is where the browser loads the user's photo, or "" for initials.
func (u *User) AvatarURL() string {
	if u.AvatarFileID == nil {
		return ""
	}
	return "/api/files/" + *u.AvatarFileID
}
