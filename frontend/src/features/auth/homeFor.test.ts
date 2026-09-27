// Run with: npm test. homeFor.ts has only a type import, so it loads directly.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { homeFor } from './homeFor.ts'

test('HR lands on the pending queue, employees on their own leave', () => {
  assert.equal(homeFor({ role: 'hr' }), '/hr/pending')
  assert.equal(homeFor({ role: 'employee' }), '/me')
})
