import { eachDayOfInterval, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns'

import type { CalendarEntry } from '@/types'

/** Every day shown for a month: whole weeks, Sunday first. */
export const monthGrid = (month: Date) =>
  eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
  })

/** People on leave on an ISO day, approved first then by name. */
export function awayOn(entries: CalendarEntry[], iso: string) {
  return entries
    .filter((e) => e.request.startDate <= iso && e.request.endDate >= iso)
    .sort((a, b) => a.request.status.localeCompare(b.request.status) || a.employee.firstName.localeCompare(b.employee.firstName))
}

/** 0, 1, 2, 3+ people → heat level. */
export const heatLevel = (count: number) => Math.min(count, 3) as 0 | 1 | 2 | 3

export const HEAT_BG = ['bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3'] as const

