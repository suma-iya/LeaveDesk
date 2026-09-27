// Run with: npm test. usePaging.ts imports only React, so it loads directly.
// The hook is driven inside react-dom/server: each render records the hook's
// result and then runs the next scripted step. A state update made during
// render makes React render the component again at once, so a whole script
// plays out in one renderToStaticMarkup call.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement as h, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PAGE_SIZES, usePaging } from './usePaging.ts'

type Paging = ReturnType<typeof usePaging>
type Step = (paging: Paging, setKey: (key: string) => void) => void

/** Renders once per step; returns {key, page, pageSize} as seen by each render. */
function play(steps: Step[], initialKey = 'filters-a') {
  const seen: { key: string; page: number; pageSize: number }[] = []
  const queue = [...steps]
  function Harness() {
    const [key, setKey] = useState(initialKey)
    const paging = usePaging(key)
    seen.push({ key, page: paging.page, pageSize: paging.pageSize })
    queue.shift()?.(paging, setKey)
    return null
  }
  renderToStaticMarkup(h(Harness))
  // usePaging may itself re-render while adjusting to a new key; keep only
  // the last render for each distinct state.
  return seen.filter((s, i) => i === seen.length - 1 || JSON.stringify(s) !== JSON.stringify(seen[i + 1]))
}

test('page sizes offered', () => {
  assert.deepEqual(PAGE_SIZES, [10, 20, 40])
})

test('starts on page 1 with the smallest page size', () => {
  assert.deepEqual(play([]), [{ key: 'filters-a', page: 1, pageSize: 10 }])
})

test('setPage moves to that page', () => {
  assert.deepEqual(play([(p) => p.setPage(3)]).at(-1), { key: 'filters-a', page: 3, pageSize: 10 })
})

test('a new filters key goes back to page 1', () => {
  const seen = play([(p) => p.setPage(4), (_, setKey) => setKey('filters-b')])
  assert.deepEqual(seen.map((s) => [s.key, s.page]), [['filters-a', 1], ['filters-a', 4], ['filters-b', 1]])
})

test('changing the page size goes back to page 1 and keeps the size', () => {
  const seen = play([(p) => p.setPage(5), (p) => p.setPageSize(40)])
  assert.deepEqual(seen.at(-1), { key: 'filters-a', page: 1, pageSize: 40 })
})

test('the page size survives a filters change', () => {
  const seen = play([(p) => p.setPageSize(20), (p) => p.setPage(2), (_, setKey) => setKey('filters-b')])
  assert.deepEqual(seen.at(-1), { key: 'filters-b', page: 1, pageSize: 20 })
})

test('setPage after a filters change applies to the new filters', () => {
  const seen = play([(_, setKey) => setKey('filters-b'), (p) => p.setPage(2)])
  assert.deepEqual(seen.at(-1), { key: 'filters-b', page: 2, pageSize: 10 })
})
