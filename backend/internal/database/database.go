// Package database opens the Postgres connection pool and applies the schema.
package database

import (
	"context"
	"embed"
	"fmt"
	"log"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

// Connect retries for a while because in docker-compose the backend may
// start a few seconds before Postgres accepts connections.
func Connect(ctx context.Context, url string) (*pgxpool.Pool, error) {
	var lastErr error
	for attempt := 1; attempt <= 10; attempt++ {
		pool, err := pgxpool.New(ctx, url)
		if err == nil {
			if err = pool.Ping(ctx); err == nil {
				return pool, nil
			}
			pool.Close()
		}
		lastErr = err
		log.Printf("database not ready (attempt %d/10): %v", attempt, err)
		time.Sleep(2 * time.Second)
	}
	return nil, fmt.Errorf("connect to database: %w", lastErr)
}

// Migrate runs every embedded .sql file in name order. The files use
// IF NOT EXISTS, so running them again on restart is harmless.
func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	entries, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })

	for _, entry := range entries {
		sql, err := migrationFiles.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return fmt.Errorf("read %s: %w", entry.Name(), err)
		}
		if _, err := pool.Exec(ctx, string(sql)); err != nil {
			return fmt.Errorf("apply %s: %w", entry.Name(), err)
		}
		log.Printf("applied migration %s", entry.Name())
	}
	return nil
}
