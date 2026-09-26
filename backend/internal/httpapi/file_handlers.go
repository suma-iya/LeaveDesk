package httpapi

import (
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
	"github.com/suma-iya/leavedesk/backend/internal/files"
	"github.com/suma-iya/leavedesk/backend/internal/leave"
)

const maxUpload = 6 << 20 // a little over the 5 MB attachment limit, for form overhead

// POST /api/files  multipart: kind=avatar|attachment, file=<the file>
func (s *Server) uploadFile(w http.ResponseWriter, r *http.Request, u *domain.User) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxUpload)
	if err := r.ParseMultipartForm(maxUpload); err != nil {
		return domain.Invalid("Upload a single file up to 5 MB.")
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		return domain.Invalid("Choose a file to upload.")
	}
	defer file.Close()
	f, err := s.files.Save(r.Context(), u, files.Kind(r.FormValue("kind")), header.Filename, file)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": f.ID, "url": f.URL(), "name": f.Name, "mime": f.Mime, "sizeBytes": f.SizeBytes})
	return nil
}

// GET /api/files/{id} — streams the file after the permission check.
func (s *Server) getFile(w http.ResponseWriter, r *http.Request, u *domain.User) error {
	f, content, err := s.files.Open(r.Context(), u, pathID(r))
	if err != nil {
		return err
	}
	defer content.Close()
	w.Header().Set("Content-Type", f.Mime)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename*=UTF-8''%s", url.PathEscape(f.Name)))
	http.ServeContent(w, r, "", time.Time{}, content)
	return nil
}

// createRequestMultipart handles POST /api/requests sent as a form with
// an attachment: the file is stored first, then the request is created.
func (s *Server) createRequestMultipart(w http.ResponseWriter, r *http.Request, u *domain.User) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxUpload)
	if err := r.ParseMultipartForm(maxUpload); err != nil {
		return domain.Invalid("Attach a single file up to 5 MB.")
	}
	d := leave.Draft{Type: leave.Type(r.FormValue("type")), Reason: r.FormValue("reason")}
	for key, dst := range map[string]**domain.Date{"startDate": &d.StartDate, "endDate": &d.EndDate} {
		if raw := r.FormValue(key); raw != "" {
			date, err := domain.ParseDate(raw)
			if err != nil {
				return domain.Invalid("%s: %v", key, err)
			}
			*dst = &date
		}
	}
	if file, header, err := r.FormFile("attachment"); err == nil {
		defer file.Close()
		f, err := s.files.Save(r.Context(), u, files.Attachment, header.Filename, file)
		if err != nil {
			return err
		}
		d.AttachmentFileID = &f.ID
	}
	created, err := s.leave.Create(r.Context(), u, d)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusCreated, viewRequest(created))
	return nil
}

// GET /api/calendar?month=2026-10&department=&type=&includePending=true
func (s *Server) calendar(w http.ResponseWriter, r *http.Request, _ *domain.User) error {
	q := r.URL.Query()
	month, err := time.Parse("2006-01", q.Get("month"))
	if err != nil {
		month = s.today()
	}
	f := leave.CalendarFilter{Type: leave.Type(q.Get("type")), IncludePending: q.Get("includePending") != "false"}
	if raw := q.Get("department"); raw != "" {
		if f.DepartmentID, err = strconv.Atoi(raw); err != nil {
			return domain.Invalid("department must be a number.")
		}
	}
	days, err := s.leave.Calendar(r.Context(), s.calendarStore, month, f)
	if err != nil {
		return err
	}
	writeJSON(w, http.StatusOK, map[string]any{"month": month.Format("2006-01"), "days": days})
	return nil
}

func isMultipart(r *http.Request) bool {
	return strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data")
}
