// Package seed creates the first manager account and, optionally, demo
// employees and leaves so the app is usable right after `docker compose up`.
package seed

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/suma-iya/employee-leave-tracker/backend/internal/auth"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/model"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/service"
)

const demoPassword = "password123"

// Manager creates the seed manager if that email is not registered yet.
func Manager(ctx context.Context, users service.UserStore, name, email, password string) error {
	if email == "" || password == "" {
		return nil
	}
	_, err := users.GetByEmail(ctx, email)
	if err == nil {
		return nil // already exists
	}
	if !errors.Is(err, model.ErrNotFound) {
		return fmt.Errorf("seed manager: %w", err)
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}
	manager := &model.User{Name: name, Email: email, Role: model.RoleManager, Department: "Management", PasswordHash: &hash}
	if err := users.Create(ctx, manager); err != nil {
		return fmt.Errorf("seed manager: %w", err)
	}
	log.Printf("seeded manager %s", email)
	return nil
}

// DemoData adds three employees with a few leaves, but only on an empty
// database, so restarting the container never duplicates rows.
func DemoData(ctx context.Context, users service.UserStore, leaves service.LeaveStore, reviewerEmail string, today time.Time) error {
	count, err := users.CountByRole(ctx, model.RoleEmployee)
	if err != nil || count > 0 {
		return err
	}
	reviewer, err := users.GetByEmail(ctx, reviewerEmail)
	if err != nil {
		return fmt.Errorf("seed demo data: find reviewer: %w", err)
	}
	hash, err := auth.HashPassword(demoPassword)
	if err != nil {
		return err
	}

	day := func(offset int) model.Date { return model.DateOf(today.AddDate(0, 0, offset)) }
	type demoLeave struct {
		kind       model.LeaveType
		start, end int // days from today
		reason     string
		status     model.LeaveStatus
	}
	demo := []struct {
		name, email, dept string
		leaves            []demoLeave
	}{
		{"Alice Rahman", "alice@example.com", "Engineering", []demoLeave{
			{model.LeaveAnnual, 7, 11, "Family trip to Cox's Bazar", model.StatusPending},
			{model.LeaveSick, -20, -19, "Fever", model.StatusApproved},
		}},
		{"Bob Hasan", "bob@example.com", "Finance", []demoLeave{
			{model.LeaveCasual, 0, 0, "Bank appointment", model.StatusApproved},
			{model.LeaveAnnual, 14, 16, "Sister's wedding", model.StatusPending},
		}},
		{"Chitra Das", "chitra@example.com", "Design", []demoLeave{
			{model.LeaveUnpaid, 3, 4, "Personal matters", model.StatusRejected},
		}},
	}

	for _, d := range demo {
		employee := &model.User{Name: d.name, Email: d.email, Department: d.dept, Role: model.RoleEmployee, PasswordHash: &hash}
		if err := users.Create(ctx, employee); err != nil {
			return fmt.Errorf("seed employee %s: %w", d.email, err)
		}
		for _, l := range d.leaves {
			created, err := leaves.Create(ctx, &model.Leave{
				UserID: employee.ID, Type: l.kind, StartDate: day(l.start), EndDate: day(l.end), Reason: l.reason,
			})
			if err != nil {
				return fmt.Errorf("seed leave: %w", err)
			}
			if l.status != model.StatusPending {
				if _, err := leaves.Review(ctx, created.ID, l.status, "Seeded by demo data", reviewer.ID); err != nil {
					return fmt.Errorf("seed review: %w", err)
				}
			}
		}
	}
	log.Printf("seeded demo employees (password %q)", demoPassword)
	return nil
}
