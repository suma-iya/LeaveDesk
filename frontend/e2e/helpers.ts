import { expect, type Page } from '@playwright/test'

// Demo accounts from backend/internal/seed (all use the same password).
export const PASSWORD = 'password123'
export const HR = { email: 'hr@company.test', name: 'Farhana Islam' }
export const NUSRAT = { email: 'nusrat.j@company.test', name: 'Nusrat Jahan' } // two pending requests in October
export const TANVIR = { email: 'tanvir.a@company.test', name: 'Tanvir Ahmed' }
export const RAKIB = { email: 'rakib.h@company.test', name: 'Rakib Hasan' } // joined this week, no leave yet

/** Signs in through the API (fast; the cookie is shared with the page), then opens path. */
export async function signIn(page: Page, email: string, path = '/') {
  const res = await page.request.post('/api/auth/login', { data: { email, password: PASSWORD } })
  expect(res.status(), `login ${email}`).toBe(200)
  await page.goto(path)
}

/** Signs in through the form, like a person would. */
export async function signInWithForm(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** A unique email per run, so registration tests never collide. */
export const uniqueEmail = (name: string) => `${name}.${Date.now()}@company.test`

/** Clicks "Next month" until the calendar shows `label` (e.g. "December 2026"). */
export async function showMonth(page: Page, label: string) {
  for (let i = 0; i < 24; i++) {
    if (await page.getByRole('grid', { name: label }).isVisible()) return
    await page.getByRole('button', { name: 'Next month' }).click()
  }
  throw new Error(`calendar never showed ${label}`)
}
