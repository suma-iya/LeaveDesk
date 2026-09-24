import { format, isSameMonth, isSameYear, parseISO } from 'date-fns'

// Every date the user sees includes the year, in day-month order.
// The API always uses ISO "yyyy-MM-dd".

type DateLike = string | Date

const toDate = (value: DateLike) => (typeof value === 'string' ? parseISO(value) : value)

export const toISODate = (date: Date) => format(date, 'yyyy-MM-dd')

/** 22 Sep 2026 */
export const formatDate = (value: DateLike) => format(toDate(value), 'dd MMM yyyy')

/** Sun, 04 Oct 2026 */
export const formatDateWithWeekday = (value: DateLike) => format(toDate(value), 'EEE, dd MMM yyyy')

/** Wednesday, 7 October 2026 */
export const formatLongDate = (value: DateLike) => format(toDate(value), 'EEEE, d MMMM yyyy')

/** October 2026 */
export const formatMonth = (value: DateLike) => format(toDate(value), 'MMMM yyyy')

/**
 * 06 Oct 2026 · 04–08 Oct 2026 · 29 Sep – 02 Oct 2026 · 28 Dec 2026 – 03 Jan 2027
 */
export function formatRange(start: DateLike, end: DateLike) {
  const a = toDate(start)
  const b = toDate(end)
  if (toISODate(a) === toISODate(b)) return formatDate(a)
  if (isSameMonth(a, b)) return `${format(a, 'dd')}–${format(b, 'dd MMM yyyy')}`
  if (isSameYear(a, b)) return `${format(a, 'dd MMM')} – ${format(b, 'dd MMM yyyy')}`
  return `${formatDate(a)} – ${formatDate(b)}`
}

/** Month key used by the calendar API: "2026-10" */
export const monthKey = (value: DateLike) => format(toDate(value), 'yyyy-MM')
