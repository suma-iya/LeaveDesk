import { addDays, endOfMonth, parseISO, startOfMonth } from 'date-fns'
import { toISODate } from '@/lib/dates'
import { LEAVE_TYPES, available, overlaps, pluralDays, sumBalances, workingDays } from '@/lib/leave'
import type {
  Balance, CalendarEntry, Decision, Employee, LeaveRequest, ListRequestsParams, Profile, RequestInput, RequestRow, Session, Status,
} from '@/types'
import { ApiError, type LeaveApi } from './contract'
import { tokenStore } from './http'
import { MOCK_PASSWORD, seedEmployees, seedPolicy, seedRequests } from './mockData'

// In-memory backend for development and demos. It enforces the same rules the
// Go API will: roles, ownership, overlap and balance checks, pending-only edits.
// Data resets when the page reloads.

const db = {
  employees: seedEmployees.map((e) => ({ ...e })),
  requests: seedRequests.map((r) => ({ ...r })),
  passwords: new Map(seedEmployees.map((e) => [e.id, MOCK_PASSWORD])),
  prefs: new Map(seedEmployees.map((e) => [e.id, { notifyOnChange: true, weeklyDigest: false }])),
}
const policy = seedPolicy

const delay = <T>(value: T, ms = 250) => new Promise<T>((resolve) => setTimeout(() => resolve(structuredClone(value)), ms))
const fail = (message: string, status = 400): never => { throw new ApiError(message, status) }
const today = () => toISODate(new Date())
const fullName = (e: Employee) => `${e.firstName} ${e.lastName}`

// ---- fake JWT: header.payload.signature (unsigned; the real API signs it) ----
const base64url = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
function issueToken(user: Employee) {
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600
  return `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: user.id, role: user.role, name: fullName(user), exp })}.mock`
}

function currentUser(): Employee {
  const token = tokenStore.get()
  const payload = token?.split('.')[1]
  if (!payload) return fail('Please sign in.', 401)
  try {
    const { sub } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return db.employees.find((e) => e.id === sub) ?? fail('Account no longer exists.', 401)
  } catch {
    return fail('Please sign in.', 401)
  }
}

const requireHr = () => {
  const user = currentUser()
  if (user.role !== 'hr') fail('Only HR can do this.', 403)
  return user
}

const findEmployee = (id: string) => db.employees.find((e) => e.id === id) ?? fail('Employee not found.', 404)

function findRequest(id: string) {
  const request = db.requests.find((r) => r.id === id) ?? fail('Request not found.', 404)
  const user = currentUser()
  if (user.role !== 'hr' && request.employeeId !== user.id) fail('Request not found.', 404)
  return request
}

function balancesFor(employeeId: string, year: number, excludeId?: string): Balance[] {
  const mine = db.requests.filter((r) => r.employeeId === employeeId && r.id !== excludeId && r.startDate.startsWith(String(year)))
  return LEAVE_TYPES.map((type) => ({
    type,
    allowance: policy.allowances[type],
    used: mine.filter((r) => r.type === type && r.status === 'approved').reduce((n, r) => n + r.workingDays, 0),
    pending: mine.filter((r) => r.type === type && r.status === 'pending').reduce((n, r) => n + r.workingDays, 0),
  }))
}

function toRow(request: LeaveRequest, withYearly: boolean): RequestRow {
  const employee = findEmployee(request.employeeId)
  const decider = request.decidedBy ? db.employees.find((e) => e.id === request.decidedBy) : undefined
  return {
    request,
    employee,
    yearly: withYearly ? sumBalances(balancesFor(employee.id, Number(request.startDate.slice(0, 4)))) : undefined,
    decidedByName: decider ? fullName(decider) : undefined,
  }
}

/** The same checks the server runs when a request is created or edited. */
function validate(employeeId: string, input: RequestInput, excludeId?: string) {
  if (!LEAVE_TYPES.includes(input.type)) fail('Choose a leave type.')
  if (!input.startDate || !input.endDate) fail('Pick your first and last day off.')
  if (input.endDate < input.startDate) fail('The last day cannot be before the first day.')
  const days = workingDays(input.startDate, input.endDate, policy.weekendDays)
  if (days === 0) fail('Pick at least one working day. Fridays and Saturdays are weekends.')

  const clash = db.requests.find((r) => r.employeeId === employeeId && r.id !== excludeId
    && (r.status === 'pending' || r.status === 'approved') && overlaps(r, input))
  if (clash) fail(`These dates overlap your ${clash.status} request ${clash.id}.`, 409)

  const balance = balancesFor(employeeId, Number(input.startDate.slice(0, 4)), excludeId).find((b) => b.type === input.type)!
  const free = available(balance)
  if (days > free) fail(`Not enough ${input.type} leave: ${pluralDays(free)} available, ${days} requested.`)
  if (input.reason.length > 500) fail('Keep the reason under 500 characters.')
  return days
}

function decide(id: string, decision: Decision) {
  const hr = requireHr()
  const request = db.requests.find((r) => r.id === id) ?? fail('Request not found.', 404)
  if (request.status !== 'pending') fail(`${request.id} was already ${request.status}.`, 409)
  Object.assign(request, { status: decision.status, decidedAt: today(), decidedBy: hr.id, decisionNote: decision.note?.trim() ?? '' })
  return request
}

function profileOf(user: Employee): Profile {
  return { ...user, ...db.prefs.get(user.id)! }
}

let nextId = Math.max(...db.requests.map((r) => Number(r.id.slice(3)))) + 1

export const mockApi: LeaveApi = {
  authConfig: () => delay({ googleClientId: '' }, 0),

  login(email, password) {
    const user = db.employees.find((e) => e.email === email.trim().toLowerCase())
    if (!user || db.passwords.get(user.id) !== password) return Promise.reject(new ApiError('Invalid email or password.', 401))
    return delay<Session>({ token: issueToken(user), user })
  },
  loginWithGoogle: () => Promise.reject(new ApiError('Google sign-in needs the real backend.', 400)),
  me: async () => delay(currentUser()),

  async listRequests(params: ListRequestsParams) {
    const user = currentUser()
    const mine = params.mine || user.role !== 'hr' // employees only ever see their own
    const statuses = params.status ? ([] as Status[]).concat(params.status) : undefined
    const q = params.q?.trim().toLowerCase()

    const rows = db.requests
      .filter((r) => !mine || r.employeeId === user.id)
      .filter((r) => !statuses || statuses.includes(r.status))
      .filter((r) => !params.type || r.type === params.type)
      .filter((r) => !params.year || r.startDate.startsWith(String(params.year)))
      .filter((r) => !params.from || r.endDate >= params.from)
      .filter((r) => !params.to || r.startDate <= params.to)
      .map((r) => toRow(r, user.role === 'hr'))
      .filter((row) => !params.department || row.employee.department === params.department)
      .filter((row) => !q || [fullName(row.employee), row.request.reason, row.request.decisionNote ?? '']
        .some((text) => text.toLowerCase().includes(q)))
      .sort((a, b) => b.request.submittedAt.localeCompare(a.request.submittedAt) || b.request.id.localeCompare(a.request.id))

    const items = params.page && params.pageSize
      ? rows.slice((params.page - 1) * params.pageSize, params.page * params.pageSize)
      : rows
    return delay({ items, total: rows.length })
  },

  async getRequest(id) {
    const user = currentUser()
    const request = findRequest(id)
    const row = toRow(request, true)
    const overlapping = user.role === 'hr'
      ? db.requests
        .filter((r) => r.id !== request.id && r.employeeId !== request.employeeId
          && (r.status === 'approved' || r.status === 'pending') && overlaps(r, request)
          && findEmployee(r.employeeId).department === row.employee.department)
        .map((r) => toRow(r, false))
      : []
    return delay({
      ...row,
      balances: balancesFor(request.employeeId, Number(request.startDate.slice(0, 4))),
      overlapping,
      decider: request.decidedBy ? findEmployee(request.decidedBy) : undefined,
    })
  },

  async createRequest(input) {
    const user = currentUser()
    const workingDaysCount = validate(user.id, input)
    const request: LeaveRequest = {
      ...input, id: `LV-${nextId++}`, employeeId: user.id, workingDays: workingDaysCount,
      reason: input.reason.trim(), status: 'pending', submittedAt: today(),
    }
    db.requests.push(request)
    return delay(request, 400)
  },

  async updateRequest(id, input) {
    const user = currentUser()
    const request = findRequest(id)
    if (request.employeeId !== user.id) fail('You can only edit your own requests.', 403)
    if (request.status !== 'pending') fail('Only pending requests can be edited.', 409)
    const days = validate(user.id, input, id)
    Object.assign(request, { ...input, reason: input.reason.trim(), workingDays: days })
    return delay(request, 400)
  },

  async cancelRequest(id) {
    const user = currentUser()
    const request = findRequest(id)
    if (request.employeeId !== user.id) fail('You can only cancel your own requests.', 403)
    if (request.status !== 'pending') fail('Only pending requests can be cancelled.', 409)
    db.requests = db.requests.filter((r) => r.id !== id)
    return delay(undefined)
  },

  decideRequest: async (id, decision) => delay(decide(id, decision)),
  bulkDecide: async (ids, decision) => delay(ids.map((id) => decide(id, decision))),

  async reopenRequest(id) {
    requireHr()
    const request = db.requests.find((r) => r.id === id) ?? fail('Request not found.', 404)
    Object.assign(request, { status: 'pending', decidedAt: undefined, decidedBy: undefined, decisionNote: undefined })
    return delay(request)
  },

  async getBalances(employeeId, year) {
    const user = currentUser()
    if (user.role !== 'hr' && employeeId !== user.id) fail('Not allowed.', 403)
    return delay(balancesFor(employeeId, year))
  },
  getPolicy: () => delay(policy, 0),
  listDepartments: () => delay([...new Set(db.employees.map((e) => e.department))].sort(), 0),

  async getCalendar(month, filters) {
    const user = currentUser()
    const first = startOfMonth(parseISO(`${month}-01`))
    // Include the leading/trailing days shown from neighbouring months.
    const from = toISODate(addDays(first, -7))
    const to = toISODate(addDays(endOfMonth(first), 14))
    const entries: CalendarEntry[] = db.requests
      .filter((r) => r.status === 'approved' || (filters.includePending && r.status === 'pending'))
      .filter((r) => !filters.type || r.type === filters.type)
      .filter((r) => r.endDate >= from && r.startDate <= to)
      .map((request) => ({ request, employee: findEmployee(request.employeeId) }))
      .filter((e) => !filters.department || e.employee.department === filters.department)
      .map((entry) => user.role === 'hr'
        ? { ...entry, daysLeft: available(sumBalances(balancesFor(entry.employee.id, Number(entry.request.startDate.slice(0, 4))))) }
        : entry) // employees never receive other people's balances
    return delay(entries)
  },

  getProfile: async () => delay(profileOf(currentUser())),

  async updateProfile(update) {
    const user = currentUser()
    const email = update.email.trim().toLowerCase()
    if (!update.firstName.trim() || !update.lastName.trim()) fail('First and last name are required.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.')
    if (db.employees.some((e) => e.email === email && e.id !== user.id)) fail('That email is already in use.', 409)
    if (!Number.isInteger(update.age) || update.age < 16 || update.age > 100) fail('Age must be between 16 and 100.')
    if (update.newPassword) {
      if (db.passwords.get(user.id) !== update.currentPassword) fail('Current password is incorrect.')
      if (update.newPassword.length < 8) fail('New password must be at least 8 characters.')
      db.passwords.set(user.id, update.newPassword)
    }
    Object.assign(user, { firstName: update.firstName.trim(), lastName: update.lastName.trim(), email, age: update.age })
    db.prefs.set(user.id, { notifyOnChange: update.notifyOnChange, weeklyDigest: update.weeklyDigest })
    return delay(profileOf(user), 400)
  },

  async uploadAvatar(file) {
    const user = currentUser()
    if (!['image/jpeg', 'image/png'].includes(file.type)) fail('Use a JPG or PNG image.')
    if (file.size > 2 * 1024 * 1024) fail('The photo must be 2 MB or smaller.')
    user.avatarUrl = URL.createObjectURL(file)
    return delay(user.avatarUrl, 400)
  },

  async uploadAttachment(file) {
    currentUser()
    if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) fail('Attach a PDF or an image.')
    if (file.size > 5 * 1024 * 1024) fail('The file must be 5 MB or smaller.')
    return delay({ url: URL.createObjectURL(file), name: file.name, sizeBytes: file.size, mime: file.type }, 400)
  },
}
