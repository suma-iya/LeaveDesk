// Package files stores uploads on disk (the uploads volume), named by a
// random UUID, with metadata in the files table. Files are only served
// after a permission check.
package files

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
)

type Kind string

const (
	Avatar     Kind = "avatar"
	Attachment Kind = "attachment"
)

type File struct {
	ID        string `json:"id"`
	OwnerID   string `json:"-"`
	Kind      Kind   `json:"kind"`
	Mime      string `json:"mime"`
	SizeBytes int    `json:"sizeBytes"`
	Name      string `json:"name"`
}

func (f *File) URL() string { return "/api/files/" + f.ID }

type Store interface {
	InsertFile(ctx context.Context, f File) (string, error)
	DeleteFile(ctx context.Context, id string) error
	FileByID(ctx context.Context, id string) (*File, error)
}

// Limits and allowed types per kind. The type is detected from the file's
// bytes, not trusted from the browser.
var rules = map[Kind]struct {
	maxBytes int64
	mimes    map[string]bool
	message  string
}{
	Avatar:     {2 << 20, map[string]bool{"image/jpeg": true, "image/png": true}, "Use a JPG or PNG photo up to 2 MB."},
	Attachment: {5 << 20, map[string]bool{"application/pdf": true, "image/jpeg": true, "image/png": true}, "Attach a PDF, PNG or JPG up to 5 MB."},
}

type Service struct {
	store Store
	dir   string
}

func NewService(s Store, dir string) *Service { return &Service{store: s, dir: dir} }

// Save validates and stores an upload for its owner.
func (s *Service) Save(ctx context.Context, owner *domain.User, kind Kind, name string, r io.Reader) (*File, error) {
	rule, ok := rules[kind]
	if !ok {
		return nil, domain.Invalid("kind must be avatar or attachment.")
	}
	// Read one byte past the limit to detect oversize files.
	data, err := io.ReadAll(io.LimitReader(r, rule.maxBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read upload: %w", err)
	}
	if int64(len(data)) > rule.maxBytes || len(data) == 0 {
		return nil, domain.Invalid("%s", rule.message)
	}
	mime := http.DetectContentType(data)
	if !rule.mimes[mime] {
		return nil, domain.Invalid("%s", rule.message)
	}
	f := File{OwnerID: owner.ID, Kind: kind, Mime: mime, SizeBytes: len(data), Name: cleanName(name)}
	if f.ID, err = s.store.InsertFile(ctx, f); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(s.dir, 0o755); err != nil {
		_ = s.store.DeleteFile(ctx, f.ID)
		return nil, fmt.Errorf("create upload dir: %w", err)
	}
	if err := os.WriteFile(filepath.Join(s.dir, f.ID), data, 0o644); err != nil {
		_ = s.store.DeleteFile(ctx, f.ID)
		return nil, fmt.Errorf("write upload: %w", err)
	}
	return &f, nil
}

// Open returns a file the viewer may see: their own, anything for HR, and
// any avatar for signed-in users. Everything else is a 404.
func (s *Service) Open(ctx context.Context, viewer *domain.User, id string) (*File, io.ReadSeekCloser, error) {
	f, err := s.store.FileByID(ctx, id)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, nil, domain.NotFound("File not found.")
	}
	if err != nil {
		return nil, nil, err
	}
	if f.OwnerID != viewer.ID && !viewer.IsHR() && f.Kind != Avatar {
		return nil, nil, domain.NotFound("File not found.")
	}
	file, err := os.Open(filepath.Join(s.dir, f.ID))
	if err != nil {
		return nil, nil, domain.NotFound("File not found.")
	}
	return f, file, nil
}

// OwnedAvatar checks a new profile photo belongs to the user.
func (s *Service) OwnedAvatar(ctx context.Context, owner *domain.User, id string) error {
	f, err := s.store.FileByID(ctx, id)
	if err != nil || f.OwnerID != owner.ID || f.Kind != Avatar {
		return domain.Invalid("Upload the photo again.")
	}
	return nil
}

func cleanName(name string) string {
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	name = strings.Map(func(r rune) rune {
		if r < 32 || r == '"' {
			return -1
		}
		return r
	}, name)
	if name == "" || name == "." || name == "/" {
		return "file"
	}
	if len(name) > 120 { // bytes; step back so a multi-byte character isn't cut in half
		cut := 120
		for cut > 0 && !utf8.RuneStart(name[cut]) {
			cut--
		}
		name = name[:cut]
	}
	return name
}
