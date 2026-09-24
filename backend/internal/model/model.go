// Package model holds the domain types shared by every layer.
package model

import "time"

type Role string

const (
	RoleEmployee Role = "EMPLOYEE"
	RoleManager  Role = "MANAGER"
)

func (r Role) Valid() bool { return r == RoleEmployee || r == RoleManager }

type User struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	Role         Role      `json:"role"`
	Department   string    `json:"department"`
	PasswordHash *string   `json:"-"` // never serialised
	GoogleID     *string   `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

type LeaveType string

const (
	LeaveAnnual LeaveType = "ANNUAL"
	LeaveSick   LeaveType = "SICK"
	LeaveCasual LeaveType = "CASUAL"
	LeaveUnpaid LeaveType = "UNPAID"
)

func (t LeaveType) Valid() bool {
	switch t {
	case LeaveAnnual, LeaveSick, LeaveCasual, LeaveUnpaid:
		return true
	}
	return false
}

type LeaveStatus string

const (
	StatusPending  LeaveStatus = "PENDING"
	StatusApproved LeaveStatus = "APPROVED"
	StatusRejected LeaveStatus = "REJECTED"
)

func (s LeaveStatus) Valid() bool {
	return s == StatusPending || s == StatusApproved || s == StatusRejected
}

type Leave struct {
	ID             int64       `json:"id"`
	UserID         int64       `json:"user_id"`
	EmployeeName   string      `json:"employee_name"`
	EmployeeEmail  string      `json:"employee_email"`
	Type           LeaveType   `json:"leave_type"`
	StartDate      Date        `json:"start_date"`
	EndDate        Date        `json:"end_date"`
	Days           int         `json:"days"`
	Reason         string      `json:"reason"`
	Status         LeaveStatus `json:"status"`
	ManagerComment string      `json:"manager_comment"`
	ReviewedBy     *int64      `json:"reviewed_by"`
	ReviewedAt     *time.Time  `json:"reviewed_at"`
	CreatedAt      time.Time   `json:"created_at"`
}

// LeaveFilter narrows a leave listing. Zero values mean "no filter".
type LeaveFilter struct {
	UserID    int64
	Status    LeaveStatus
	CreatedOn *Date // requests submitted on this calendar day
}

type StatusCounts struct {
	Pending  int `json:"pending"`
	Approved int `json:"approved"`
	Rejected int `json:"rejected"`
	Total    int `json:"total"`
}

// DashboardStats is what the manager dashboard shows.
type DashboardStats struct {
	StatusCounts
	Date           Date `json:"date"`
	RequestsOnDate int  `json:"requests_on_date"`
	OnLeaveOnDate  int  `json:"on_leave_on_date"`
	TotalEmployees int  `json:"total_employees"`
}

// EmployeeSummary is the per-employee view: their leaves plus totals.
type EmployeeSummary struct {
	StatusCounts
	ApprovedDaysThisYear int `json:"approved_days_this_year"`
}

// EmployeeRow is one line of the manager's employee table.
type EmployeeRow struct {
	ID         int64        `json:"id"`
	Name       string       `json:"name"`
	Email      string       `json:"email"`
	Role       Role         `json:"role"`
	Department string       `json:"department"`
	CreatedAt  time.Time    `json:"created_at"`
	Leaves     StatusCounts `json:"leaves"`
}
