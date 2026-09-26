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
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/suma-iya/leavedesk/backend/internal/config"
	"github.com/suma-iya/leavedesk/backend/internal/httpapi"
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
