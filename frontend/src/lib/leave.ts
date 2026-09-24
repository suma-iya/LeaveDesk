import { eachDayOfInterval, getDay, parseISO } from 'date-fns'
import type { Balance, LeaveType, YearTotals } from '@/types'

export const LEAVE_TYPES: LeaveType[] = ['Annual', 'Casual', 'Sick']

/** Bangladesh: Friday (5) and Saturday (6). The Go backend uses the same rule. */
export const DEFAULT_WEEKEND = [5, 6]

type DateLike = string | Date
const toDate = (value: DateLike) => (typeof value === 'string' ? parseISO(value) : value)

export function isWeekend(date: DateLike, weekendDays: number[] = DEFAULT_WEEKEND) {
  return weekendDays.includes(getDay(toDate(date)))
}

/** Days between start and end (inclusive) that are not weekend days. */
export function workingDays(start: DateLike, end: DateLike, weekendDays: number[] = DEFAULT_WEEKEND) {
  const from = toDate(start)
  const to = toDate(end)
  if (to < from) return 0
  return eachDayOfInterval({ start: from, end: to }).filter((d) => !isWeekend(d, weekendDays)).length
}

/** Days still free to request: allowance − used − pending. */
export const available = (b: Pick<Balance, 'allowance' | 'used' | 'pending'>) => b.allowance - b.used - b.pending

interface DateRange {
  startDate: string
  endDate: string
}

/** Two inclusive ISO date ranges share at least one day. */
export const overlaps = (a: DateRange, b: DateRange) => a.startDate <= b.endDate && b.startDate <= a.endDate

export function sumBalances(balances: Balance[]): YearTotals {
  return balances.reduce(
    (t, b) => ({ allowance: t.allowance + b.allowance, used: t.used + b.used, pending: t.pending + b.pending }),
    { allowance: 0, used: 0, pending: 0 },
  )
}

/** "1 day", "3 days" */
export const pluralDays = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`
