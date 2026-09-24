// The only place that talks to the backend. Components call these
// functions and never use fetch directly.
//
// All paths start with /api. In Docker, nginx forwards /api/* to the Go
// container; in `npm run dev`, Vite's proxy does the same job.

const TOKEN_KEY = 'leave_tracker_token'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

// AuthContext registers a callback here so an expired token logs the user out.
let onUnauthorized = () => {}
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Cannot reach the server. Is the backend running?', 0)
  }

  if (response.status === 204) return null
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401 && token) onUnauthorized()
    throw new ApiError(data?.error ?? response.statusText, response.status)
  }
  return data
}

function query(params) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value)
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}

// ---- Auth ----
export const getAuthConfig = () => request('/auth/config')
export const login = (email, password) => request('/auth/login', { method: 'POST', body: { email, password } })
export const loginWithGoogle = (credential) => request('/auth/google', { method: 'POST', body: { credential } })
export const getCurrentUser = () => request('/auth/me')

// ---- Leaves (any logged-in user) ----
export const getMyLeaves = () => request('/leaves/mine')
export const getMySummary = () => request('/leaves/mine/summary')
export const applyForLeave = (leave) => request('/leaves', { method: 'POST', body: leave })
export const cancelLeave = (id) => request(`/leaves/${id}`, { method: 'DELETE' })

// ---- Manager ----
export const getDashboard = (date) => request(`/dashboard${query({ date })}`)
export const getLeaves = ({ status, createdOn, employeeId } = {}) =>
  request(`/leaves${query({ status, created_on: createdOn, employee_id: employeeId })}`)
export const reviewLeave = (id, status, comment) =>
  request(`/leaves/${id}/status`, { method: 'PATCH', body: { status, comment } })

export const getEmployees = () => request('/employees')
export const getEmployee = (id) => request(`/employees/${id}`)
export const createEmployee = (employee) => request('/employees', { method: 'POST', body: employee })
export const updateEmployee = (id, employee) => request(`/employees/${id}`, { method: 'PUT', body: employee })
export const deleteEmployee = (id) => request(`/employees/${id}`, { method: 'DELETE' })
