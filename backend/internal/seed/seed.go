// Package seed loads the demo data set: departments, one HR, one employee
// with history, fourteen more employees (two who joined this week), and
// October 2026 leave that makes 04–08 Oct busy.
package seed

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/suma-iya/leavedesk/backend/internal/leave"
)

// Password for every demo account.
const Password = "password123"

//go:embed assets/travel-plan.pdf
var travelPlanPDF []byte

var departments = []string{"Engineering", "Finance", "Human Resources", "Quality Assurance", "Operations", "Design", "Support"}

type person struct {
	key, first, last, email, department string
	dob, joined                         string
	salary                              int64
	hr                                  bool
}

var people = []person{
	{key: "farhana", first: "Farhana", last: "Islam", email: "hr@company.test", department: "Human Resources", dob: "1988-03-12", joined: "2017-02-01", salary: 150000, hr: true},
	{key: "nusrat", first: "Nusrat", last: "Jahan", email: "nusrat.j@company.test", department: "Engineering", dob: "1997-05-20", joined: "2022-03-01", salary: 85000},
	{key: "tanvir", first: "Tanvir", last: "Ahmed", email: "tanvir.a@company.test", department: "Engineering", dob: "1994-11-02", joined: "2020-07-15", salary: 110000},
	{key: "tasnim", first: "Tasnim", last: "Akter", email: "tasnim.a@company.test", department: "Engineering", dob: "2000-01-09", joined: "2024-02-01", salary: 70000},
	{key: "imran", first: "Imran", last: "Hossain", email: "imran.h@company.test", department: "Finance", dob: "1991-08-30", joined: "2019-01-10", salary: 95000},
	{key: "kamrul", first: "Kamrul", last: "Islam", email: "kamrul.i@company.test", department: "Finance", dob: "1996-04-17", joined: "2023-05-02", salary: 68000},
	{key: "sadia", first: "Sadia", last: "Rahman", email: "sadia.r@company.test", department: "Design", dob: "1998-02-25", joined: "2023-01-16", salary: 78000},
	{key: "nadia", first: "Nadia", last: "Sultana", email: "nadia.s@company.test", department: "Design", dob: "1995-09-14", joined: "2021-06-01", salary: 88000},
	{key: "shafiq", first: "Shafiq", last: "Uddin", email: "shafiq.u@company.test", department: "Quality Assurance", dob: "1992-12-05", joined: "2020-03-09", salary: 82000},
	{key: "mitu", first: "Mitu", last: "Das", email: "mitu.d@company.test", department: "Quality Assurance", dob: "1999-07-21", joined: "2024-08-01", salary: 60000},
	{key: "mehnaz", first: "Mehnaz", last: "Karim", email: "mehnaz.k@company.test", department: "Operations", dob: "1989-10-11", joined: "2018-09-03", salary: 120000},
	{key: "jahid", first: "Jahid", last: "Hasan", email: "jahid.h@company.test", department: "Operations", dob: "2001-03-28", joined: "2025-01-05", salary: 55000},
	{key: "arif", first: "Arif", last: "Chowdhury", email: "arif.c@company.test", department: "Support", dob: "2002-06-19", joined: "2025-04-01", salary: 48000},
	{key: "rumana", first: "Rumana", last: "Begum", email: "rumana.b@company.test", department: "Support", dob: "1990-01-30", joined: "2019-11-11", salary: 72000},
	// Signed up this week: no leave history yet.
	{key: "rakib", first: "Rakib", last: "Hasan", email: "rakib.h@company.test", department: "Quality Assurance", dob: "1998-12-02", joined: "2026-09-23", salary: 58000},
	{key: "lamia", first: "Lamia", last: "Chowdhury", email: "lamia.c@company.test", department: "Design", dob: "2000-10-15", joined: "2026-09-25", salary: 62000},
}

type request struct {
	id                int64
	who, kind         string
	start, end        string
	status, submitted string
	reason, note      string
	decided           string
	attachPDF         bool
}

var requests = []request{
	// Nusrat: 5 annual + 2 casual + 1 sick used, 6 days pending, one rejection with a PDF.
	{1702, "nusrat", "sick", "2026-01-07", "2026-01-07", "approved", "2026-01-07", "Migraine, stayed home.", "Get well soon.", "2026-01-08", false},
	{1744, "nusrat", "casual", "2026-02-10", "2026-02-11", "approved", "2026-02-01", "Moving to a new flat.", "", "2026-02-02", false},
	{1790, "nusrat", "annual", "2026-03-15", "2026-03-19", "approved", "2026-02-25", "Eid holidays with family in Rajshahi.", "Approved. Please hand over the release checklist to Tanvir.", "2026-02-27", false},
	{1851, "nusrat", "annual", "2026-05-03", "2026-05-07", "rejected", "2026-04-18", "Attending my cousin’s wedding in Chattogram. Travel plan attached.", "The v3 launch is that week and the team needs you. Please pick dates after 20 May and resubmit.", "2026-04-21", true},
	{2041, "nusrat", "annual", "2026-10-04", "2026-10-08", "pending", "2026-09-20", "Family trip to Sylhet for my parents’ anniversary.", "", "", false},
	{2047, "nusrat", "sick", "2026-10-21", "2026-10-21", "pending", "2026-09-24", "Minor dental surgery; the dentist advised one day of rest.", "", "", false},

	// Waiting for HR, clustered on 04–08 Oct.
	{2043, "tanvir", "annual", "2026-10-04", "2026-10-07", "pending", "2026-09-21", "Visiting my grandparents in Barishal.", "", "", false},
	{2044, "imran", "casual", "2026-10-05", "2026-10-06", "pending", "2026-09-22", "Bank and land registry appointments.", "", "", false},
	{2045, "sadia", "annual", "2026-10-06", "2026-10-08", "pending", "2026-09-22", "Short break after the design sprint.", "", "", false},
	{2046, "mitu", "sick", "2026-09-28", "2026-09-29", "pending", "2026-09-24", "Fever and sore throat.", "", "", false},
	{2048, "mehnaz", "annual", "2026-10-12", "2026-10-15", "pending", "2026-09-23", "Trip to Cox’s Bazar.", "", "", false},
	{2049, "arif", "casual", "2026-10-19", "2026-10-19", "pending", "2026-09-25", "Renewing my passport.", "", "", false},
	{2050, "tasnim", "annual", "2026-11-01", "2026-11-05", "pending", "2026-09-25", "Conference and a few days off in Kathmandu.", "", "", false},
	{2051, "kamrul", "annual", "2026-10-25", "2026-10-29", "pending", "2026-09-23", "Brother’s wedding.", "", "", false},

	// Already decided around the same week.
	{2030, "nadia", "annual", "2026-10-04", "2026-10-08", "approved", "2026-09-10", "Pre-planned holiday.", "", "2026-09-11", false},
	{2031, "shafiq", "casual", "2026-10-07", "2026-10-07", "approved", "2026-09-12", "Child’s school event.", "", "2026-09-13", false},
	{2032, "rumana", "annual", "2026-10-05", "2026-10-08", "approved", "2026-09-08", "Family visit to Rangpur.", "Arif covers the queue.", "2026-09-09", false},
	{2033, "jahid", "sick", "2026-10-01", "2026-10-01", "approved", "2026-09-18", "Doctor’s appointment.", "", "2026-09-18", false},
	{2034, "tasnim", "casual", "2026-10-07", "2026-10-08", "approved", "2026-09-15", "Moving house.", "", "2026-09-16", false},
	{2035, "kamrul", "annual", "2026-10-06", "2026-10-08", "rejected", "2026-09-14", "Short holiday.", "Quarter-end close that week. Please pick another week.", "2026-09-15", false},

	// Earlier in 2026, so yearly balances vary (a few are nearly used up).
	{1710, "tanvir", "annual", "2026-01-18", "2026-01-22", "approved", "2026-01-05", "Winter trip.", "", "2026-01-06", false},
	{1760, "tanvir", "annual", "2026-04-05", "2026-04-09", "approved", "2026-03-20", "Family visit.", "", "2026-03-21", false},
	{1801, "tanvir", "annual", "2026-06-14", "2026-06-15", "approved", "2026-06-01", "Long weekend.", "", "2026-06-02", false},
	{1805, "tanvir", "casual", "2026-07-01", "2026-07-02", "approved", "2026-06-28", "Personal errands.", "", "2026-06-29", false},
	{1712, "imran", "annual", "2026-02-22", "2026-02-26", "approved", "2026-02-08", "Family event.", "", "2026-02-09", false},
	{1812, "imran", "sick", "2026-07-12", "2026-07-13", "approved", "2026-07-12", "Stomach flu.", "", "2026-07-12", false},
	{1720, "sadia", "annual", "2026-08-09", "2026-08-11", "approved", "2026-07-28", "Design conference.", "", "2026-07-29", false},
	{1730, "mitu", "annual", "2026-04-05", "2026-04-09", "approved", "2026-03-22", "Trip home.", "", "2026-03-23", false},
	{1740, "mehnaz", "annual", "2026-01-18", "2026-01-22", "approved", "2026-01-04", "Winter holiday.", "", "2026-01-05", false},
	{1741, "mehnaz", "annual", "2026-07-12", "2026-07-16", "approved", "2026-06-30", "Family trip.", "", "2026-07-01", false},
	{1742, "mehnaz", "sick", "2026-08-24", "2026-08-26", "approved", "2026-08-24", "Dengue fever.", "", "2026-08-24", false},
	{1750, "kamrul", "annual", "2026-02-22", "2026-02-26", "approved", "2026-02-10", "Travel.", "", "2026-02-11", false},
	{1751, "kamrul", "annual", "2026-06-14", "2026-06-16", "approved", "2026-06-01", "Travel.", "", "2026-06-02", false},
	{1753, "kamrul", "casual", "2026-09-06", "2026-09-07", "approved", "2026-09-01", "Personal.", "", "2026-09-02", false},
	{1763, "nadia", "annual", "2026-03-15", "2026-03-16", "approved", "2026-03-01", "Long weekend.", "", "2026-03-02", false},
	{1770, "shafiq", "annual", "2026-08-09", "2026-08-13", "approved", "2026-07-25", "Holiday.", "", "2026-07-26", false},
	{1780, "rumana", "annual", "2026-02-22", "2026-02-26", "approved", "2026-02-10", "Umrah.", "", "2026-02-11", false},
	{1781, "rumana", "sick", "2026-05-12", "2026-05-13", "approved", "2026-05-12", "Back pain.", "", "2026-05-12", false},
	{1785, "jahid", "casual", "2026-06-24", "2026-06-24", "approved", "2026-06-20", "University exam.", "", "2026-06-21", false},
	{1786, "arif", "casual", "2026-08-19", "2026-08-19", "rejected", "2026-08-15", "Personal work.", "Two teammates are already off that day.", "2026-08-16", false},
	{1787, "tasnim", "annual", "2026-07-12", "2026-07-16", "approved", "2026-06-29", "Visiting family in Khulna.", "", "2026-06-30", false},
}

var ErrNotEmpty = errors.New("database already has users; run `leavedesk seed --reset` to replace everything with demo data")

// Run loads the demo data. With reset=false it refuses to touch a database
// that already has users; with reset=true it wipes every table first.
func Run(ctx context.Context, pool *pgxpool.Pool, uploadDir string, loc *time.Location, reset bool) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(Password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash demo password: %w", err)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after Commit

	var users int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&users); err != nil {
		return fmt.Errorf("count users: %w", err)
	}
	if users > 0 && !reset {
		return ErrNotEmpty
	}
	if reset {
		if _, err := tx.Exec(ctx, `TRUNCATE audit_log, salaries, leave_requests, leave_limits, files, users, departments RESTART IDENTITY CASCADE`); err != nil {
			return fmt.Errorf("truncate: %w", err)
		}
	}

	deptIDs := map[string]int{}
	for _, name := range departments {
		var id int
		if err := tx.QueryRow(ctx, `INSERT INTO departments (name) VALUES ($1) RETURNING id`, name).Scan(&id); err != nil {
			return fmt.Errorf("insert department %s: %w", name, err)
		}
		deptIDs[name] = id
	}

	userIDs := map[string]string{}
	for _, p := range people {
		role := "employee"
		if p.hr {
			role = "hr"
		}
		var id string
		err := tx.QueryRow(ctx, `
			INSERT INTO users (email, password_hash, first_name, last_name, date_of_birth, role, department_id, joined_on, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ($8::date + time '09:00') AT TIME ZONE $9)
			RETURNING id`,
			p.email, string(hash), p.first, p.last, p.dob, role, deptIDs[p.department], p.joined, loc.String(),
		).Scan(&id)
		if err != nil {
			return fmt.Errorf("insert user %s: %w", p.email, err)
		}
		userIDs[p.key] = id

		// Everyone who joined before 2026 got a raise on 1 Jan, so history shows two rows.
		if p.joined < "2026-01-01" {
			if _, err := tx.Exec(ctx, `INSERT INTO salaries (user_id, monthly_bdt, effective_from) VALUES ($1, $2, $3)`,
				id, p.salary*9/10, p.joined); err != nil {
				return fmt.Errorf("insert salary: %w", err)
			}
		}
		from := max(p.joined, "2026-01-01")
		if _, err := tx.Exec(ctx, `INSERT INTO salaries (user_id, monthly_bdt, effective_from) VALUES ($1, $2, $3)`,
			id, p.salary, from); err != nil {
			return fmt.Errorf("insert salary: %w", err)
		}
	}

	pdfID, err := savePDF(ctx, tx, uploadDir, userIDs["nusrat"])
	if err != nil {
		return err
	}

	for _, r := range requests {
		start, _ := time.Parse(time.DateOnly, r.start)
		end, _ := time.Parse(time.DateOnly, r.end)
		var decidedAt, decidedBy, note, attachment any
		if r.status != "pending" {
			decidedAt, decidedBy = r.decided+" 15:00", userIDs["farhana"]
			if r.note != "" {
				note = r.note
			}
		}
		if r.attachPDF {
			attachment = pdfID
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO leave_requests (id, user_id, type, start_date, end_date, working_days, reason, attachment_file_id,
			                            status, submitted_at, decided_at, decided_by, decision_note)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
			        ($10::timestamp AT TIME ZONE $14), ($11::timestamp AT TIME ZONE $14), $12, $13)`,
			r.id, userIDs[r.who], r.kind, r.start, r.end, leave.WorkingDays(start, end), r.reason, attachment,
			r.status, r.submitted+" 10:00", decidedAt, decidedBy, note, loc.String())
		if err != nil {
			return fmt.Errorf("insert request LV-%d: %w", r.id, err)
		}
	}
	// New requests continue after the highest seeded id.
	if _, err := tx.Exec(ctx, `SELECT setval('leave_requests_id_seq', (SELECT max(id) FROM leave_requests))`); err != nil {
		return fmt.Errorf("advance request ids: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	if reset {
		removeOrphans(uploadDir, pdfID)
	}
	slog.Info("demo data loaded", "users", len(people), "requests", len(requests), "password", Password)
	return nil
}

func savePDF(ctx context.Context, tx pgx.Tx, uploadDir, ownerID string) (string, error) {
	var id string
	err := tx.QueryRow(ctx, `
		INSERT INTO files (owner_id, kind, mime, size_bytes, original_name)
		VALUES ($1, 'attachment', 'application/pdf', $2, 'travel-plan.pdf') RETURNING id`,
		ownerID, len(travelPlanPDF)).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("insert file: %w", err)
	}
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		return "", fmt.Errorf("create upload dir: %w", err)
	}
	if err := os.WriteFile(filepath.Join(uploadDir, id), travelPlanPDF, 0o644); err != nil {
		return "", fmt.Errorf("write file: %w", err)
	}
	return id, nil
}

// removeOrphans deletes uploaded files left over from before a reset.
func removeOrphans(uploadDir, keep string) {
	entries, err := os.ReadDir(uploadDir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if !e.IsDir() && e.Name() != keep {
			_ = os.Remove(filepath.Join(uploadDir, e.Name()))
		}
	}
}
