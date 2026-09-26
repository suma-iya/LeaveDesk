// Run with: npm test  (Node's built-in test runner; no extra dependency)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { available, overlaps, pluralDays, workingDays } from './leave.ts'

test('workingDays skips Friday and Saturday (same cases as the Go tests)', () => {
  const cases: [string, string, number][] = [
    ['2026-10-06', '2026-10-06', 1], // single weekday
    ['2026-10-04', '2026-10-08', 5], // Sun–Thu week
    ['2026-10-09', '2026-10-09', 0], // Friday
    ['2026-10-09', '2026-10-10', 0], // Fri–Sat weekend
    ['2026-10-08', '2026-10-11', 2], // Thu to Sun
    ['2026-10-04', '2026-10-17', 10], // two weeks
    ['2026-10-08', '2026-10-04', 0], // end before start
    ['2026-09-29', '2026-10-02', 3], // across months
  ]
  for (const [start, end, want] of cases) assert.equal(workingDays(start, end), want, `${start}..${end}`)
})

test('available = limit − used − pending', () => {
  assert.equal(available({ limit: 16, used: 5, pending: 5 }), 6)
  assert.equal(available({ limit: 3, used: 3, pending: 0 }), 0)
})

test('overlaps treats both ends as inclusive', () => {
  const a = { startDate: '2026-10-04', endDate: '2026-10-08' }
  assert.equal(overlaps(a, { startDate: '2026-10-08', endDate: '2026-10-11' }), true)
  assert.equal(overlaps(a, { startDate: '2026-10-09', endDate: '2026-10-11' }), false)
})

test('pluralDays', () => {
  assert.equal(pluralDays(1), '1 day')
  assert.equal(pluralDays(6), '6 days')
})
