package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
	"github.com/suma-iya/leavedesk/backend/internal/leave"
)

// Every request read joins the requester, their department, the decider
// and the attachment's metadata.
const requestSelect = `
	SELECT r.id, r.user_id, r.type, r.start_date, r.end_date, r.working_days, coalesce(r.reason, ''),
	       r.attachment_file_id, r.status, r.submitted_at, r.decided_at, r.decided_by, coalesce(r.decision_note, ''),
	       u.first_name, u.last_name, u.avatar_file_id, u.department_id, d.name, u.date_of_birth, u.joined_on,
	       dec.first_name, dec.last_name, dec.avatar_file_id,
	       f.original_name, f.mime, f.size_bytes
	FROM leave_requests r
	JOIN users u ON u.id = r.user_id
	LEFT JOIN departments d ON d.id = u.department_id
	LEFT JOIN users dec ON dec.id = r.decided_by
	LEFT JOIN files f ON f.id = r.attachment_file_id`

func avatarURL(id *string) string {
	if id == nil {
		return ""
	}
	return "/api/files/" + *id
}

func scanRequest(row pgx.Row) (*leave.Request, error) {
	var r leave.Request
	var start, end, dob time.Time
	var joined *time.Time
	var empAvatar, deciderFirst, deciderLast, deciderAvatar, deptName, fileName, fileMime *string
	var deptID, fileSize *int
	err := row.Scan(&r.ID, &r.UserID, &r.Type, &start, &end, &r.WorkingDays, &r.Reason,
		&r.AttachmentID, &r.Status, &r.SubmittedAt, &r.DecidedAt, &r.DecidedByID, &r.DecisionNote,
		&r.Employee.FirstName, &r.Employee.LastName, &empAvatar, &deptID, &deptName, &dob, &joined,
		&deciderFirst, &deciderLast, &deciderAvatar,
		&fileName, &fileMime, &fileSize)
	if err != nil {
		return nil, err
	}
	r.Start, r.End = domain.DateOf(start), domain.DateOf(end)
	r.Employee.ID = r.UserID
	r.Employee.AvatarURL = avatarURL(empAvatar)
	if deptID != nil && deptName != nil {
		r.Employee.Department = &domain.Department{ID: *deptID, Name: *deptName}
	}
	birth := domain.DateOf(dob)
	r.Employee.DateOfBirth = &birth
	r.Employee.JoinedOn = domain.OptionalDate(joined)
	if r.DecidedByID != nil && deciderFirst != nil {
		r.DecidedBy = &leave.Person{ID: *r.DecidedByID, FirstName: *deciderFirst, LastName: *deciderLast, AvatarURL: avatarURL(deciderAvatar)}
	}
	if r.AttachmentID != nil && fileName != nil {
		r.Attachment = &leave.FileMeta{ID: *r.AttachmentID, URL: "/api/files/" + *r.AttachmentID,
			Name: *fileName, Mime: *fileMime, SizeBytes: *fileSize}
	}
	return &r, nil
}

func collectRequests(rows pgx.Rows) ([]leave.Request, error) {
	defer rows.Close()
	out := []leave.Request{}
	for rows.Next() {
		r, err := scanRequest(rows)
		if err != nil {
			return nil, fmt.Errorf("scan request: %w", err)
		}
		out = append(out, *r)
	}
	return out, rows.Err()
}

func (s *Store) RequestByID(ctx context.Context, id int64) (*leave.Request, error) {
	r, err := scanRequest(s.db.QueryRow(ctx, requestSelect+` WHERE r.id = $1`, id))
	return r, translate(err, "request by id")
}

// ListRequests builds the WHERE clause from the filter. Values always go
// in as numbered parameters; only the placeholder numbers are formatted.
func (s *Store) ListRequests(ctx context.Context, f leave.Filter) ([]leave.Request, int, error) {
	var where []string
	var args []any
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, fmt.Sprintf(cond, len(args)))
	}
	if f.UserID != "" {
		add("r.user_id = $%d", f.UserID)
	}
	if len(f.Statuses) > 0 {
		statuses := make([]string, len(f.Statuses))
		for i, st := range f.Statuses {
			statuses[i] = string(st)
		}
		add("r.status = ANY($%d)", statuses)
	}
	if f.Type != "" {
		add("r.type = $%d", f.Type)
	}
	if f.DepartmentID != 0 {
		add("u.department_id = $%d", f.DepartmentID)
	}
	if f.Year != 0 {
		add("extract(year FROM r.start_date) = $%d", f.Year)
	}
	if f.From != nil {
		add("r.end_date >= $%d", f.From.Time)
	}
	if f.To != nil {
		add("r.start_date <= $%d", f.To.Time)
	}
	if f.Query != "" {
		args = append(args, "%"+escapeLike(f.Query)+"%")
		n := len(args)
		where = append(where, fmt.Sprintf(`(u.first_name || ' ' || u.last_name ILIKE $%d OR r.reason ILIKE $%d OR r.decision_note ILIKE $%d)`, n, n, n))
	}
	clause := ""
	if len(where) > 0 {
		clause = " WHERE " + strings.Join(where, " AND ")
	}

	var total int
	countSQL := `SELECT count(*) FROM leave_requests r JOIN users u ON u.id = r.user_id` + clause
	if err := s.db.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count requests: %w", err)
	}

	// Pending work is shown soonest-first; history newest-first.
	order := " ORDER BY r.submitted_at DESC, r.id DESC"
	if len(f.Statuses) == 1 && f.Statuses[0] == leave.Pending {
		order = " ORDER BY r.start_date, r.id"
	}
	args = append(args, f.PageSize, (f.Page-1)*f.PageSize)
	page := fmt.Sprintf(" LIMIT $%d OFFSET $%d", len(args)-1, len(args))

	rows, err := s.db.Query(ctx, requestSelect+clause+order+page, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list requests: %w", err)
	}
	items, err := collectRequests(rows)
	return items, total, err
}

func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

func (s *Store) ActiveRequests(ctx context.Context, userID string) ([]leave.Request, error) {
	rows, err := s.db.Query(ctx, requestSelect+` WHERE r.user_id = $1 AND r.status IN ('pending', 'approved') ORDER BY r.start_date`, userID)
	if err != nil {
		return nil, fmt.Errorf("active requests: %w", err)
	}
	return collectRequests(rows)
}

// Usage sums approved and pending working days per person and type. A
// request counts against the year it starts in.
func (s *Store) Usage(ctx context.Context, userIDs []string, year int) (map[string]leave.Usage, error) {
	rows, err := s.db.Query(ctx, `
		SELECT user_id, type,
		       coalesce(sum(working_days) FILTER (WHERE status = 'approved'), 0),
		       coalesce(sum(working_days) FILTER (WHERE status = 'pending'), 0)
		FROM leave_requests
		WHERE user_id = ANY($1) AND extract(year FROM start_date) = $2
		GROUP BY user_id, type`, userIDs, year)
	if err != nil {
		return nil, fmt.Errorf("usage: %w", err)
	}
	defer rows.Close()
	out := map[string]leave.Usage{}
	for rows.Next() {
		var id string
		var t leave.Type
		var used, pending int
		if err := rows.Scan(&id, &t, &used, &pending); err != nil {
			return nil, fmt.Errorf("scan usage: %w", err)
		}
		if out[id] == nil {
			out[id] = leave.Usage{}
		}
		out[id][t] = struct{ Used, Pending int }{used, pending}
	}
	return out, rows.Err()
}

func (s *Store) LimitOverrides(ctx context.Context, userIDs []string, year int) (map[string]map[leave.Type]int, error) {
	rows, err := s.db.Query(ctx, `SELECT user_id, type, days FROM leave_limits WHERE user_id = ANY($1) AND year = $2`, userIDs, year)
	if err != nil {
		return nil, fmt.Errorf("limits: %w", err)
	}
	defer rows.Close()
	out := map[string]map[leave.Type]int{}
	for rows.Next() {
		var id string
		var t leave.Type
		var days int
		if err := rows.Scan(&id, &t, &days); err != nil {
			return nil, fmt.Errorf("scan limit: %w", err)
		}
		if out[id] == nil {
			out[id] = map[leave.Type]int{}
		}
		out[id][t] = days
	}
	return out, rows.Err()
}

func (s *Store) InsertRequest(ctx context.Context, userID string, d leave.Draft, workingDays int) (int64, error) {
	var id int64
	err := s.db.QueryRow(ctx, `
		INSERT INTO leave_requests (user_id, type, start_date, end_date, working_days, reason, attachment_file_id)
		VALUES ($1, $2, $3, $4, $5, nullif($6, ''), $7) RETURNING id`,
		userID, d.Type, d.StartDate.Time, d.EndDate.Time, workingDays, d.Reason, d.AttachmentFileID).Scan(&id)
	return id, translate(err, "insert request")
}

func (s *Store) UpdatePendingRequest(ctx context.Context, id int64, d leave.Draft, workingDays int) (bool, error) {
	tag, err := s.db.Exec(ctx, `
		UPDATE leave_requests
		SET type = $1, start_date = $2, end_date = $3, working_days = $4, reason = nullif($5, ''), attachment_file_id = $6
		WHERE id = $7 AND status = 'pending'`,
		d.Type, d.StartDate.Time, d.EndDate.Time, workingDays, d.Reason, d.AttachmentFileID, id)
	if err != nil {
		return false, translate(err, "update request")
	}
	return tag.RowsAffected() == 1, nil
}

// SetStatus moves a request from one status to another in one statement.
// If someone else changed it first, no row matches and it returns false.
func (s *Store) SetStatus(ctx context.Context, id int64, from, to leave.Status, deciderID *string, note *string) (bool, error) {
	tag, err := s.db.Exec(ctx, `
		UPDATE leave_requests
		SET status = $1, decided_by = $2, decision_note = $3,
		    decided_at = CASE WHEN $2::uuid IS NULL THEN NULL ELSE now() END
		WHERE id = $4 AND status = $5`, to, deciderID, note, id, from)
	if err != nil {
		return false, translate(err, "set status")
	}
	return tag.RowsAffected() == 1, nil
}

func (s *Store) TeammatesAway(ctx context.Context, r *leave.Request) ([]leave.Request, error) {
	if r.Employee.Department == nil {
		return []leave.Request{}, nil
	}
	rows, err := s.db.Query(ctx, requestSelect+`
		WHERE u.department_id = $1 AND r.user_id <> $2
		  AND r.status IN ('pending', 'approved')
		  AND r.start_date <= $4 AND r.end_date >= $3
		ORDER BY r.start_date`, r.Employee.Department.ID, r.UserID, r.Start.Time, r.End.Time)
	if err != nil {
		return nil, fmt.Errorf("teammates away: %w", err)
	}
	return collectRequests(rows)
}

func (s *Store) AttachmentOwnedBy(ctx context.Context, fileID, userID string) error {
	var ok bool
	err := s.db.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM files WHERE id = $1 AND owner_id = $2 AND kind = 'attachment')`, fileID, userID).Scan(&ok)
	if err != nil {
		return fmt.Errorf("check attachment: %w", err)
	}
	if !ok {
		return domain.Invalid("That attachment was not found. Upload it again.")
	}
	return nil
}

// InUserLock runs fn inside a transaction that holds an advisory lock for
// this user; a second request from the same person waits for the first.
func (s *Store) InUserLock(ctx context.Context, userID string, fn func(leave.Store) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('leavedesk:user:' || $1))`, userID); err != nil {
		return fmt.Errorf("lock user: %w", err)
	}
	if err := fn(&Store{pool: s.pool, db: tx}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
