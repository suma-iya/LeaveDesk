import type { CalendarDay, LeaveType } from '@/types'
import { request, toQuery } from './http'

export interface CalendarFilters {
  department?: number
  type?: LeaveType
  includePending: boolean
}

export const calendarApi = {
  month: (month: string, f: CalendarFilters) =>
    request<{ month: string; days: CalendarDay[] }>(`/calendar${toQuery({ month, department: f.department, type: f.type, includePending: f.includePending })}`),
}
