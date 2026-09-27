// Run with: npm test. useHrFilters.ts imports through @/, so Vite loads it.
// The hook runs inside react-dom/server with the departments query seeded:
// each render records its result and then runs the next scripted step (a
// state update during render makes React render again at once).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'

interface Filter { kind: 'search' | 'select'; id: string; value: string; label?: string; placeholder?: string; defaultValue?: string; options?: { value: string; label: string }[]; onChange: (v: string) => void }
interface Result { filters: Filter[]; params: Record<string, unknown>; reset: () => void; key: string }

let vite: ViteDevServer
let useHrFilters: (options?: { withStatus?: boolean }) => Result
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' })
  ;({ useHrFilters } = await vite.ssrLoadModule('/src/features/hr/useHrFilters.ts'))
})
after(() => vite.close())

const DEPARTMENTS = [{ id: 3, name: 'Engineering' }, { id: 7, name: 'Sales' }]

/** Runs the steps; returns the hook result from the last render. */
function play(steps: ((r: Result) => void)[] = [], options?: { withStatus?: boolean }, departments: unknown = DEPARTMENTS) {
  const client = new QueryClient()
  if (departments) client.setQueryData(['departments'], departments)
  const queue = [...steps]
  const renders: Result[] = []
  function Harness() {
    const result = useHrFilters(options)
    renders.push(result)
    queue.shift()?.(result)
    return null
  }
  renderToStaticMarkup(h(QueryClientProvider, { client }, h(Harness)))
  return renders.at(-1)!
}
const byId = (r: Result, id: string) => r.filters.find((f) => f.id === id)!

test('starts with no filters: empty params and key "{}"', () => {
  const r = play()
  assert.deepEqual(JSON.parse(JSON.stringify(r.params)), {})
  assert.equal(r.key, '{}')
  assert.deepEqual(r.filters.map((f) => [f.kind, f.id]), [['search', 'q'], ['select', 'department'], ['select', 'type']])
  assert.equal(byId(r, 'q').placeholder, 'Search employee')
})

test('department options come from the departments query, ids as strings', () => {
  assert.deepEqual(byId(play(), 'department').options, [
    { value: 'all', label: 'All departments' },
    { value: '3', label: 'Engineering' },
    { value: '7', label: 'Sales' },
  ])
  assert.deepEqual(byId(play([], undefined, null), 'department').options, [{ value: 'all', label: 'All departments' }], 'before departments load')
})

test('the status select is only there withStatus, and lists every status', () => {
  assert.equal(byId(play(), 'status'), undefined)
  const status = byId(play([], { withStatus: true }), 'status')
  assert.deepEqual(status.options, [
    { value: 'all', label: 'All statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'cancelled', label: 'Cancelled' },
  ])
})

test('selections become request params: department as a number, status as a list', () => {
  const r = play([
    (r) => byId(r, 'department').onChange('7'),
    (r) => byId(r, 'type').onChange('casual'),
    (r) => byId(r, 'status').onChange('approved'),
  ], { withStatus: true })
  assert.deepEqual(r.params, { q: undefined, department: 7, type: 'casual', status: ['approved'] })
  assert.equal(r.key, '{"department":7,"type":"casual","status":["approved"]}')
})

test('the key changes with the filters, so paging can reset', () => {
  const before = play().key
  const after = play([(r) => byId(r, 'type').onChange('sick')]).key
  assert.notEqual(before, after)
  assert.equal(after, '{"type":"sick"}')
})

test('search text shows at once but reaches params only after the debounce', () => {
  // Effects never run in a server render, so the debounced value stays ''.
  const r = play([(r) => byId(r, 'q').onChange('nadia')])
  assert.equal(byId(r, 'q').value, 'nadia')
  assert.equal(r.params.q, undefined)
})

test('choosing "all" clears a filter again', () => {
  const r = play([(r) => byId(r, 'department').onChange('3'), (r) => byId(r, 'department').onChange('all')])
  assert.equal(r.params.department, undefined)
  assert.equal(r.key, '{}')
})

test('reset clears search, department, type and status', () => {
  const r = play([
    (r) => byId(r, 'q').onChange('x'),
    (r) => byId(r, 'department').onChange('3'),
    (r) => byId(r, 'type').onChange('annual'),
    (r) => byId(r, 'status').onChange('rejected'),
    (r) => r.reset(),
  ], { withStatus: true })
  assert.deepEqual(r.filters.map((f) => f.value), ['', 'all', 'all', 'all'])
  assert.equal(r.key, '{}')
})
