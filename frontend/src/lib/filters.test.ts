// Run with: npm test.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ALL, optionsFrom } from './filters.ts'

test('ALL is the value of the "All …" option', () => {
  assert.equal(ALL, 'all')
})

test('optionsFrom puts the "All …" option first', () => {
  assert.deepEqual(optionsFrom('All departments', []), [{ value: 'all', label: 'All departments' }])
})

test('optionsFrom accepts plain strings and {value,label} objects, keeping order', () => {
  assert.deepEqual(optionsFrom('All', ['Sales', { value: '7', label: 'Engineering' }, 'HR']), [
    { value: ALL, label: 'All' },
    { value: 'Sales', label: 'Sales' },
    { value: '7', label: 'Engineering' },
    { value: 'HR', label: 'HR' },
  ])
})
