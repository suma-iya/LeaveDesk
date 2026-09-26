package leave

import (
	"context"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
)

type CalendarFilter struct {
	DepartmentID   int
	Type           Type
	IncludePending bool
}

// Away is one person on leave on a day. It never includes balances.
type Away struct {
	RequestID  int64              `json:"requestId"`
	UserID     string             `json:"userId"`
	FirstName  string             `json:"firstName"`
	LastName   string             `json:"lastName"`
	AvatarURL  string             `json:"avatarUrl,omitempty"`
	Department *domain.Department `json:"department"`
	Type       Type               `json:"type"`
	StartDate  domain.Date        `json:"startDate"`
	EndDate    domain.Date        `json:"endDate"`
	Status     Status             `json:"status"`
}

type CalendarDay struct {
	Date   domain.Date `json:"date"`
	People []Away      `json:"people"`
}

// CalendarStore is the one extra query the calendar needs.
type CalendarStore interface {
	RequestsBetween(ctx context.Context, from, to time.Time, f CalendarFilter) ([]Request, error)
}

// GridRange is the Sunday-to-Saturday span shown for a month.
func GridRange(month time.Time) (from, to time.Time) {
	first := time.Date(month.Year(), month.Month(), 1, 0, 0, 0, 0, time.UTC)
	last := first.AddDate(0, 1, -1)
	from = first.AddDate(0, 0, -int(first.Weekday()))
	to = last.AddDate(0, 0, 6-int(last.Weekday()))
	return from, to
}

// CalendarDays lists who is away on each working day in [from, to].
// Weekend days are always empty: nobody "uses" leave on Fri/Sat.
func CalendarDays(from, to time.Time, requests []Request) []CalendarDay {
	days := []CalendarDay{}
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		day := CalendarDay{Date: domain.DateOf(d), People: []Away{}}
		if !IsWeekend(d) {
			for _, r := range requests {
				if Overlaps(d, d, r.Start.Time, r.End.Time) {
					day.People = append(day.People, Away{RequestID: r.ID, UserID: r.UserID,
						FirstName: r.Employee.FirstName, LastName: r.Employee.LastName, AvatarURL: r.Employee.AvatarURL,
						Department: r.Employee.Department, Type: r.Type, StartDate: r.Start, EndDate: r.End, Status: r.Status})
				}
			}
		}
		days = append(days, day)
	}
	return days
}

// Calendar returns the grid for a month ("2026-10").
func (s *Service) Calendar(ctx context.Context, cs CalendarStore, month time.Time, f CalendarFilter) ([]CalendarDay, error) {
	if f.Type != "" && !f.Type.Valid() {
		return nil, domain.Invalid("Unknown leave type %q.", f.Type)
	}
	from, to := GridRange(month)
	requests, err := cs.RequestsBetween(ctx, from, to, f)
	if err != nil {
		return nil, err
	}
	return CalendarDays(from, to, requests), nil
}
