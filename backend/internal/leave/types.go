// Package leave holds the leave policy and every rule about requests.
// Rules are pure functions over plain data; Service applies them and talks
// to storage through the Store interface, so all of it is unit-testable.
package leave

import (
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
)

type Type string

const (
	Annual Type = "annual"
	Casual Type = "casual"
	Sick   Type = "sick"
)

var Types = []Type{Annual, Casual, Sick}

func (t Type) Valid() bool { return t == Annual || t == Casual || t == Sick }

// Label is the capitalised name used in messages: "Annual".
func (t Type) Label() string {
	switch t {
	case Annual:
		return "Annual"
	case Casual:
		return "Casual"
	case Sick:
		return "Sick"
	}
	return string(t)
}

type Status string

const (
	Pending   Status = "pending"
	Approved  Status = "approved"
	Rejected  Status = "rejected"
	Cancelled Status = "cancelled"
)

func (s Status) Valid() bool {
	return s == Pending || s == Approved || s == Rejected || s == Cancelled
}

// Person is the requester or decider as shown next to a request.
type Person struct {
	ID          string             `json:"id"`
	FirstName   string             `json:"firstName"`
	LastName    string             `json:"lastName"`
	AvatarURL   string             `json:"avatarUrl,omitempty"`
	Department  *domain.Department `json:"department"`
	DateOfBirth *domain.Date       `json:"-"`
	JoinedOn    *domain.Date       `json:"joinedOn,omitempty"`
	Age         *int               `json:"age,omitempty"` // filled on detail pages only
}

type FileMeta struct {
	ID        string `json:"id"`
	URL       string `json:"url"`
	Name      string `json:"name"`
	Mime      string `json:"mime"`
	SizeBytes int    `json:"sizeBytes"`
}

type Request struct {
	ID           int64       `json:"id"`
	UserID       string      `json:"-"`
	Type         Type        `json:"type"`
	Start        domain.Date `json:"startDate"`
	End          domain.Date `json:"endDate"`
	WorkingDays  int         `json:"workingDays"`
	Reason       string      `json:"reason"`
	AttachmentID *string     `json:"-"`
	Status       Status      `json:"status"`
	SubmittedAt  time.Time   `json:"submittedAt"`
	DecidedAt    *time.Time  `json:"decidedAt"`
	DecidedByID  *string     `json:"-"`
	DecisionNote string      `json:"decisionNote"`

	Employee   Person    `json:"employee"`
	DecidedBy  *Person   `json:"decidedBy"`
	Attachment *FileMeta `json:"attachment"`
}

// Year the request counts against: the year it starts in.
func (r *Request) Year() int { return r.Start.Year() }

// Balance of one leave type for one person and year.
type Balance struct {
	Type      Type `json:"type"`
	Limit     int  `json:"limit"`
	Used      int  `json:"used"`    // approved working days
	Pending   int  `json:"pending"` // working days waiting for HR
	Available int  `json:"available"`
	IsDefault bool `json:"isDefault"` // no per-employee override for this year
}

// Usage is used/pending days per type, as summed by the store.
type Usage map[Type]struct{ Used, Pending int }
