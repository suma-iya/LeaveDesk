// Run with: npm test. yearTypeFilters.ts imports through @/, so Vite loads it.
// The hook runs inside react-dom/server: each render records its result and
// then runs the next scripted step (a state update during render makes React
// render again at once), so a whole script plays out in one render call.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer, type ViteDevServer } from 'vite'

interface Select { kind: 'select'; id: string; label: string; value: string; defaultValue: string; options: { value: string; label: string }[]; onChange: (v: string) => void }
interface Result { filters: Select[]; type: string | undefined; year: number; reset: () => void }

let vite: ViteDevServer
let useYearTypeFilters: () => Result
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' })
  ;({ useYearTypeFilters } = await vite.ssrLoadModule('/src/features/employee/yearTypeFilters.ts'))
})
after(() => vite.close())

/** Runs the steps; returns the hook result from the last render. */
function play(steps: ((r: Result) => void)[] = []) {
  const queue = [...steps]
  const renders: Result[] = []
  function Harness() {
    const result = useYearTypeFilters()
    renders.push(result)
    queue.shift()?.(result)
    return null
  }
  renderToStaticMarkup(h(Harness))
  return renders.at(-1)!
}
const byId = (r: Result, id: string) => r.filters.find((f) => f.id === id)!
const thisYear = new Date().getFullYear()

test('starts on all leave types in the current year', () => {
  const r = play()
  assert.equal(r.type, undefined)
  assert.equal(r.year, thisYear)
  assert.deepEqual(r.filters.map((f) => [f.id, f.label, f.value, f.defaultValue]), [
    ['type', 'Leave type', 'all', 'all'],
    ['year', 'Year', String(thisYear), String(thisYear)],
  ])
})

test('leave type options: "All leave types" then each type by label', () => {
  assert.deepEqual(byId(play(), 'type').options, [
    { value: 'all', label: 'All leave types' },
    { value: 'annual', label: 'Annual' },
    { value: 'casual', label: 'Casual' },
    { value: 'sick', label: 'Sick' },
  ])
})

test('year options: next year, this year, last year', () => {
  assert.deepEqual(byId(play(), 'year').options.map((o) => o.value), [thisYear + 1, thisYear, thisYear - 1].map(String))
})

test('choosing a type and a year turns them into query values', () => {
  const r = play([(r) => byId(r, 'type').onChange('sick'), (r) => byId(r, 'year').onChange(String(thisYear - 1))])
  assert.equal(r.type, 'sick')
  assert.equal(r.year, thisYear - 1)
  assert.equal(byId(r, 'type').value, 'sick')
})

test('choosing "all" again clears the type', () => {
  const r = play([(r) => byId(r, 'type').onChange('annual'), (r) => byId(r, 'type').onChange('all')])
  assert.equal(r.type, undefined)
})

test('reset goes back to all types in the current year', () => {
  const r = play([(r) => byId(r, 'type').onChange('casual'), (r) => byId(r, 'year').onChange(String(thisYear + 1)), (r) => r.reset()])
  assert.equal(r.type, undefined)
  assert.equal(r.year, thisYear)
})
