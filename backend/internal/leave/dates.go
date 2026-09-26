package leave

import (
	"fmt"
	"time"
)

// FormatRange writes a range the same way the UI does, always with the year:
// "06 Oct 2026", "04–08 Oct 2026", "29 Sep – 02 Oct 2026", "28 Dec 2026 – 03 Jan 2027".
func FormatRange(start, end time.Time) string {
	const day = "02 Jan 2006"
	switch {
	case start.Equal(end):
		return start.Format(day)
	case start.Year() == end.Year() && start.Month() == end.Month():
		return fmt.Sprintf("%s–%s", start.Format("02"), end.Format(day))
	case start.Year() == end.Year():
		return fmt.Sprintf("%s – %s", start.Format("02 Jan"), end.Format(day))
	default:
		return fmt.Sprintf("%s – %s", start.Format(day), end.Format(day))
	}
}

// Days writes "1 day" / "6 days".
func Days(n int) string {
	if n == 1 {
		return "1 day"
	}
	return fmt.Sprintf("%d days", n)
}
