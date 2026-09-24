import type {
  Attachment, Balance, CalendarEntry, CalendarFilters, Decision, Employee, LeaveRequest,
  ListRequestsParams, Page, Policy, Profile, ProfileUpdate, RequestDetail, RequestInput, RequestRow, Session,
} from '@/types'

/**
 * Everything the UI can ask of the backend. `httpApi` (real REST calls) and
 * `mockApi` (in-memory seed data) both implement it, so pages never know
 * which one they are talking to.
 */
export interface LeaveApi {
  // auth
  authConfig(): Promise<{ googleClientId: string }>
  login(email: string, password: string): Promise<Session>
  loginWithGoogle(credential: string): Promise<Session>
  me(): Promise<Employee>

  // requests
  listRequests(params: ListRequestsParams): Promise<Page<RequestRow>>
  getRequest(id: string): Promise<RequestDetail>
  createRequest(input: RequestInput): Promise<LeaveRequest>
  updateRequest(id: string, input: RequestInput): Promise<LeaveRequest>
  cancelRequest(id: string): Promise<void>
  decideRequest(id: string, decision: Decision): Promise<LeaveRequest>
  bulkDecide(ids: string[], decision: Decision): Promise<LeaveRequest[]>
  /** Undo a decision: the request goes back to pending. */
  reopenRequest(id: string): Promise<LeaveRequest>

  // balances & policy
  getBalances(employeeId: string, year: number): Promise<Balance[]>
  getPolicy(): Promise<Policy>
  listDepartments(): Promise<string[]>

  // calendar
  getCalendar(month: string, filters: CalendarFilters): Promise<CalendarEntry[]> // month = "yyyy-MM"

  // profile & files
  getProfile(): Promise<Profile>
  updateProfile(update: ProfileUpdate): Promise<Profile>
  uploadAvatar(file: File): Promise<string>
  uploadAttachment(file: File): Promise<Attachment>
}

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}
