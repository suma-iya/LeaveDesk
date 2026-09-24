package handler

import (
	"net/http"

	"github.com/suma-iya/employee-leave-tracker/backend/internal/respond"
	"github.com/suma-iya/employee-leave-tracker/backend/internal/service"
)

// GET /api/employees
func (h *Handler) ListEmployees(w http.ResponseWriter, r *http.Request) {
	employees, err := h.employees.List(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, employees)
}

// POST /api/employees
func (h *Handler) CreateEmployee(w http.ResponseWriter, r *http.Request) {
	var in service.EmployeeInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, err)
		return
	}
	user, err := h.employees.Create(r.Context(), in)
	if err != nil {
		writeError(w, err)
		return
	}
	respond.JSON(w, http.StatusCreated, user)
}

// GET /api/employees/{id} — profile, summary and full leave list.
func (h *Handler) GetEmployee(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, err)
		return
	}
	detail, err := h.employees.Get(r.Context(), id, h.leaves.Timezone())
	if err != nil {
		writeError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, detail)
}

// PUT /api/employees/{id}
func (h *Handler) UpdateEmployee(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, err)
		return
	}
	var in service.EmployeeInput
	if err := decodeJSON(w, r, &in); err != nil {
		writeError(w, err)
		return
	}
	user, err := h.employees.Update(r.Context(), id, in)
	if err != nil {
		writeError(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, user)
}

// DELETE /api/employees/{id}
func (h *Handler) DeleteEmployee(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, err)
		return
	}
	if err := h.employees.Delete(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
