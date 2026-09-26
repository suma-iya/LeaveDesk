// Shapes of the Go API's JSON. Dates are ISO "yyyy-MM-dd" strings.

export type Role = 'hr' | 'employee'
export type AccountStatus = 'pending' | 'active'
export type LeaveType = 'annual' | 'casual' | 'sick'
export type Status = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface Department {
  id: number
  name: string
}

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  dateOfBirth: string
  age: number
  role: Role
  status: AccountStatus
  department: Department | null
  joinedOn: string | null
  avatarUrl?: string
  createdAt: string
  hasPassword: boolean
}

export interface Balance {
  type: LeaveType
  limit: number
  used: number
  pending: number
  available: number
  isDefault: boolean
}

/** Sum over all types for one person and year ("8/22 used"). */
export interface YearTotal {
  used: number
  pending: number
  limit: number
}

/** The requester or decider shown next to a request. */
export interface Person {
  id: string
  firstName: string
  lastName: string
  avatarUrl?: string
  department: Department | null
  joinedOn?: string
  age?: number
}

export interface FileMeta {
  id: string
  url: string
  name: string
  mime: string
  sizeBytes: number
}

export interface LeaveRequest {
  id: number
  code: string // "LV-2041": only shown on detail pages
  type: LeaveType
  startDate: string
  endDate: string
  workingDays: number
  reason: string
  status: Status
  submittedAt: string
  decidedAt: string | null
  decisionNote: string
  employee: Person
  decidedBy: Person | null
  attachment: FileMeta | null
  yearly?: YearTotal // HR lists only
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
}

export interface RequestFilters {
  scope?: 'mine' | 'all'
  status?: Status[]
  type?: LeaveType
  department?: number
  q?: string
  year?: number
  page?: number
  pageSize?: number
}

export interface Draft {
  type: LeaveType
  startDate: string
  endDate: string
  reason: string
  attachmentFileId?: string | null
}

export interface Away {
  requestId: number
  userId: string
  firstName: string
  lastName: string
  avatarUrl?: string
  department: Department | null
  type: LeaveType
  startDate: string
  endDate: string
  status: Status
}

export interface CalendarDay {
  date: string
  people: Away[]
}

export interface EmployeeRow extends User {
  yearly: YearTotal
}

export interface Salary {
  monthlyBdt: number
  effectiveFrom: string
  recordedAt: string
}

export interface EmployeeDetail {
  employee: User
  salary: { current: Salary | null; history: Salary[] }
  year: number
  balances: Balance[]
  defaults: Record<LeaveType, number>
  recentRequests: LeaveRequest[]
}

export interface EmployeeChange {
  departmentId?: number
  salary?: { monthlyBdt: number; effectiveFrom: string }
  limits?: Record<LeaveType, number>
}
