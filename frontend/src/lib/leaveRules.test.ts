// Run with: npm test. Covers the parts of leave.ts that leave.test.ts doesn't.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LEAVE_TYPES, TYPE_LABEL, WEEKEND_DAYS, isWeekend, overlaps, sumBalances, workingDays } from './leave.ts'
import type { Balance } from '../types.ts'

test('leave types and their labels', () => {
  assert.deepEqual(LEAVE_TYPES, ['annual', 'casual', 'sick'])
  assert.deepEqual(LEAVE_TYPES.map((t) => TYPE_LABEL[t]), ['Annual', 'Casual', 'Sick'])
})

test('isWeekend is true only for Friday and Saturday', () => {
  assert.deepEqual(WEEKEND_DAYS, [5, 6])
  // 2026-10-04 is a Sunday.
  const week: [string, boolean][] = [
    ['2026-10-04', false], ['2026-10-05', false], ['2026-10-06', false], ['2026-10-07', false],
    ['2026-10-08', false], ['2026-10-09', true], ['2026-10-10', true],
  ]
  for (const [date, want] of week) assert.equal(isWeekend(date), want, date)
  assert.equal(isWeekend(new Date(2026, 9, 9)), true, 'Date object')
})

test('workingDays accepts Date objects and crosses a year boundary', () => {
  assert.equal(workingDays(new Date(2026, 9, 4), new Date(2026, 9, 8)), 5)
  // 27 Dec 2026 (Sun) .. 3 Jan 2027 (Sun): Sun–Thu + Sun = 6
  assert.equal(workingDays('2026-12-27', '2027-01-03'), 6)
  // Leap year February: 1–29 Feb 2028 has 29 days, 8 of them Fri/Sat.
  assert.equal(workingDays('2028-02-01', '2028-02-29'), 21)
})

test('overlaps: identical, containing, touching and disjoint ranges, in either order', () => {
  const r = (startDate: string, endDate: string) => ({ startDate, endDate })
  const cases: [ReturnType<typeof r>, ReturnType<typeof r>, boolean][] = [
    [r('2026-10-04', '2026-10-08'), r('2026-10-04', '2026-10-08'), true],
    [r('2026-10-01', '2026-10-31'), r('2026-10-10', '2026-10-12'), true],
    [r('2026-10-06', '2026-10-06'), r('2026-10-06', '2026-10-06'), true],
    [r('2026-10-01', '2026-10-03'), r('2026-10-03', '2026-10-05'), true],
    [r('2026-10-01', '2026-10-03'), r('2026-10-04', '2026-10-05'), false],
    [r('2026-09-30', '2026-09-30'), r('2026-10-01', '2026-10-01'), false],
  ]
  for (const [a, b, want] of cases) {
    assert.equal(overlaps(a, b), want, `${a.startDate}..${a.endDate} vs ${b.startDate}..${b.endDate}`)
    assert.equal(overlaps(b, a), want, 'symmetric')
  }
})

test('sumBalances adds limit, used and pending across types', () => {
  assert.deepEqual(sumBalances([]), { limit: 0, used: 0, pending: 0 })
  const b = (type: Balance['type'], limit: number, used: number, pending: number) => ({ type, limit, used, pending }) as Balance
  assert.deepEqual(sumBalances([b('annual', 16, 5, 2), b('casual', 10, 1, 0), b('sick', 14, 0, 3)]), { limit: 40, used: 6, pending: 5 })
})
