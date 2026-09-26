package httpapi

import (
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
)

// userView is the public shape of a user. It never includes salary.
type userView struct {
	ID          string             `json:"id"`
	Email       string             `json:"email"`
	FirstName   string             `json:"firstName"`
	LastName    string             `json:"lastName"`
	DateOfBirth domain.Date        `json:"dateOfBirth"`
	Age         int                `json:"age"`
	Role        domain.Role        `json:"role"`
	Department  *domain.Department `json:"department"`
	JoinedOn    *domain.Date       `json:"joinedOn"`
	AvatarURL   string             `json:"avatarUrl,omitempty"`
	CreatedAt   time.Time          `json:"createdAt"`
	HasPassword bool               `json:"hasPassword"`
}

func viewUser(u *domain.User, today time.Time) userView {
	return userView{
		ID: u.ID, Email: u.Email, FirstName: u.FirstName, LastName: u.LastName,
		DateOfBirth: domain.DateOf(u.DateOfBirth), Age: domain.Age(u.DateOfBirth, today),
		Role: u.Role, Department: u.Department, JoinedOn: domain.OptionalDate(u.JoinedOn),
		AvatarURL: u.AvatarURL(), CreatedAt: u.CreatedAt, HasPassword: u.PasswordHash != nil,
	}
}
