import type { CalendarEntry, CalendarFilters } from '@/types'
import { request, toQuery } from './http'

export const calendarApi = {
  getCalendar: (month: string, f: CalendarFilters) =>
    request<CalendarEntry[]>(`/calendar${toQuery({ month, department: f.department, type: f.type, includePending: f.includePending })}`),
}
