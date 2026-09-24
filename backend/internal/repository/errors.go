// Package repository contains all SQL. Every query is parameterised
// ($1, $2 ...) so user input is never concatenated into SQL text.
package repository

import (
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/suma-iya/employee-leave-tracker/backend/internal/model"
)

const (
	pgUniqueViolation    = "23505" // UNIQUE constraint
	pgForeignKeyMissing  = "23503" // referenced row (e.g. the user) no longer exists
	pgExclusionViolation = "23P01" // leaves_no_overlap constraint
)

// translate turns driver errors into domain errors the service understands.
func translate(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return model.ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case pgUniqueViolation, pgExclusionViolation:
			return model.ErrConflict
		case pgForeignKeyMissing:
			return model.ErrNotFound
		}
	}
	return err
}
