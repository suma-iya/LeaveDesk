// Run with: npm test. dates.ts imports only date-fns, so it loads directly.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatDate, formatDateWithWeekday, formatLongDate, formatMonth, formatRange, monthKey, toISODate } from './dates.ts'

test('toISODate writes the local calendar date as yyyy-MM-dd', () => {
  assert.equal(toISODate(new Date(2026, 9, 4)), '2026-10-04')
  assert.equal(toISODate(new Date(2026, 0, 1, 23, 59)), '2026-01-01')
})

test('single-date formats always include the year', () => {
  const cases: [(v: string | Date) => string, string | Date, string][] = [
    [formatDate, '2026-09-22', '22 Sep 2026'],
    [formatDate, new Date(2026, 8, 2), '02 Sep 2026'],
    [formatDateWithWeekday, '2026-10-04', 'Sun, 04 Oct 2026'],
    [formatLongDate, '2026-10-07', 'Wednesday, 7 October 2026'],
    [formatMonth, '2026-10-15', 'October 2026'],
    [monthKey, '2026-10-31', '2026-10'],
    [monthKey, new Date(2027, 0, 1), '2027-01'],
  ]
  for (const [fn, input, want] of cases) assert.equal(fn(input), want, `${fn.name}(${String(input)})`)
})

test('formatRange collapses shared month and year', () => {
  const cases: [string | Date, string | Date, string][] = [
    ['2026-10-06', '2026-10-06', '06 Oct 2026'], // one day
    ['2026-10-04', '2026-10-08', '04–08 Oct 2026'], // same month
    ['2026-09-29', '2026-10-02', '29 Sep – 02 Oct 2026'], // same year
    ['2026-12-28', '2027-01-03', '28 Dec 2026 – 03 Jan 2027'], // across years
    ['2025-10-04', '2026-10-08', '04 Oct 2025 – 08 Oct 2026'], // same month name, different year
    [new Date(2026, 9, 6, 9), new Date(2026, 9, 6, 17), '06 Oct 2026'], // same day, different times
    [new Date(2026, 9, 4), '2026-10-08', '04–08 Oct 2026'], // Date and string mixed
  ]
  for (const [start, end, want] of cases) assert.equal(formatRange(start, end), want, `${String(start)}..${String(end)}`)
})
