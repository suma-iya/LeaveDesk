// Run with: npm test. Renders shared components to HTML: Vite compiles the
// .tsx files and resolves the @/ alias, and react-dom/server renders them.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement as h, type ComponentType, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer, type ViteDevServer } from 'vite'

// useIsMobile (inside AppButton) reads matchMedia when it is loaded.
Object.assign(globalThis, {
  window: { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) },
})

let vite: ViteDevServer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let C: Record<string, ComponentType<any>>
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' })
  const load = (path: string) => vite.ssrLoadModule(path)
  const [status, type, alert, button, tooltip, icons] = await Promise.all([
    load('/src/components/StatusBadge.tsx'),
    load('/src/components/LeaveTypeTag.tsx'),
    load('/src/components/Alert.tsx'),
    load('/src/components/AppButton.tsx'),
    load('/src/components/ui/tooltip.tsx'),
    load('lucide-react'),
  ])
  C = { ...status, ...type, ...alert, ...button, TooltipProvider: tooltip.TooltipProvider, Plus: icons.Plus } as typeof C
})
after(() => vite.close())

const render = (node: ReactNode) => renderToStaticMarkup(h(MemoryRouter, null, h(C.TooltipProvider, null, node)))
/** Text content with tags removed. */
const text = (html: string) => html.replace(/<[^>]*>/g, '')
/** The opening tag of the first element named `tag`. */
const openTag = (html: string, tag: string) => html.match(new RegExp(`<${tag}\\b[^>]*>`))?.[0] ?? ''

test('StatusBadge shows the status word with a hidden icon', () => {
  for (const status of ['pending', 'approved', 'rejected', 'cancelled']) {
    const html = render(h(C.StatusBadge, { status }))
    assert.equal(text(html), status, status)
    assert.match(html, /^<span[^>]*class="[^"]*\bcapitalize\b/, 'capitalised by CSS')
    assert.match(html, /<svg[^>]*aria-hidden="true"/)
  }
})

test('StatusBadge uses a different colour for each status and keeps extra classes', () => {
  const pill = (status: string) => openTag(render(h(C.StatusBadge, { status })), 'span')
  assert.match(pill('pending'), /text-pending/)
  assert.match(pill('approved'), /text-ok/)
  assert.match(pill('rejected'), /text-danger/)
  assert.match(pill('cancelled'), /text-muted-foreground/)
  assert.match(openTag(render(h(C.StatusBadge, { status: 'approved', className: 'ml-auto' })), 'span'), /\bml-auto\b/)
})

test('LeaveTypeTag shows the type label next to a hidden colour swatch', () => {
  const cases: [string, string, string][] = [['annual', 'Annual', 'bg-type-annual'], ['casual', 'Casual', 'bg-type-casual'], ['sick', 'Sick', 'bg-type-sick']]
  for (const [type, label, swatch] of cases) {
    const html = render(h(C.LeaveTypeTag, { type }))
    assert.equal(text(html), label)
    assert.match(html, new RegExp(`<span aria-hidden="true" class="[^"]*\\b${swatch}\\b`))
  }
})

test('Alert: error is role=alert, warning is role=status', () => {
  const error = render(h(C.Alert, { tone: 'error' }, 'Something failed'))
  assert.match(error, /^<div role="alert"/)
  assert.match(openTag(error, 'div'), /text-danger/)
  assert.equal(text(error), 'Something failed')

  const warning = render(h(C.Alert, { tone: 'warning' }, 'Heads up'))
  assert.match(warning, /^<div role="status"/)
  assert.match(openTag(warning, 'div'), /text-pending/)
  assert.equal(text(warning), 'Heads up')
  assert.match(warning, /<svg[^>]*aria-hidden="true"/)
})

test('AppButton labeled: a type=button <button> with the label as text', () => {
  const html = render(h(C.AppButton, { icon: C.Plus, label: 'New request' }))
  const tag = openTag(html, 'button')
  assert.match(tag, /type="button"/)
  assert.doesNotMatch(tag, /aria-label=/)
  assert.doesNotMatch(tag, / disabled=| aria-busy=/)
  assert.match(tag, /w-\[140px\]/, 'desktop size by default')
  assert.equal(text(html), 'New request')
})

test('AppButton icon shape: aria-label is the label and no visible text', () => {
  const html = render(h(C.AppButton, { icon: C.Plus, shape: 'icon', label: 'Add attachment' }))
  const tag = openTag(html, 'button')
  assert.match(tag, /aria-label="Add attachment"/)
  assert.match(tag, /\bsize-9\b/)
  assert.equal(text(html), '')
  // IconButton is the same thing.
  assert.match(openTag(render(h(C.IconButton, { icon: C.Plus, label: 'Close' })), 'button'), /aria-label="Close"/)
})

test('AppButton with `to` renders a router link, not a button', () => {
  const html = render(h(C.AppButton, { icon: C.Plus, label: 'New request', to: '/me/new' }))
  assert.doesNotMatch(html, /<button/)
  assert.match(openTag(html, 'a'), /href="\/me\/new"/)
  assert.equal(text(html), 'New request')

  const icon = render(h(C.AppButton, { icon: C.Plus, shape: 'icon', label: 'Open', to: '/hr/pending' }))
  assert.match(openTag(icon, 'a'), /aria-label="Open"/)
  assert.match(openTag(icon, 'a'), /href="\/hr\/pending"/)
})

test('AppButton with `href` renders a plain link; target adds rel=noreferrer', () => {
  const html = render(h(C.AppButton, { icon: C.Plus, label: 'Export', href: '/api/x.csv', download: 'x.csv', target: '_blank' }))
  const a = openTag(html, 'a')
  assert.match(a, /href="\/api\/x.csv"/)
  assert.match(a, /download="x.csv"/)
  assert.match(a, /target="_blank"/)
  assert.match(a, /rel="noreferrer"/)
  assert.doesNotMatch(openTag(render(h(C.AppButton, { icon: C.Plus, label: 'Export', href: '/a' })), 'a'), /rel=/)
})

test('AppButton loading: aria-busy, disabled and a spinner instead of the icon', () => {
  const html = render(h(C.AppButton, { icon: C.Plus, label: 'Save', loading: true }))
  const tag = openTag(html, 'button')
  assert.match(tag, /aria-busy="true"/)
  assert.match(tag, / disabled=""/)
  assert.match(html, /<svg[^>]*class="[^"]*animate-spin/)
  assert.doesNotMatch(html, /lucide-plus/)
  const idle = render(h(C.AppButton, { icon: C.Plus, label: 'Save' }))
  assert.match(idle, /lucide-plus/)
  assert.doesNotMatch(idle, /animate-spin/)
})

test('AppButton disabled without loading is disabled but not busy', () => {
  const tag = openTag(render(h(C.AppButton, { icon: C.Plus, label: 'Save', disabled: true })), 'button')
  assert.match(tag, / disabled=""/)
  assert.doesNotMatch(tag, / aria-busy=/)
})

test('AppButton passes type=submit and the size override through', () => {
  const tag = openTag(render(h(C.AppButton, { icon: C.Plus, label: 'Sign in', type: 'submit', size: 'block', variant: 'primary' })), 'button')
  assert.match(tag, /type="submit"/)
  assert.match(tag, /\bh-11\b/)
  assert.match(tag, /\bw-full\b/)
  assert.match(tag, /\bbg-primary\b/)
})
