// Command leavedesk is the API server and its admin CLI:
//
//	leavedesk serve                  run the HTTP API (default)
//	leavedesk seed [--reset]         load demo data
//	leavedesk promote --email x@y    make an employee HR
//	leavedesk demote  --email x@y    make an HR an employee (never the last HR)
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/config"
	"github.com/suma-iya/leavedesk/backend/internal/httpapi"
	"github.com/suma-iya/leavedesk/backend/internal/seed"
	"github.com/suma-iya/leavedesk/backend/internal/store"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	command := "serve"
	if len(os.Args) > 1 {
		command = os.Args[1]
	}
	var err error
	switch command {
	case "serve":
		err = serve()
	case "seed":
		err = runSeed(os.Args[2:])
	default:
		err = fmt.Errorf("unknown command %q (use serve | seed | promote | demote)", command)
	}
	if err != nil {
		slog.Error("leavedesk failed", "command", command, "err", err)
		os.Exit(1)
	}
}

func serve() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := store.Migrate(cfg.DatabaseURL); err != nil {
		return err
	}
	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           httpapi.Router(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	errs := make(chan error, 1)
	go func() {
		slog.Info("api listening", "port", cfg.Port)
		errs <- server.ListenAndServe()
	}()

	select {
	case err := <-errs:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		slog.Info("shutting down")
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return server.Shutdown(shutdownCtx)
}

func runSeed(args []string) error {
	flags := flag.NewFlagSet("seed", flag.ExitOnError)
	reset := flags.Bool("reset", false, "delete all existing data first")
	_ = flags.Parse(args)

	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx := context.Background()
	if err := store.Migrate(cfg.DatabaseURL); err != nil {
		return err
	}
	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	return seed.Run(ctx, db.Pool(), cfg.UploadDir, cfg.Location, *reset)
}
