import { addDays, endOfMonth, startOfMonth } from 'date-fns'
import { toISODate } from './dates'
import { ALL } from './filters'

/** Options for the "Date range" filter; ranges match leave dates that overlap. */
export const DATE_RANGE_OPTIONS = [
  { value: 'next30', label: 'Next 30 days' },
  { value: 'next7', label: 'Next 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'next90', label: 'Next 90 days' },
  { value: ALL, label: 'Any dates' },
]

export function dateRange(value: string): { from?: string; to?: string } {
  const today = new Date()
  switch (value) {
    case 'next7': return { from: toISODate(today), to: toISODate(addDays(today, 7)) }
    case 'next30': return { from: toISODate(today), to: toISODate(addDays(today, 30)) }
    case 'next90': return { from: toISODate(today), to: toISODate(addDays(today, 90)) }
    case 'month': return { from: toISODate(startOfMonth(today)), to: toISODate(endOfMonth(today)) }
    default: return {}
  }
}
