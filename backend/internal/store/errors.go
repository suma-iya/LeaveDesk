package store

import (
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/suma-iya/leavedesk/backend/internal/domain"
)

// translate maps driver errors to the domain's sentinel errors.
func translate(err error, context string) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("%s: %w", context, domain.ErrNotFound)
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return fmt.Errorf("%s: %w", context, domain.ErrConflict)
	}
	return fmt.Errorf("%s: %w", context, err)
}

var errNoRows = pgx.ErrNoRows

// isInvalidUUID: a malformed id in the URL should be a 404, not a 500.
func isInvalidUUID(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "22P02"
}
