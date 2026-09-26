package leave

import "time"

// Weekend in Bangladesh: Friday and Saturday. The frontend's lib/leave.ts
// uses the same rule so both sides always agree on the count.
var Weekend = map[time.Weekday]bool{time.Friday: true, time.Saturday: true}

// IsWeekend reports whether the date falls on a Friday or Saturday.
func IsWeekend(d time.Time) bool { return Weekend[d.Weekday()] }

// WorkingDays counts the dates from start to end (inclusive) that are not
// weekend days. It returns 0 when end is before start.
func WorkingDays(start, end time.Time) int {
	start, end = dateOnly(start), dateOnly(end)
	count := 0
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		if !IsWeekend(d) {
			count++
		}
	}
	return count
}

func dateOnly(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}
