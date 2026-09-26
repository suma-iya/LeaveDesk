package leave

import (
	"testing"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
)

func TestGridRange(t *testing.T) {
	from, to := GridRange(day("2026-10-15"))
	if from.Format("2006-01-02") != "2026-09-27" || to.Format("2006-01-02") != "2026-10-31" {
		t.Fatalf("October 2026 grid should be 27 Sep – 31 Oct, got %s – %s", from, to)
	}
}

func TestCalendarDaysSkipsWeekends(t *testing.T) {
	r := Request{ID: 1, Status: Approved, Start: domain.DateOf(day("2026-10-07")), End: domain.DateOf(day("2026-10-11"))}
	days := CalendarDays(day("2026-10-07"), day("2026-10-11"), []Request{r})
	want := map[string]int{"2026-10-07": 1, "2026-10-08": 1, "2026-10-09": 0, "2026-10-10": 0, "2026-10-11": 1}
	for _, d := range days {
		if got := len(d.People); got != want[d.Date.String()] {
			t.Errorf("%s: %d people, want %d", d.Date, got, want[d.Date.String()])
		}
	}
}
