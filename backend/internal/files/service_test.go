package files

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
)

// memFiles is an in-memory Store that records inserts and deletes.
type memFiles struct {
	rows      map[string]File
	next      int
	insertErr error
	lookupErr error
	deleted   []string
}

func (m *memFiles) InsertFile(_ context.Context, f File) (string, error) {
	if m.insertErr != nil {
		return "", m.insertErr
	}
	if m.rows == nil {
		m.rows = map[string]File{}
	}
	m.next++
	f.ID = fmt.Sprintf("file-%d", m.next)
	m.rows[f.ID] = f
	return f.ID, nil
}

func (m *memFiles) DeleteFile(_ context.Context, id string) error {
	m.deleted = append(m.deleted, id)
	delete(m.rows, id)
	return nil
}

func (m *memFiles) FileByID(_ context.Context, id string) (*File, error) {
	if m.lookupErr != nil {
		return nil, m.lookupErr
	}
	f, ok := m.rows[id]
	if !ok {
		return nil, fmt.Errorf("file by id: %w", domain.ErrNotFound)
	}
	return &f, nil
}

// Real file signatures, padded to size so the size rules can be tested.
func pngBytes(size int) []byte { return pad([]byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"), size) }
func jpegBytes(size int) []byte {
	return pad([]byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F'}, size)
}
func pdfBytes(size int) []byte { return pad([]byte("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n"), size) }
func pad(head []byte, size int) []byte {
	if size < len(head) {
		return head[:size]
	}
	return append(head, make([]byte, size-len(head))...)
}

var (
	owner = &domain.User{ID: "u-owner", Role: domain.RoleEmployee}
	other = &domain.User{ID: "u-other", Role: domain.RoleEmployee}
	hrUsr = &domain.User{ID: "u-hr", Role: domain.RoleHR}
)

func TestSaveValidation(t *testing.T) {
	const mb = 1 << 20
	tests := []struct {
		name     string
		kind     Kind
		fileName string
		data     []byte
		wantMime string // "" = rejected with 400
		wantMsg  string
	}{
		{name: "avatar PNG", kind: Avatar, fileName: "me.png", data: pngBytes(1024), wantMime: "image/png"},
		{name: "avatar JPEG", kind: Avatar, fileName: "me.jpg", data: jpegBytes(1024), wantMime: "image/jpeg"},
		{name: "avatar exactly 2 MB", kind: Avatar, fileName: "me.png", data: pngBytes(2 * mb), wantMime: "image/png"},
		{name: "avatar one byte over 2 MB", kind: Avatar, fileName: "me.png", data: pngBytes(2*mb + 1), wantMsg: "Use a JPG or PNG photo up to 2 MB."},
		{name: "avatar PDF refused", kind: Avatar, fileName: "me.pdf", data: pdfBytes(1024), wantMsg: "Use a JPG or PNG photo up to 2 MB."},
		{name: "avatar GIF refused", kind: Avatar, fileName: "me.gif", data: []byte("GIF89a\x01\x00\x01\x00\x00\x00\x00;"), wantMsg: "Use a JPG or PNG photo up to 2 MB."},
		{name: "empty avatar", kind: Avatar, fileName: "me.png", data: nil, wantMsg: "Use a JPG or PNG photo up to 2 MB."},
		{name: "attachment PDF", kind: Attachment, fileName: "note.pdf", data: pdfBytes(4096), wantMime: "application/pdf"},
		{name: "attachment PNG", kind: Attachment, fileName: "scan.png", data: pngBytes(4096), wantMime: "image/png"},
		{name: "attachment 3 MB is fine (too big for an avatar)", kind: Attachment, fileName: "scan.pdf", data: pdfBytes(3 * mb), wantMime: "application/pdf"},
		{name: "attachment exactly 5 MB", kind: Attachment, fileName: "scan.pdf", data: pdfBytes(5 * mb), wantMime: "application/pdf"},
		{name: "attachment one byte over 5 MB", kind: Attachment, fileName: "scan.pdf", data: pdfBytes(5*mb + 1), wantMsg: "Attach a PDF, PNG or JPG up to 5 MB."},
		{name: "HTML named .pdf is refused", kind: Attachment, fileName: "note.pdf", data: []byte("<html><script>alert(1)</script></html>"), wantMsg: "Attach a PDF, PNG or JPG up to 5 MB."},
		{name: "SVG is refused", kind: Attachment, fileName: "x.svg", data: []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`), wantMsg: "Attach a PDF, PNG or JPG up to 5 MB."},
		{name: "plain text is refused", kind: Attachment, fileName: "note.txt", data: []byte("I was sick."), wantMsg: "Attach a PDF, PNG or JPG up to 5 MB."},
		{name: "empty attachment", kind: Attachment, fileName: "x.pdf", data: []byte{}, wantMsg: "Attach a PDF, PNG or JPG up to 5 MB."},
		{name: "type comes from the bytes, not the name", kind: Attachment, fileName: "totally-a.pdf", data: pngBytes(512), wantMime: "image/png"},
		{name: "unknown kind", kind: "document", fileName: "x.pdf", data: pdfBytes(512), wantMsg: "kind must be avatar or attachment."},
		{name: "empty kind", kind: "", fileName: "x.png", data: pngBytes(512), wantMsg: "kind must be avatar or attachment."},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := &memFiles{}
			dir := t.TempDir()
			f, err := NewService(st, dir).Save(context.Background(), owner, tt.kind, tt.fileName, bytes.NewReader(tt.data))
			if tt.wantMime == "" {
				de, ok := domain.AsError(err)
				if !ok || de.Status != 400 || de.Code != "VALIDATION" || de.Message != tt.wantMsg {
					t.Fatalf("want 400 %q, got %v", tt.wantMsg, err)
				}
				if len(st.rows) != 0 {
					t.Fatalf("a refused upload must not be stored, got %v", st.rows)
				}
				if entries, _ := os.ReadDir(dir); len(entries) != 0 {
					t.Fatalf("a refused upload must not be written, got %d files", len(entries))
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if f.Mime != tt.wantMime || f.Kind != tt.kind || f.OwnerID != owner.ID || f.SizeBytes != len(tt.data) || f.Name != tt.fileName {
				t.Fatalf("unexpected file %+v", f)
			}
			if f.URL() != "/api/files/"+f.ID {
				t.Fatalf("URL %q", f.URL())
			}
			if row := st.rows[f.ID]; row.Mime != tt.wantMime || row.OwnerID != owner.ID {
				t.Fatalf("stored row %+v", row)
			}
			onDisk, err := os.ReadFile(filepath.Join(dir, f.ID))
			if err != nil || !bytes.Equal(onDisk, tt.data) {
				t.Fatalf("file on disk differs (%d bytes, %v)", len(onDisk), err)
			}
		})
	}
}

type failingReader struct{}

func (failingReader) Read([]byte) (int, error) { return 0, errors.New("connection reset") }

func TestSaveFailures(t *testing.T) {
	ctx := context.Background()

	t.Run("read error", func(t *testing.T) {
		st := &memFiles{}
		_, err := NewService(st, t.TempDir()).Save(ctx, owner, Avatar, "me.png", failingReader{})
		if err == nil || !strings.Contains(err.Error(), "read upload") {
			t.Fatalf("want a read error, got %v", err)
		}
		if _, ok := domain.AsError(err); ok {
			t.Fatal("an I/O failure is not a client error")
		}
	})

	t.Run("insert error is returned and nothing is written", func(t *testing.T) {
		st := &memFiles{insertErr: errors.New("db down")}
		dir := t.TempDir()
		_, err := NewService(st, dir).Save(ctx, owner, Avatar, "me.png", bytes.NewReader(pngBytes(100)))
		if err == nil || err.Error() != "db down" {
			t.Fatalf("want the store error, got %v", err)
		}
		if entries, _ := os.ReadDir(dir); len(entries) != 0 {
			t.Fatal("nothing should be written when the row could not be inserted")
		}
	})

	t.Run("write error removes the row", func(t *testing.T) {
		st := &memFiles{}
		dir := t.TempDir()
		// A directory where the file should go makes WriteFile fail.
		if err := os.Mkdir(filepath.Join(dir, "file-1"), 0o755); err != nil {
			t.Fatal(err)
		}
		_, err := NewService(st, dir).Save(ctx, owner, Avatar, "me.png", bytes.NewReader(pngBytes(100)))
		if err == nil || !strings.Contains(err.Error(), "write upload") {
			t.Fatalf("want a write error, got %v", err)
		}
		if len(st.deleted) != 1 || st.deleted[0] != "file-1" || len(st.rows) != 0 {
			t.Fatalf("the orphan row must be deleted, deleted=%v rows=%v", st.deleted, st.rows)
		}
	})

	t.Run("creates the upload dir on first use", func(t *testing.T) {
		dir := filepath.Join(t.TempDir(), "nested", "uploads")
		f, err := NewService(&memFiles{}, dir).Save(ctx, owner, Avatar, "me.png", bytes.NewReader(pngBytes(100)))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if _, err := os.Stat(filepath.Join(dir, f.ID)); err != nil {
			t.Fatalf("file not written: %v", err)
		}
	})
}

// If the upload folder can't be created, the files row is deleted again so
// it never points at nothing.
func TestSaveMkdirFailureRemovesTheRow(t *testing.T) {
	st := &memFiles{}
	notADir := filepath.Join(t.TempDir(), "uploads")
	if err := os.WriteFile(notADir, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := NewService(st, notADir).Save(context.Background(), owner, Avatar, "me.png", bytes.NewReader(pngBytes(100)))
	if err == nil {
		t.Fatal("want an error")
	}
	if len(st.rows) != 0 {
		t.Fatalf("the row must be deleted when the file cannot be written, rows=%v", st.rows)
	}
}

func TestOpenAccess(t *testing.T) {
	tests := []struct {
		name   string
		kind   Kind
		viewer *domain.User
		wantOK bool
	}{
		{name: "owner sees their attachment", kind: Attachment, viewer: owner, wantOK: true},
		{name: "HR sees anyone's attachment", kind: Attachment, viewer: hrUsr, wantOK: true},
		{name: "another employee cannot see an attachment", kind: Attachment, viewer: other},
		{name: "owner sees their avatar", kind: Avatar, viewer: owner, wantOK: true},
		{name: "any signed-in user sees an avatar", kind: Avatar, viewer: other, wantOK: true},
		{name: "HR sees an avatar", kind: Avatar, viewer: hrUsr, wantOK: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := &memFiles{}
			dir := t.TempDir()
			svc := NewService(st, dir)
			data := pngBytes(256)
			saved, err := svc.Save(context.Background(), owner, tt.kind, "x.png", bytes.NewReader(data))
			if err != nil {
				t.Fatal(err)
			}
			f, content, err := svc.Open(context.Background(), tt.viewer, saved.ID)
			if !tt.wantOK {
				de, ok := domain.AsError(err)
				if !ok || de.Status != 404 || content != nil {
					t.Fatalf("want a 404 (not a 403, so ids can't be probed), got %v", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			defer content.Close()
			got, _ := io.ReadAll(content)
			if f.ID != saved.ID || !bytes.Equal(got, data) {
				t.Fatalf("got file %+v with %d bytes", f, len(got))
			}
		})
	}
}

func TestOpenFailures(t *testing.T) {
	ctx := context.Background()

	t.Run("unknown id is 404", func(t *testing.T) {
		_, _, err := NewService(&memFiles{}, t.TempDir()).Open(ctx, hrUsr, "nope")
		if de, ok := domain.AsError(err); !ok || de.Status != 404 {
			t.Fatalf("want 404, got %v", err)
		}
	})

	t.Run("store failure is passed through", func(t *testing.T) {
		boom := errors.New("db down")
		_, _, err := NewService(&memFiles{lookupErr: boom}, t.TempDir()).Open(ctx, hrUsr, "x")
		if !errors.Is(err, boom) {
			t.Fatalf("want the store error, got %v", err)
		}
	})

	t.Run("row without a file on disk is 404", func(t *testing.T) {
		st := &memFiles{rows: map[string]File{"gone": {ID: "gone", OwnerID: owner.ID, Kind: Avatar, Mime: "image/png"}}}
		_, content, err := NewService(st, t.TempDir()).Open(ctx, owner, "gone")
		if de, ok := domain.AsError(err); !ok || de.Status != 404 || content != nil {
			t.Fatalf("want 404, got %v", err)
		}
	})
}

func TestOwnedAvatar(t *testing.T) {
	st := &memFiles{rows: map[string]File{
		"mine":       {ID: "mine", OwnerID: owner.ID, Kind: Avatar},
		"theirs":     {ID: "theirs", OwnerID: other.ID, Kind: Avatar},
		"attachment": {ID: "attachment", OwnerID: owner.ID, Kind: Attachment},
	}}
	svc := NewService(st, t.TempDir())
	tests := []struct {
		id     string
		wantOK bool
	}{
		{"mine", true},
		{"theirs", false},
		{"attachment", false},
		{"missing", false},
	}
	for _, tt := range tests {
		t.Run(tt.id, func(t *testing.T) {
			err := svc.OwnedAvatar(context.Background(), owner, tt.id)
			if tt.wantOK {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			de, ok := domain.AsError(err)
			if !ok || de.Status != 400 || de.Message != "Upload the photo again." {
				t.Fatalf("want 400 'Upload the photo again.', got %v", err)
			}
		})
	}

	t.Run("store failure is also 'upload again'", func(t *testing.T) {
		err := NewService(&memFiles{lookupErr: errors.New("db down")}, t.TempDir()).OwnedAvatar(context.Background(), owner, "mine")
		if de, ok := domain.AsError(err); !ok || de.Status != 400 {
			t.Fatalf("want 400, got %v", err)
		}
	})
}

func TestCleanName(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"report.pdf", "report.pdf"},
		{"../../etc/passwd", "passwd"},
		{`C:\Users\me\Documents\sick note.pdf`, "sick note.pdf"},
		{"folder/", "folder"},
		{"quote\"d\nname\t.pdf", "quotedname.pdf"},
		{"", "file"},
		{".", "file"},
		{"/", "file"},
		{`\`, "file"},
		{"\x00\x01", "file"},
		{"ছুটির আবেদন.pdf", "ছুটির আবেদন.pdf"},
		{strings.Repeat("a", 200) + ".pdf", strings.Repeat("a", 120)},
		{strings.Repeat("b", 120), strings.Repeat("b", 120)},
	}
	for _, tt := range tests {
		if got := cleanName(tt.in); got != tt.want {
			t.Errorf("cleanName(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

// Long names are cut on a character boundary, so a long Bengali name stays
// valid UTF-8 (Postgres refuses invalid UTF-8 in TEXT).
func TestCleanNameKeepsValidUTF8(t *testing.T) {
	name := "a" + strings.Repeat("ছ", 60) + ".pdf" // 1 + 3*60 bytes; byte 120 falls inside a character
	got := cleanName(name)
	if !utf8.ValidString(got) {
		t.Fatalf("cleanName produced invalid UTF-8: %q", got)
	}
}
