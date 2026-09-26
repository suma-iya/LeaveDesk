// Package store holds all SQL. Every query is parameterised; no business rules here.
package store

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5" // registers pgx5://
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/suma-iya/leavedesk/backend/migrations"
)

// querier is satisfied by both the pool and a transaction, so the same
// query methods run inside or outside a transaction.
type querier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type Store struct {
	pool *pgxpool.Pool
	db   querier // the pool, or a transaction inside InUserLock
}

// Open connects with retries: in docker-compose the API can start a moment
// before Postgres accepts connections.
func Open(ctx context.Context, url string) (*Store, error) {
	var lastErr error
	for attempt := 1; attempt <= 15; attempt++ {
		pool, err := pgxpool.New(ctx, url)
		if err == nil {
			if err = pool.Ping(ctx); err == nil {
				return &Store{pool: pool, db: pool}, nil
			}
			pool.Close()
		}
		lastErr = err
		slog.Warn("database not ready", "attempt", attempt, "err", err)
		time.Sleep(2 * time.Second)
	}
	return nil, fmt.Errorf("connect to database: %w", lastErr)
}

func (s *Store) Close() { s.pool.Close() }

func (s *Store) Pool() *pgxpool.Pool { return s.pool }

// Migrate applies every pending migration from the embedded SQL files.
func Migrate(databaseURL string) error {
	source, err := iofs.New(migrations.FS, ".")
	if err != nil {
		return fmt.Errorf("open migrations: %w", err)
	}
	url := "pgx5://" + strings.SplitN(databaseURL, "://", 2)[1]
	m, err := migrate.NewWithSourceInstance("iofs", source, url)
	if err != nil {
		return fmt.Errorf("init migrations: %w", err)
	}
	defer m.Close()
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("run migrations: %w", err)
	}
	version, _, _ := m.Version()
	slog.Info("database migrated", "version", version)
	return nil
}
