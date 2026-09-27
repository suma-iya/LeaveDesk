// Leave rules shared with the Go backend (internal/leave): the same weekend
// and the same working-day count, so the form and the server always agree.
// No path aliases here: `node --test` runs this file directly.
import { eachDayOfInterval, getDay, parseISO } from 'date-fns'
import type { Balance, LeaveType, YearTotal } from '../types.ts'

export const LEAVE_TYPES: LeaveType[] = ['annual', 'casual', 'sick']

export const TYPE_LABEL: Record<LeaveType, string> = { annual: 'Annual', casual: 'Casual', sick: 'Sick' }

/** Friday (5) and Saturday (6). */
export const WEEKEND_DAYS = [5, 6]

type DateLike = string | Date
const toDate = (value: DateLike) => (typeof value === 'string' ? parseISO(value) : value)

export const isWeekend = (date: DateLike) => WEEKEND_DAYS.includes(getDay(toDate(date)))

/** Dates from start to end (inclusive) that are not Friday or Saturday. */
export function workingDays(start: DateLike, end: DateLike) {
  const from = toDate(start)
  const to = toDate(end)
  if (to < from) return 0
  return eachDayOfInterval({ start: from, end: to }).filter((d) => !isWeekend(d)).length
}

/** available = limit − used − pending */
export const available = (b: Pick<Balance, 'limit' | 'used' | 'pending'>) => b.limit - b.used - b.pending

interface DateRange {
  startDate: string
  endDate: string
}

/** Two inclusive ISO ranges share at least one day. */
export const overlaps = (a: DateRange, b: DateRange) => a.startDate <= b.endDate && b.startDate <= a.endDate

export function sumBalances(balances: Balance[]): YearTotal {
  return balances.reduce(
    (t, b) => ({ limit: t.limit + b.limit, used: t.used + b.used, pending: t.pending + b.pending }),
    { limit: 0, used: 0, pending: 0 },
  )
}

/** "1 day", "6 days" */
export const pluralDays = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`

/** Used days per type in their colours, then pending as amber stripes (for StackedBar). */
export function yearlySegments(balances: Balance[]) {
  return [
    ...balances.map((b) => ({ type: b.type, days: b.used })),
    { type: 'pending' as const, days: balances.reduce((n, b) => n + b.pending, 0) },
  ]
}
