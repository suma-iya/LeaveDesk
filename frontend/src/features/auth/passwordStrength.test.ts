// Run with: npm test. passwordStrength is a plain module, so Node imports it directly.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { passwordStrength } from './passwordStrength.ts'

test('passwordStrength scores one point per rule (0 = Too short … 4 = Strong)', () => {
  // Rules: ≥8 chars · upper+lower case · a digit · a symbol or ≥12 chars.
  const cases: [string, number, string][] = [
    ['', 0, 'empty'],
    ['abc', 0, 'short, lower case only'],
    ['abcdefgh', 1, '8 chars'],
    ['ABCDEFGH', 1, 'upper case only is not mixed case'],
    ['Abcdefgh', 2, '8 chars + mixed case'],
    ['abcdefg1', 2, '8 chars + digit'],
    ['abcdefg!', 2, '8 chars + symbol'],
    ['abcdefghijkl', 2, '12 chars counts like a symbol'],
    ['Abcdefg1', 3, 'length + case + digit'],
    ['Abcdef1!', 4, 'all four'],
    ['Abcdefghijk1', 4, '12 chars stands in for the symbol'],
    ['abcdefghij!!', 2, 'symbol and 12 chars count once'],
    ['pass word', 2, 'a space is a symbol'],
    ['pässwörd', 2, 'non-ASCII letters count as symbols'],
  ]
  for (const [pw, want, why] of cases) assert.equal(passwordStrength(pw), want, `${JSON.stringify(pw)}: ${why}`)
})

test('passwordStrength scores short passwords too (the length error hides the label)', () => {
  // Under 8 characters the form shows "Use at least 8 characters." instead of
  // the Strength hint, but the score (and the 4-segment bar) still counts the
  // other rules.
  assert.equal(passwordStrength('1'), 1)
  assert.equal(passwordStrength('Ab1!'), 3)
})
