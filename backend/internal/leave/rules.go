package leave

import (
	"fmt"
	"strings"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
)

const MaxReasonLength = 1000

// Draft is what the employee submits (new request or edit).
type Draft struct {
	Type             Type         `json:"type"`
	StartDate        *domain.Date `json:"startDate"`
	EndDate          *domain.Date `json:"endDate"`
	Reason           string       `json:"reason"`
	AttachmentFileID *string      `json:"attachmentFileId"`
}

// Validate checks a draft in a fixed order and returns the first problem:
//  1. type, 2. both dates, 3. start <= end, 4. at least one working day,
//  5. reason length, 6. no overlap with own pending/approved requests,
//  7. enough balance for the type.
//
// own holds the requester's other pending/approved requests (an edited
// request is already excluded); balances are for the start date's year,
// with the edited request's own days already given back.
func Validate(d Draft, own []Request, balances []Balance) (workingDays int, err error) {
	if !d.Type.Valid() {
		return 0, domain.Invalid("Choose a leave type: annual, casual or sick.")
	}
	if d.StartDate == nil || d.EndDate == nil {
		return 0, domain.Invalid("Pick your first and last day off.")
	}
	start, end := d.StartDate.Time, d.EndDate.Time
	if end.Before(start) {
		return 0, domain.Invalid("The last day cannot be before the first day.")
	}
	workingDays = WorkingDays(start, end)
	if workingDays < 1 {
		return 0, domain.InvalidCode("NO_WORKING_DAYS", "Pick at least one working day. Fridays and Saturdays are weekends.")
	}
	if len([]rune(strings.TrimSpace(d.Reason))) > MaxReasonLength {
		return 0, domain.Invalid("Keep the reason under %d characters.", MaxReasonLength)
	}
	for _, r := range own {
		if Overlaps(start, end, r.Start.Time, r.End.Time) {
			return 0, domain.Conflict("OVERLAP", "These dates overlap your %s request %s (%s).",
				r.Status, r.Code(), FormatRange(r.Start.Time, r.End.Time))
		}
	}
	if b := find(balances, d.Type); workingDays > b.Available {
		return 0, domain.InvalidCode("INSUFFICIENT_BALANCE", "Not enough %s leave: %s available, %d requested.",
			d.Type.Label(), Days(max(b.Available, 0)), workingDays)
	}
	return workingDays, nil
}

// CanDecide: HR only, never your own request, and only while pending.
func CanDecide(decider *domain.User, r *Request) error {
	if !decider.IsHR() {
		return domain.Forbidden("FORBIDDEN", "Only HR can approve or reject requests.")
	}
	if r.UserID == decider.ID {
		return domain.Forbidden("SELF_APPROVAL", "You can't decide your own request. Another HR must decide it.")
	}
	if r.Status != Pending {
		return domain.Conflict("NOT_PENDING", "%s is already %s.", r.Code(), r.Status)
	}
	return nil
}

// CanChange: only the requester, and only while pending (edit or cancel).
func CanChange(u *domain.User, r *Request, verb string) error {
	if r.UserID != u.ID {
		return domain.Forbidden("FORBIDDEN", "You can only %s your own requests.", verb)
	}
	if r.Status != Pending {
		return domain.Conflict("NOT_PENDING", "Only pending requests can be %s.", pastTense(verb))
	}
	return nil
}

// ValidateLimit: HR can't set a limit below what is already used + pending.
func ValidateLimit(t Type, days, used, pending int) error {
	if days < 0 || days > 365 {
		return domain.Invalid("%s limit must be between 0 and 365 days.", t.Label())
	}
	if floor := used + pending; days < floor {
		return domain.InvalidCode("LIMIT_TOO_LOW", "%s: can't be below %d: %d used, %d pending.", t.Label(), floor, used, pending)
	}
	return nil
}

// Overlaps: two inclusive date ranges share at least one day.
func Overlaps(aStart, aEnd, bStart, bEnd time.Time) bool {
	return !aEnd.Before(bStart) && !bEnd.Before(aStart)
}

func pastTense(verb string) string {
	if verb == "cancel" {
		return "cancelled"
	}
	return fmt.Sprintf("%sed", strings.TrimSuffix(verb, "e"))
}
