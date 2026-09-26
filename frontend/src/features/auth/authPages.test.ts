// Run with: npm test. Renders the real auth pages to HTML with no extra
// dependency: Vite (already a dev dependency) compiles the .tsx files and
// resolves the @/ alias, and react-dom/server renders them.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement as h, type ComponentType, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer, type ViteDevServer } from 'vite'

// The only browser API the auth pages touch on load (useIsMobile).
Object.assign(globalThis, {
  window: { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) },
})

let vite: ViteDevServer
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' })
})
after(() => vite.close())

/** Renders page at url inside the providers the app uses. */
async function render(page: 'SignInPage' | 'RegisterPage', url: string, seed?: (client: QueryClient) => void) {
  const pages = await vite.ssrLoadModule(`/src/features/auth/${page}.tsx`)
  const { AuthProvider } = await vite.ssrLoadModule('/src/features/auth/AuthProvider.tsx')
  const client = new QueryClient()
  seed?.(client)
  const Page = pages[page] as ComponentType
  const Auth = AuthProvider as ComponentType<{ children: ReactNode }>
  return renderToStaticMarkup(
    h(QueryClientProvider, { client }, h(MemoryRouter, { initialEntries: [url] }, h(Auth, null, h(Page)))),
  )
}

test('sign-in page shows the ?error= message in the red alert', async () => {
  const html = await render('SignInPage', '/login?error=Google%20sign-in%20was%20cancelled.')
  assert.match(html, /<div role="alert"[^>]*>.*Google sign-in was cancelled\./)
})

test('sign-in page shows no alert without ?error=', async () => {
  const html = await render('SignInPage', '/login')
  assert.doesNotMatch(html, /role="alert"/)
})

test('register page asks for a password normally', async () => {
  const html = await render('RegisterPage', '/register')
  assert.match(html, /id="password"/)
  assert.match(html, /id="confirmPassword"/)
})

test('register page via Google hides the password fields and prefills a read-only email', async () => {
  const html = await render('RegisterPage', '/register?via=google', (client) =>
    client.setQueryData(['google-pending'], { email: 'nadia@company.test', firstName: 'Nadia', lastName: 'Rahman' }))
  assert.doesNotMatch(html, /id="password"/)
  assert.doesNotMatch(html, /id="confirmPassword"/)
  assert.match(html, /Google doesn(’|'|&#x27;)t share your date of birth/)
  assert.match(html, /<input[^>]*id="email"[^>]*readOnly=""[^>]*value="nadia@company.test"|<input[^>]*id="email"[^>]*value="nadia@company.test"[^>]*readOnly=""/)
  assert.match(html, /id="firstName"[^>]*value="Nadia"/)
  assert.match(html, /id="dateOfBirth"/)
})
