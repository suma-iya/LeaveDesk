package handler

import (
	"net/http"
	"strconv"

	"github.com/suma-iya/employee-leave-tracker/backend/internal/model"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/respond"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/service"
)

// POST /api/leaves — the logged-in user applies for leave.
func (h *Handler) ApplyLeave(w http.ResponseWriter, r *http.Request) {
	var in service.ApplyLeaveInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, err)
		return
	}
	leave, err := h.leaves.Apply(r.Context(), currentUserID(r), in)
	if err != nil {
		writeError(w, err)
		return
	}
	respond.JSON(w, http.StatusCreated, leave)
}

// GET /api/leaves/mine
func (h *Handler) MyLeaves(w http.ResponseWriter, r *http.Request) {
	leaves, err := h.leaves.ListMine(r.Context(), currentUserID(r))
	if err != nil {
		writeError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, leaves)
}

// GET /api/leaves/mine/summary
func (h *Handler) MySummary(w http.ResponseWriter, r *http.Request) {
	summary, err := h.leaves.MySummary(r.Context(), currentUserID(r))
	if err != nil {
		writeError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, summary)
}

// DELETE /api/leaves/{id} — an employee cancels their own PENDING request.
func (h *Handler) CancelLeave(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, err)
		return
	}
	if err := h.leaves.Cancel(r.Context(), currentUserID(r), id); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/leaves?status=PENDING&created_on=2026-09-24&employee_id=3 (manager)
func (h *Handler) ListLeaves(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := model.LeaveFilter{Status: model.LeaveStatus(q.Get("status"))}

	if raw := q.Get("employee_id"); raw != "" {
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			writeError(w, model.Invalid("employee_id must be a number"))
			return
		}
		filter.UserID = id
	}
	if raw := q.Get("created_on"); raw != "" {
		day, err := model.ParseDate(raw)
		if err != nil {
			writeError(w, model.Invalid(err.Error()))
			return
		}
		filter.CreatedOn = &day
	}

	leaves, err := h.leaves.List(r.Context(), filter)
	if err != nil {
		writeError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, leaves)
}

// PATCH /api/leaves/{id}/status  body: {"status":"APPROVED","comment":"..."} (manager)
func (h *Handler) ReviewLeave(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, err)
		return
	}
	var in service.ReviewInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, err)
		return
	}
	leave, err := h.leaves.Review(r.Context(), currentUserID(r), id, in)
	if err != nil {
		writeError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, leave)
}

// GET /api/dashboard?date=2026-09-24 (manager). Date defaults to today.
func (h *Handler) Dashboard(w http.ResponseWriter, r *http.Request) {
	day := h.leaves.Today()
	if raw := r.URL.Query().Get("date"); raw != "" {
		parsed, err := model.ParseDate(raw)
		if err != nil {
			writeError(w, model.Invalid(err.Error()))
			return
		}
		day = parsed
	}
	stats, err := h.leaves.Dashboard(r.Context(), day)
	if err != nil {
		writeError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, stats)
}
