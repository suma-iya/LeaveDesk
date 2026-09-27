// Run with: npm test. decisions.ts imports through @/, so Vite loads it.
// The real API client runs against a stubbed fetch, sonner's toast is
// replaced to capture messages and the Undo action, and node:test's mock
// timers stand in for the 5-second window.
import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, mock, test } from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { toast } from 'sonner'
import { createServer, type ViteDevServer } from 'vite'

// decisions.ts registers a pagehide listener when it is loaded.
const pagehide: (() => void)[] = []
Object.assign(globalThis, {
  window: {
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener: (type: string, listener: () => void) => { if (type === 'pagehide') pagehide.push(listener) },
  },
})

// fetch: records each call and answers with `nextResponse`.
interface Call { url: string; method: string; body: unknown; keepalive: boolean | undefined }
let calls: Call[] = []
let nextResponse: () => Promise<Response> = async () => new Response('{}', { status: 200 })
globalThis.fetch = (async (url: string, init: RequestInit) => {
  calls.push({ url, method: init.method ?? 'GET', body: JSON.parse(String(init.body)), keepalive: init.keepalive })
  return nextResponse()
}) as typeof fetch

// sonner: capture toasts instead of rendering them.
interface Toast { kind: 'success' | 'error'; message: string; options?: { duration?: number; action?: { label: string; onClick: () => void } } }
let toasts: Toast[] = []
const dismissed: unknown[] = []
Object.assign(toast, {
  success: (message: string, options: Toast['options']) => { toasts.push({ kind: 'success', message, options }); return toasts.length },
  error: (message: string) => { toasts.push({ kind: 'error', message }); return toasts.length },
  dismiss: (id?: unknown) => { dismissed.push(id); return id },
})

type Status = 'approved' | 'rejected'
let vite: ViteDevServer
let decideWithUndo: (client: unknown, request: unknown, status: Status, note?: string) => void
let useHeldDecisions: () => Set<number>
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' })
  ;({ decideWithUndo, useHeldDecisions } = await vite.ssrLoadModule('/src/features/hr/decisions.ts'))
})
after(() => vite.close())

beforeEach(() => {
  calls = []
  toasts = []
  dismissed.length = 0
  nextResponse = async () => new Response('{}', { status: 200 })
  mock.timers.enable({ apis: ['setTimeout'] })
})
afterEach(() => mock.timers.reset())

/** Ids hidden right now, as a component using useHeldDecisions sees them. */
function held(): number[] {
  function Probe() {
    return h('p', null, JSON.stringify([...useHeldDecisions()]))
  }
  return JSON.parse(renderToStaticMarkup(h(Probe)).slice(3, -4))
}

/** A query client that records what gets refreshed. */
const fakeClient = () => {
  const invalidated: unknown[] = []
  return { invalidated, invalidateQueries: async ({ queryKey }: { queryKey: unknown }) => { invalidated.push(queryKey) } }
}
const leave = (id: number) => ({
  id, type: 'annual', startDate: '2026-10-04', endDate: '2026-10-08', status: 'pending',
  employee: { id: 'e1', firstName: 'Nadia', lastName: 'Rahman', department: null },
})
/** Lets the async send (fetch → json → finally) finish. */
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)) }

test('holds the decision for 5 seconds before sending it', async () => {
  const client = fakeClient()
  decideWithUndo(client, leave(1), 'approved')
  assert.deepEqual(held(), [1], 'row is hidden at once')
  assert.equal(calls.length, 0, 'nothing sent yet')

  mock.timers.tick(4999)
  await settle()
  assert.equal(calls.length, 0, 'still inside the undo window')
  assert.deepEqual(held(), [1])

  mock.timers.tick(1)
  await settle()
  assert.deepEqual(calls, [{ url: '/api/requests/1/decision', method: 'POST', body: { status: 'approved', note: '' }, keepalive: false }])
  assert.deepEqual(held(), [], 'released after sending')
  assert.ok(client.invalidated.some((k) => JSON.stringify(k) === '["requests"]'), 'leave data refreshed')
})

test('shows a 5-second toast naming the employee and dates, with Undo', async () => {
  decideWithUndo(fakeClient(), leave(2), 'approved')
  decideWithUndo(fakeClient(), leave(3), 'rejected', 'Overlaps the release')
  assert.deepEqual(toasts.map((t) => t.message), [
    'Approved Nadia Rahman’s leave (04–08 Oct 2026)',
    'Rejected Nadia Rahman’s leave (04–08 Oct 2026)',
  ])
  assert.equal(toasts[0].options?.duration, 5000)
  assert.equal(toasts[0].options?.action?.label, 'Undo')
  mock.timers.tick(5000)
  await settle()
})

test('sends a rejection with its note', async () => {
  decideWithUndo(fakeClient(), leave(4), 'rejected', 'Overlaps the release')
  mock.timers.tick(5000)
  await settle()
  assert.deepEqual(calls.map((c) => [c.url, c.body]), [['/api/requests/4/decision', { status: 'rejected', note: 'Overlaps the release' }]])
})

test('Undo inside the window cancels the decision and shows the row again', async () => {
  const client = fakeClient()
  decideWithUndo(client, leave(5), 'approved')
  mock.timers.tick(3000)
  toasts[0].options!.action!.onClick()
  assert.deepEqual(held(), [])
  mock.timers.tick(10_000)
  await settle()
  assert.equal(calls.length, 0, 'never sent')
  assert.deepEqual(client.invalidated, [])
})

test('Undo cancels only its own decision', async () => {
  decideWithUndo(fakeClient(), leave(6), 'approved')
  decideWithUndo(fakeClient(), leave(7), 'approved')
  assert.deepEqual(held().sort(), [6, 7])
  toasts[0].options!.action!.onClick()
  assert.deepEqual(held(), [7])
  mock.timers.tick(5000)
  await settle()
  assert.deepEqual(calls.map((c) => c.url), ['/api/requests/7/decision'])
})

test('a failed decision shows the server message and still releases the row', async () => {
  nextResponse = async () => new Response(JSON.stringify({ error: 'CONFLICT', message: 'This request was already decided.' }), { status: 409 })
  const client = fakeClient()
  decideWithUndo(client, leave(10), 'approved')
  mock.timers.tick(5000)
  await settle()
  assert.deepEqual(toasts.filter((t) => t.kind === 'error').map((t) => t.message), ['Nadia Rahman: This request was already decided.'])
  assert.deepEqual(held(), [])
  assert.ok(client.invalidated.length > 0, 'refreshes so the row shows its real state')
})

test('a network failure is reported, not thrown', async () => {
  nextResponse = async () => { throw new TypeError('Failed to fetch') }
  decideWithUndo(fakeClient(), leave(11), 'rejected')
  mock.timers.tick(5000)
  await settle()
  assert.deepEqual(toasts.filter((t) => t.kind === 'error').map((t) => t.message), ['Nadia Rahman: Cannot reach the server. Check your connection and try again.'])
  assert.deepEqual(held(), [])
})

test('pagehide sends every held decision at once with keepalive and stops the timers', async () => {
  decideWithUndo(fakeClient(), leave(12), 'approved')
  decideWithUndo(fakeClient(), leave(13), 'rejected', 'No cover')
  assert.equal(pagehide.length, 1, 'one listener registered on load')
  pagehide.forEach((l) => l())
  await settle()
  assert.deepEqual(calls.map((c) => [c.url, c.body, c.keepalive]), [
    ['/api/requests/12/decision', { status: 'approved', note: '' }, true],
    ['/api/requests/13/decision', { status: 'rejected', note: 'No cover' }, true],
  ])
  mock.timers.tick(5000)
  await settle()
  assert.equal(calls.length, 2, 'the timers do not send them a second time')
})

// If the page comes back from the back/forward cache and is hidden again,
// decisions already sent must not be posted a second time.
test('a second pagehide (after a back/forward-cache restore) does not resend decisions', async () => {
  decideWithUndo(fakeClient(), leave(14), 'approved')
  pagehide.forEach((l) => l())
  pagehide.forEach((l) => l())
  await settle()
  assert.equal(calls.length, 1)
  assert.deepEqual(held().filter((id) => id === 14), [])
})

// sonner pauses a toast's timer while it is hovered or the tab is hidden, so
// the Undo toast is closed when the decision is sent; a late Undo can't
// pretend to recall it.
test('once the decision is sent, its Undo toast is dismissed', async () => {
  decideWithUndo(fakeClient(), leave(15), 'approved')
  const toastId = toasts.length
  mock.timers.tick(5000)
  await settle()
  assert.deepEqual(dismissed, [toastId])
})
