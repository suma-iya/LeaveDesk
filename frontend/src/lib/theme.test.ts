// Run with: npm test. theme.ts reads localStorage and prefers-color-scheme
// once, when it is loaded, so every case stubs the globals first and then
// imports a fresh copy of the module (a distinct ?query makes Node evaluate
// it again).
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

type ThemeModule = typeof import('./theme.ts')

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

/** Stubs window.matchMedia, document and localStorage, then loads theme.ts. */
let loads = 0
async function load({ stored = {} as Record<string, string>, throws = false, systemDark = false } = {}) {
  const storage = fakeStorage(stored, throws)
  const changeListeners: ((event: { matches: boolean }) => void)[] = []
  const media = { matches: systemDark, addEventListener: (_: string, l: (event: { matches: boolean }) => void) => changeListeners.push(l) }
  const classes = new Set<string>()
  const toggles: [string, boolean][] = []
  Object.assign(globalThis, {
    localStorage: storage,
    window: { matchMedia: (query: string) => { assert.equal(query, '(prefers-color-scheme: dark)'); return media } },
    document: { documentElement: { classList: { toggle: (name: string, on: boolean) => { toggles.push([name, on]); if (on) classes.add(name); else classes.delete(name) } } } },
  })
  const mod: ThemeModule = await import(`./theme.ts?case=${++loads}`)
  /** Simulates the OS switching between light and dark. */
  const systemChanges = (dark: boolean) => { media.matches = dark; changeListeners.forEach((l) => l({ matches: dark })) }
  return { ...mod, storage, classes, toggles, systemChanges }
}
afterEach(() => {
  for (const key of ['localStorage', 'window', 'document']) delete (globalThis as Record<string, unknown>)[key]
})

/** The theme a component sees now (useTheme rendered with react-dom/server). */
function readTheme({ useTheme }: ThemeModule) {
  const seen: ReturnType<ThemeModule['useTheme']>[] = []
  function Probe() {
    const result = useTheme()
    seen.push(result)
    return h('p', null, result.theme)
  }
  renderToStaticMarkup(h(Probe))
  return seen.at(-1)!
}

test('initial theme: a valid stored choice wins, otherwise the system preference', async () => {
  const cases: [Record<string, string>, boolean, 'light' | 'dark'][] = [
    [{ 'leavedesk-theme': 'dark' }, false, 'dark'],
    [{ 'leavedesk-theme': 'light' }, true, 'light'],
    [{}, true, 'dark'],
    [{}, false, 'light'],
    [{ 'leavedesk-theme': 'purple' }, true, 'dark'],
    [{ 'leavedesk-theme': 'Dark' }, false, 'light'],
    [{ 'leavedesk-theme': '' }, true, 'dark'],
  ]
  for (const [stored, systemDark, want] of cases) {
    const t = await load({ stored, systemDark })
    assert.equal(readTheme(t).theme, want, `${JSON.stringify(stored)}, system ${systemDark ? 'dark' : 'light'}`)
  }
})

test('storage that throws falls back to the system preference', async () => {
  for (const systemDark of [true, false]) {
    const t = await load({ stored: { 'leavedesk-theme': 'light' }, throws: true, systemDark })
    assert.equal(readTheme(t).theme, systemDark ? 'dark' : 'light')
  }
})

test('setTheme saves the choice and sets the .dark class', async () => {
  const t = await load()
  t.setTheme('dark')
  assert.deepEqual(t.storage.writes, [['leavedesk-theme', 'dark']])
  assert.equal(t.classes.has('dark'), true)
  assert.equal(readTheme(t).theme, 'dark')
  t.setTheme('light')
  assert.deepEqual(t.storage.writes.at(-1), ['leavedesk-theme', 'light'])
  assert.equal(t.classes.has('dark'), false)
  assert.equal(readTheme(t).theme, 'light')
})

test('toggleTheme flips the current theme', async () => {
  const t = await load({ stored: { 'leavedesk-theme': 'dark' } })
  readTheme(t).toggleTheme()
  assert.equal(readTheme(t).theme, 'light')
  readTheme(t).toggleTheme()
  assert.equal(readTheme(t).theme, 'dark')
  assert.deepEqual(t.storage.writes, [['leavedesk-theme', 'light'], ['leavedesk-theme', 'dark']])
})

test('setTheme still applies for this page when storage is blocked', async () => {
  const t = await load({ throws: true })
  assert.doesNotThrow(() => t.setTheme('dark'))
  assert.equal(t.classes.has('dark'), true)
  assert.equal(readTheme(t).theme, 'dark')
})

test('without a stored choice, the theme follows system changes', async () => {
  for (const stored of [{}, { 'leavedesk-theme': 'garbage' }]) {
    const t = await load({ stored })
    t.systemChanges(true)
    assert.equal(readTheme(t).theme, 'dark', JSON.stringify(stored))
    assert.equal(t.classes.has('dark'), true)
    t.systemChanges(false)
    assert.equal(readTheme(t).theme, 'light')
    assert.equal(t.classes.has('dark'), false)
  }
})

test('with blocked storage, the theme follows system changes', async () => {
  const t = await load({ throws: true })
  t.systemChanges(true)
  assert.equal(readTheme(t).theme, 'dark')
})

test('a stored choice ignores system changes', async () => {
  const t = await load({ stored: { 'leavedesk-theme': 'light' } })
  t.systemChanges(true)
  assert.equal(readTheme(t).theme, 'light')
  assert.deepEqual(t.toggles, [])
})

test('after the user chooses, system changes no longer apply', async () => {
  const t = await load()
  t.setTheme('light')
  t.systemChanges(true)
  assert.equal(readTheme(t).theme, 'light')
})
