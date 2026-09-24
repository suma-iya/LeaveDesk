// Command api is the entry point: it loads config, connects to Postgres,
// wires repositories → services → handlers, and starts the HTTP server.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/suma-iya/employee-leave-tracker/backend/internal/auth"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/config"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/database"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/handler"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/repository"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/seed"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/service"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := database.Migrate(ctx, pool); err != nil {
		return err
	}

	// Dependency wiring: each layer only receives what it needs.
	userRepo := repository.NewUserRepository(pool)
	leaveRepo := repository.NewLeaveRepository(pool)
	tokens := auth.NewTokenManager(cfg.JWTSecret, cfg.JWTTTL)
	now := time.Now

	authService := service.NewAuthService(userRepo, tokens, auth.NewGoogleVerifier(cfg.GoogleClientID), cfg.ManagerEmails)
	employeeService := service.NewEmployeeService(userRepo, leaveRepo, now)
	leaveService := service.NewLeaveService(leaveRepo, userRepo, cfg.Location, now)

	if err := seed.Manager(ctx, userRepo, cfg.SeedManagerName, cfg.SeedManagerEmail, cfg.SeedManagerPassword); err != nil {
		return err
	}
	if cfg.SeedDemoData && cfg.SeedManagerEmail != "" {
		if err := seed.DemoData(ctx, userRepo, leaveRepo, cfg.SeedManagerEmail, now().In(cfg.Location)); err != nil {
			return err
		}
	}

	h := handler.New(authService, employeeService, leaveService, cfg.GoogleClientID)
	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           h.Routes(tokens),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
	}

	// Serve in the background; block until Ctrl+C / docker stop.
	serverErr := make(chan error, 1)
	go func() {
		log.Printf("API listening on :%s", cfg.Port)
		serverErr <- server.ListenAndServe()
	}()

	select {
	case err := <-serverErr:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		log.Println("shutting down…")
	}

	// Graceful shutdown: let in-flight requests finish (max 10s).
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return server.Shutdown(shutdownCtx)
}
