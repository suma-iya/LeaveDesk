// Run with: npm test.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cn } from './utils.ts'

test('cn joins truthy class names and skips falsy ones', () => {
  const off = false as boolean
  assert.equal(cn('a', off && 'b', null, undefined, '', 'c'), 'a c')
  assert.equal(cn(), '')
})

test('cn accepts objects and nested arrays', () => {
  assert.equal(cn({ on: true, off: false }, ['x', ['y']]), 'on x y')
})

test('cn lets a later Tailwind class override a conflicting earlier one', () => {
  const cases: [string[], string][] = [
    [['px-2 py-1', 'px-4'], 'py-1 px-4'],
    [['text-red-500', 'text-blue-500'], 'text-blue-500'],
    [['h-9 w-[140px]', 'h-11 w-full'], 'h-11 w-full'], // AppButton size override
    [['bg-primary', 'bg-surface'], 'bg-surface'], // theme colour tokens
  ]
  for (const [input, want] of cases) assert.equal(cn(...input), want, input.join(' + '))
})
