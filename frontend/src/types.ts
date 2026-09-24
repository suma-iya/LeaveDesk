// Domain types shared by the API layer and the UI.

export type Role = 'hr' | 'employee'
export type LeaveType = 'Annual' | 'Casual' | 'Sick'
export type Status = 'pending' | 'approved' | 'rejected'

export interface Employee {
  id: string
  firstName: string
  lastName: string
  age: number
  yearsAtCompany: number
  department: string
  jobTitle: string
  email: string
  avatarUrl?: string
  role: Role
}

export interface Attachment {
  url: string
  name: string
  sizeBytes: number
  mime: string
  pages?: number
}

export interface LeaveRequest {
  id: string // "LV-2041", only shown on the details page
  employeeId: string
  type: LeaveType
  startDate: string // ISO yyyy-MM-dd
  endDate: string
  workingDays: number
  reason: string
  attachment?: Attachment
  status: Status
  submittedAt: string
  decidedAt?: string
  decidedBy?: string
  decisionNote?: string
}

export interface Balance {
  type: LeaveType
  allowance: number
  used: number
  pending: number
}

export interface Policy {
  allowances: Record<LeaveType, number>
  weekendDays: number[] // 0 = Sunday … 6 = Saturday; Bangladesh: [5, 6]
}

// ---- API shapes ----

export interface Session {
  token: string
  user: Employee
}

/** Yearly totals across all leave types. */
export interface YearTotals {
  allowance: number
  used: number
  pending: number
}

/** A request joined with who asked for it (and, for HR, their yearly totals). */
export interface RequestRow {
  request: LeaveRequest
  employee: Employee
  yearly?: YearTotals
  decidedByName?: string
}

export interface ListRequestsParams {
  status?: Status | Status[]
  type?: LeaveType
  department?: string
  from?: string // leave dates overlapping [from, to]
  to?: string
  year?: number
  q?: string
  mine?: boolean
  page?: number // omit page/pageSize to get every match
  pageSize?: number
}

export interface Page<T> {
  items: T[]
  total: number
}

export interface RequestInput {
  type: LeaveType
  startDate: string
  endDate: string
  reason: string
  attachment?: Attachment
}

export interface Decision {
  status: Exclude<Status, 'pending'>
  note?: string
}

export interface RequestDetail extends RequestRow {
  balances: Balance[]
  /** Teammates in the same department away during these dates (HR view). */
  overlapping: RequestRow[]
  decider?: Employee
}

export interface CalendarFilters {
  department?: string
  type?: LeaveType
  includePending: boolean
}

export interface CalendarEntry {
  request: LeaveRequest
  employee: Employee
  daysLeft?: number // only sent to HR
}

export interface Profile extends Employee {
  notifyOnChange: boolean
  weeklyDigest: boolean
}

export interface ProfileUpdate {
  firstName: string
  lastName: string
  age: number
  email: string
  notifyOnChange: boolean
  weeklyDigest: boolean
  currentPassword?: string
  newPassword?: string
}
