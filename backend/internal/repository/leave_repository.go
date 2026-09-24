package repository

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/suma-iya/employee-leave-tracker/backend/internal/model"
)

type LeaveRepository struct{ db *pgxpool.Pool }

func NewLeaveRepository(db *pgxpool.Pool) *LeaveRepository { return &LeaveRepository{db: db} }

// Every leave read joins users so the response carries the employee's name.
const leaveSelect = `
	SELECT l.id, l.user_id, u.name, u.email, l.leave_type, l.start_date, l.end_date,
	       (l.end_date - l.start_date + 1) AS days,
	       l.reason, l.status, l.manager_comment, l.reviewed_by, l.reviewed_at, l.created_at
	FROM leaves l
	JOIN users u ON u.id = l.user_id`

func scanLeave(row pgx.Row) (*model.Leave, error) {
	var l model.Leave
	err := row.Scan(&l.ID, &l.UserID, &l.EmployeeName, &l.EmployeeEmail, &l.Type,
		&l.StartDate, &l.EndDate, &l.Days, &l.Reason, &l.Status, &l.ManagerComment,
		&l.ReviewedBy, &l.ReviewedAt, &l.CreatedAt)
	if err != nil {
		return nil, translate(err)
	}
	return &l, nil
}

func (r *LeaveRepository) Create(ctx context.Context, l *model.Leave) (*model.Leave, error) {
	var id int64
	err := r.db.QueryRow(ctx, `
		INSERT INTO leaves (user_id, leave_type, start_date, end_date, reason)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id`,
		l.UserID, l.Type, l.StartDate, l.EndDate, l.Reason,
	).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("insert leave: %w", translate(err))
	}
	return r.GetByID(ctx, id)
}

func (r *LeaveRepository) GetByID(ctx context.Context, id int64) (*model.Leave, error) {
	l, err := scanLeave(r.db.QueryRow(ctx, leaveSelect+` WHERE l.id = $1`, id))
	if err != nil {
		return nil, fmt.Errorf("get leave %d: %w", id, err)
	}
	return l, nil
}

// List builds the WHERE clause from the filter. Values are still passed as
// numbered parameters; only the placeholder numbers are formatted in.
// timezone decides which calendar day a created_at timestamp falls on.
func (r *LeaveRepository) List(ctx context.Context, f model.LeaveFilter, timezone string) ([]model.Leave, error) {
	var conditions []string
	var args []any
	add := func(condition string, value any) {
		args = append(args, value)
		conditions = append(conditions, fmt.Sprintf(condition, len(args)))
	}

	if f.UserID != 0 {
		add("l.user_id = $%d", f.UserID)
	}
	if f.Status != "" {
		add("l.status = $%d", f.Status)
	}
	if f.CreatedOn != nil {
		args = append(args, timezone, *f.CreatedOn)
		conditions = append(conditions, fmt.Sprintf(
			"(l.created_at AT TIME ZONE $%d)::date = $%d::date", len(args)-1, len(args)))
	}

	query := leaveSelect
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY l.created_at DESC"

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list leaves: %w", err)
	}
	defer rows.Close()

	leaves := []model.Leave{}
	for rows.Next() {
		l, err := scanLeave(rows)
		if err != nil {
			return nil, fmt.Errorf("scan leave: %w", err)
		}
		leaves = append(leaves, *l)
	}
	return leaves, rows.Err()
}

// HasOverlap reports whether the user already has a PENDING or APPROVED
// leave that shares at least one day with [start, end].
func (r *LeaveRepository) HasOverlap(ctx context.Context, userID int64, start, end model.Date) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM leaves
			WHERE user_id = $1
			  AND status IN ('PENDING', 'APPROVED')
			  AND start_date <= $3::date
			  AND end_date   >= $2::date
		)`, userID, start, end).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check overlap: %w", err)
	}
	return exists, nil
}

// Review sets the status only if the leave is still PENDING. Doing the
// check inside the UPDATE makes it atomic: two managers clicking at the
// same time cannot both succeed.
func (r *LeaveRepository) Review(ctx context.Context, id int64, status model.LeaveStatus, comment string, reviewerID int64) (bool, error) {
	tag, err := r.db.Exec(ctx, `
		UPDATE leaves
		SET status = $1, manager_comment = $2, reviewed_by = $3, reviewed_at = now()
		WHERE id = $4 AND status = 'PENDING'`,
		status, comment, reviewerID, id)
	if err != nil {
		return false, fmt.Errorf("review leave %d: %w", id, err)
	}
	return tag.RowsAffected() == 1, nil
}

// DeletePending removes a leave only if it belongs to the user and is
// still PENDING. It reports whether a row was deleted.
func (r *LeaveRepository) DeletePending(ctx context.Context, id, userID int64) (bool, error) {
	tag, err := r.db.Exec(ctx,
		`DELETE FROM leaves WHERE id = $1 AND user_id = $2 AND status = 'PENDING'`, id, userID)
	if err != nil {
		return false, fmt.Errorf("delete leave %d: %w", id, err)
	}
	return tag.RowsAffected() == 1, nil
}

// StatusCounts counts leaves per status; userID 0 means all employees.
func (r *LeaveRepository) StatusCounts(ctx context.Context, userID int64) (model.StatusCounts, error) {
	var c model.StatusCounts
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*) FILTER (WHERE status = 'PENDING'),
		       COUNT(*) FILTER (WHERE status = 'APPROVED'),
		       COUNT(*) FILTER (WHERE status = 'REJECTED'),
		       COUNT(*)
		FROM leaves
		WHERE ($1::bigint = 0 OR user_id = $1)`, userID,
	).Scan(&c.Pending, &c.Approved, &c.Rejected, &c.Total)
	if err != nil {
		return c, fmt.Errorf("count leaves by status: %w", err)
	}
	return c, nil
}

// CountCreatedOn counts requests submitted on a calendar day in timezone.
func (r *LeaveRepository) CountCreatedOn(ctx context.Context, day model.Date, timezone string) (int, error) {
	var n int
	err := r.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM leaves WHERE (created_at AT TIME ZONE $1)::date = $2::date`,
		timezone, day).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count leaves created on %s: %w", day, err)
	}
	return n, nil
}

// CountOnLeave counts distinct employees with an APPROVED leave covering day.
func (r *LeaveRepository) CountOnLeave(ctx context.Context, day model.Date) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(DISTINCT user_id) FROM leaves
		WHERE status = 'APPROVED' AND $1::date BETWEEN start_date AND end_date`, day).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count on leave %s: %w", day, err)
	}
	return n, nil
}

// ApprovedDaysInYear sums approved leave days, clipping leaves that cross
// the year boundary so only days inside the year are counted.
func (r *LeaveRepository) ApprovedDaysInYear(ctx context.Context, userID int64, year int) (int, error) {
	var days int
	err := r.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(
		         LEAST(end_date, make_date($2, 12, 31)) - GREATEST(start_date, make_date($2, 1, 1)) + 1
		       ), 0)
		FROM leaves
		WHERE user_id = $1 AND status = 'APPROVED'
		  AND start_date <= make_date($2, 12, 31)
		  AND end_date   >= make_date($2, 1, 1)`, userID, year).Scan(&days)
	if err != nil {
		return 0, fmt.Errorf("sum approved days: %w", err)
	}
	return days, nil
}
