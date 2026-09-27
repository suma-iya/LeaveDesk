// Takes the README screenshots from the real running app.
//
//   make screenshots                       (app on http://localhost:3000)
//   BASE_URL=http://localhost:3100 make screenshots
//
// It only signs in and opens pages; it never approves, rejects or submits
// anything, so running it twice gives the same pictures. It expects the demo
// data from `make seed`.
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/screenshots')
// Thu, 01 Oct 2026 10:00 in Dhaka: the calendar opens on October, where the seed data is busy.
const NOW = new Date('2026-10-01T10:00:00+06:00')

const PASSWORD = 'password123'
const HR = 'hr@company.test'
const NUSRAT = 'nusrat.j@company.test'

const DESKTOP: BrowserContextOptions = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }
const MOBILE: BrowserContextOptions = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }

type Theme = 'light' | 'dark'

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
  const up = await request.get(`${BASE_URL}/api/health`).then((r) => r.ok(), () => false)
  if (!up) throw new Error(`No app answers at ${BASE_URL}/api/health. Start the app first: make up && make seed`)
  mkdirSync(OUT, { recursive: true })
})

/** A fresh browser context (one per account and device), signed in through the real form. */
async function open(browser: Browser, device: BrowserContextOptions, theme: Theme, email?: string): Promise<Page> {
  const context = await browser.newContext({
    ...device, baseURL: BASE_URL, timezoneId: 'Asia/Dhaka', locale: 'en-GB', reducedMotion: 'reduce', colorScheme: theme,
  })
  // Before any page script runs: the theme (unless changed later with setTheme),
  // an expanded sidebar, and no transitions, animations or blinking caret.
  await context.addInitScript((initial) => {
    if (!localStorage.getItem('leavedesk-theme')) localStorage.setItem('leavedesk-theme', initial)
    localStorage.setItem('leavedesk-sidebar', 'expanded')
    const still = () => {
      const style = document.createElement('style')
      style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }'
      document.head.appendChild(style)
    }
    if (document.head) still()
    else document.addEventListener('DOMContentLoaded', still)
  }, theme)
  const page = await context.newPage()
  await page.clock.setFixedTime(NOW)
  if (email) {
    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).not.toHaveURL(/\/login/)
  }
  return page
}

async function setTheme(page: Page, theme: Theme) {
  await page.evaluate((t) => localStorage.setItem('leavedesk-theme', t), theme)
  await page.reload()
}

/** Waits until the page is really ready, then saves the viewport as docs/screenshots/<name>.png. */
async function shot(page: Page, name: string) {
  await page.waitForLoadState('networkidle')
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  // Park the pointer where it hovers nothing.
  const { width, height } = page.viewportSize()!
  await page.mouse.move(width - 2, height - 2)
  await page.waitForTimeout(300)
  await page.screenshot({ path: resolve(OUT, `${name}.png`) })
}

test('01 sign in', async ({ browser }) => {
  const page = await open(browser, DESKTOP, 'light')
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await shot(page, '01-sign-in')
  await page.context().close()
})

test('HR on desktop: 02–06', async ({ browser }) => {
  const page = await open(browser, DESKTOP, 'light', HR)

  await page.goto('/hr/pending')
  await expect(page.getByRole('heading', { name: 'Pending requests' })).toBeVisible()
  await shot(page, '02-hr-pending')

  // Nusrat's pending 04–08 Oct request, opened from the Pending table.
  await page.getByRole('row').filter({ hasText: 'Nusrat Jahan' }).filter({ hasText: '04–08 Oct 2026' })
    .getByRole('link', { name: 'View request' }).click()
  await expect(page.getByText('Decision', { exact: true })).toBeVisible()
  await shot(page, '03-hr-review')

  // The team calendar overlay on the Pending page, with Wed 07 Oct selected.
  await page.goto('/hr/pending')
  await page.getByRole('button', { name: 'Team calendar' }).click()
  await page.getByRole('grid', { name: 'October 2026' }).getByRole('button', { name: /^October 7,/ }).click()
  await shot(page, '04-team-calendar')
  await page.getByRole('button', { name: 'Close calendar' }).click() // it stays open across pages otherwise

  await page.goto('/hr/people')
  await expect(page.getByRole('link', { name: /^Open / }).first()).toBeVisible()
  await shot(page, '05-hr-people')

  // People are paged; search finds Nusrat wherever she is.
  await page.getByPlaceholder(/^Search/).fill('Nusrat')
  await page.getByRole('link', { name: 'Nusrat Jahan', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Nusrat Jahan' })).toBeVisible()
  await shot(page, '06-hr-employee')
  await page.context().close()
})

test('Nusrat on desktop: 07–10', async ({ browser }) => {
  const page = await open(browser, DESKTOP, 'light', NUSRAT)

  await page.goto('/me')
  await expect(page.getByRole('heading', { name: /^Hi Nusrat/ })).toBeVisible()
  await shot(page, '07-employee-my-leave')

  // Dates inside her pending 04–08 Oct request: the form refuses them. Nothing is submitted.
  await page.goto('/me/request/new')
  await expect(page.getByRole('grid', { name: 'October 2026' })).toBeVisible()
  await page.getByRole('button', { name: /^Tuesday 6 October 2026/ }).click()
  await page.getByRole('button', { name: /^Wednesday 7 October 2026/ }).click()
  await expect(page.getByRole('alert')).toContainText('These dates overlap your pending request')
  await shot(page, '08-request-leave-error')

  // The rejected May request: HR's note and the attached travel plan (PDF).
  await page.goto('/me/history')
  await page.getByRole('row').filter({ hasText: '03–07 May 2026' }).getByRole('link', { name: 'View request' }).click()
  await expect(page.locator('main canvas').first()).toBeVisible()
  await shot(page, '09-rejected-request')

  await page.goto('/me/history')
  await setTheme(page, 'dark')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await shot(page, '10-history-dark')
  await page.context().close()
})

test('mobile: 11–12', async ({ browser }) => {
  const nusrat = await open(browser, MOBILE, 'light', NUSRAT)
  await nusrat.goto('/me')
  await expect(nusrat.getByRole('heading', { name: /^Hi Nusrat/ })).toBeVisible()
  await shot(nusrat, '11-mobile-my-leave')
  await nusrat.context().close()

  const hr = await open(browser, MOBILE, 'dark', HR)
  await hr.goto('/hr/pending')
  await expect(hr.getByRole('heading', { name: 'Pending requests' })).toBeVisible()
  await shot(hr, '12-mobile-hr-pending-dark')
  await hr.context().close()
})
