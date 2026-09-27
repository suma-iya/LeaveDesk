// Run with: npm test. sidebar.ts reads localStorage once, when it is loaded,
// so every case stubs the global first and then imports a fresh copy of the
// module (a distinct ?query makes Node evaluate it again).
//
// A server render always shows the "expanded" snapshot, so the stored state
// is read through toggle(): it saves the opposite of the current state.
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

type SidebarModule = typeof import('./sidebar.ts')
type SidebarState = ReturnType<SidebarModule['useSidebarState']>

/** A localStorage stand-in; `throws` makes every access fail like blocked storage. */
function fakeStorage(initial: Record<string, string> = {}, throws = false) {
  const data = new Map(Object.entries(initial))
  const writes: [string, string][] = []
  const fail = () => { throw new DOMException('The operation is insecure.', 'SecurityError') }
  return {
    writes,
    getItem: (key: string) => (throws ? fail() : data.get(key) ?? null),
    setItem: (key: string, value: string) => { if (throws) fail(); writes.push([key, value]); data.set(key, value) },
  }
}

let loads = 0
async function load(storage: ReturnType<typeof fakeStorage>): Promise<SidebarModule> {
  Object.assign(globalThis, { localStorage: storage })
  return import(`./sidebar.ts?case=${++loads}`)
}
afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage })

/** Renders a probe with the hook; returns the markup and the hook's result. */
function render({ useSidebarState }: SidebarModule) {
  const seen: SidebarState[] = []
  function Probe() {
    const state = useSidebarState()
    seen.push(state)
    return h('p', null, state.collapsed ? 'collapsed' : 'expanded')
  }
  const html = renderToStaticMarkup(h(Probe))
  return { html, state: seen.at(-1)! }
}

/** The state before a toggle, read from what the toggle saves. */
function stateBeforeToggle(mod: SidebarModule, storage: ReturnType<typeof fakeStorage>) {
  render(mod).state.toggle()
  const [key, saved] = storage.writes.at(-1)!
  assert.equal(key, 'leavedesk-sidebar')
  return saved === 'expanded' ? 'collapsed' : 'expanded'
}

test('stored values: only "collapsed" collapses; anything else starts expanded', async () => {
  const cases: [Record<string, string>, 'collapsed' | 'expanded'][] = [
    [{ 'leavedesk-sidebar': 'collapsed' }, 'collapsed'],
    [{ 'leavedesk-sidebar': 'expanded' }, 'expanded'],
    [{ 'leavedesk-sidebar': 'COLLAPSED' }, 'expanded'],
    [{ 'leavedesk-sidebar': '{"collapsed":true}' }, 'expanded'],
    [{}, 'expanded'],
    [{ 'other-key': 'collapsed' }, 'expanded'],
  ]
  for (const [stored, want] of cases) {
    const storage = fakeStorage(stored)
    assert.equal(stateBeforeToggle(await load(storage), storage), want, JSON.stringify(stored))
  }
})

test('storage that throws on read starts expanded instead of crashing', async () => {
  // Reads fail, writes work: the first toggle collapses.
  const storage = fakeStorage({ 'leavedesk-sidebar': 'collapsed' })
  const blockedReads = { ...storage, getItem: () => { throw new DOMException('blocked', 'SecurityError') } }
  const mod = await load(blockedReads)
  render(mod).state.toggle()
  assert.deepEqual(storage.writes, [['leavedesk-sidebar', 'collapsed']])
})

test('toggle flips the state each time and saves it', async () => {
  const storage = fakeStorage({ 'leavedesk-sidebar': 'collapsed' })
  const { state } = render(await load(storage))
  state.toggle()
  state.toggle()
  state.toggle()
  assert.deepEqual(storage.writes.map(([, v]) => v), ['expanded', 'collapsed', 'expanded'])
})

test('toggle still works for this page when storage is blocked', async () => {
  const mod = await load(fakeStorage({}, true))
  assert.doesNotThrow(() => render(mod).state.toggle())
  // The in-memory state flipped: swap in working storage and toggle back.
  const storage = fakeStorage()
  Object.assign(globalThis, { localStorage: storage })
  render(mod).state.toggle()
  assert.deepEqual(storage.writes, [['leavedesk-sidebar', 'expanded']])
})

test('server render always uses the expanded snapshot', async () => {
  const { html, state } = render(await load(fakeStorage({ 'leavedesk-sidebar': 'collapsed' })))
  assert.equal(html, '<p>expanded</p>')
  assert.equal(state.collapsed, false)
})
