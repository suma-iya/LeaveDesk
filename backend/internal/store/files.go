package store

import (
	"context"

	"github.com/suma-iya/leavedesk/backend/internal/files"
)

func (s *Store) InsertFile(ctx context.Context, f files.File) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `
		INSERT INTO files (owner_id, kind, mime, size_bytes, original_name) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		f.OwnerID, f.Kind, f.Mime, f.SizeBytes, f.Name).Scan(&id)
	return id, translate(err, "insert file")
}

func (s *Store) DeleteFile(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM files WHERE id = $1`, id)
	return translate(err, "delete file")
}

func (s *Store) FileByID(ctx context.Context, id string) (*files.File, error) {
	var f files.File
	err := s.db.QueryRow(ctx, `
		SELECT id, owner_id, kind, mime, size_bytes, original_name FROM files WHERE id = $1::uuid`, id).
		Scan(&f.ID, &f.OwnerID, &f.Kind, &f.Mime, &f.SizeBytes, &f.Name)
	if err != nil && isInvalidUUID(err) {
		return nil, translate(errNoRows, "file by id")
	}
	return &f, translate(err, "file by id")
}
