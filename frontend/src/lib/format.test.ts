// Run with: npm test. format.ts has only a type import from '@/types', which
// Node's type stripping erases, so it loads directly.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ageOn, formatBDT, formatBytes, fullName, ROLE_LABEL, tenure } from './format.ts'

test('fullName joins first and last name', () => {
  assert.equal(fullName({ firstName: 'Nadia', lastName: 'Rahman' }), 'Nadia Rahman')
})

test('ROLE_LABEL spells each role for the UI', () => {
  assert.deepEqual(ROLE_LABEL, { hr: 'HR', employee: 'Employee' })
})

test('formatBytes: KB below 1 MiB (at least 1 KB), MB with one decimal above', () => {
  const cases: [number, string][] = [
    [0, '1 KB'],
    [1, '1 KB'],
    [1024, '1 KB'],
    [1535, '1 KB'],
    [1536, '2 KB'],
    [84 * 1024, '84 KB'],
    [1024 * 1024, '1.0 MB'],
    [1.2 * 1024 * 1024, '1.2 MB'],
    [5 * 1024 * 1024, '5.0 MB'],
  ]
  for (const [bytes, want] of cases) assert.equal(formatBytes(bytes), want, String(bytes))
})

test('formatBDT groups thousands', () => {
  const cases: [number, string][] = [
    [0, 'BDT 0'],
    [950, 'BDT 950'],
    [85000, 'BDT 85,000'],
    [1234567, 'BDT 1,234,567'],
  ]
  for (const [amount, want] of cases) assert.equal(formatBDT(amount), want)
})

test('ageOn counts whole years and turns over on the birthday itself', () => {
  const on = (y: number, m: number, d: number) => new Date(y, m - 1, d)
  const cases: [string, Date, number, string][] = [
    ['2000-09-27', on(2026, 9, 27), 26, 'birthday today'],
    ['2000-09-28', on(2026, 9, 27), 25, 'birthday tomorrow'],
    ['2000-09-26', on(2026, 9, 27), 26, 'birthday yesterday'],
    ['2000-10-01', on(2026, 9, 30), 25, 'later month'],
    ['2000-08-31', on(2026, 9, 1), 26, 'earlier month, later day'],
    ['2000-12-31', on(2026, 1, 1), 25, 'new year’s day, birthday on 31 Dec'],
    ['2000-01-01', on(2026, 12, 31), 26, 'last day of the year'],
    ['2008-09-27', on(2026, 9, 27), 18, 'turns 18 today'],
    ['2008-09-28', on(2026, 9, 27), 17, 'turns 18 tomorrow'],
    ['2004-02-29', on(2026, 2, 28), 21, 'leap-day birthday, 28 Feb of a common year'],
    ['2004-02-29', on(2026, 3, 1), 22, 'leap-day birthday, 1 Mar of a common year'],
    ['2004-02-29', on(2028, 2, 29), 24, 'leap-day birthday on a leap day'],
    ['2026-09-27', on(2026, 9, 27), 0, 'born today'],
  ]
  for (const [dob, today, want, why] of cases) assert.equal(ageOn(dob, today), want, why)
})

test('tenure in years and months, singular/plural, never negative', () => {
  const on = (y: number, m: number, d: number) => new Date(y, m - 1, d)
  const cases: [string, Date, string][] = [
    ['2022-03-15', on(2026, 9, 27), '4 years 6 months'],
    ['2025-09-27', on(2026, 9, 27), '1 year'],
    ['2024-09-27', on(2026, 9, 27), '2 years'],
    ['2025-08-27', on(2026, 9, 27), '1 year 1 month'],
    ['2024-07-01', on(2026, 9, 27), '2 years 2 months'],
    ['2026-08-27', on(2026, 9, 27), '1 month'],
    ['2026-09-01', on(2026, 9, 27), '0 months'],
    ['2026-08-28', on(2026, 9, 27), '0 months'], // one day short of a month
    ['2026-09-27', on(2026, 9, 27), '0 months'], // joined today
    ['2027-01-01', on(2026, 9, 27), '0 months'], // future join date
  ]
  for (const [joined, today, want] of cases) assert.equal(tenure(joined, today), want, `${joined} → ${today.toDateString()}`)
})
