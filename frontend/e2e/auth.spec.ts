import { expect, test } from '@playwright/test'
import { HR, NUSRAT, signIn, signInWithForm, uniqueEmail } from './helpers'

test.describe('sign in', () => {
  test('HR lands on Pending requests', async ({ page }) => {
    await signInWithForm(page, HR.email)
    await expect(page).toHaveURL(/\/hr\/pending$/)
    await expect(page.getByRole('heading', { name: 'Pending requests' })).toBeVisible()
  })

  test('an employee lands on My leave', async ({ page }) => {
    await signInWithForm(page, NUSRAT.email)
    await expect(page).toHaveURL(/\/me$/)
    await expect(page.getByRole('heading', { name: /^Hi Nusrat/ })).toBeVisible()
  })

  test('a wrong password shows one generic message', async ({ page }) => {
    await signInWithForm(page, HR.email, 'not-the-password')
    await expect(page.getByRole('alert')).toHaveText('Wrong email or password.')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('?error= is shown once, then removed from the URL', async ({ page }) => {
    await page.goto('/login?error=Google%20sign-in%20was%20cancelled.')
    await expect(page.getByRole('alert')).toHaveText('Google sign-in was cancelled.')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('signing out returns to Sign in and protects the app', async ({ page }) => {
    await signIn(page, NUSRAT.email, '/me')
    await page.getByRole('button', { name: `Account menu for ${NUSRAT.name}` }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await page.goto('/me')
    await expect(page).toHaveURL(/\/login$/)
  })
})

test.describe('access control', () => {
  test('an employee opening an HR page is sent to their own home', async ({ page }) => {
    await signIn(page, NUSRAT.email, '/hr/pending')
    await expect(page).toHaveURL(/\/me$/)
  })

  test('the API refuses HR endpoints to an employee', async ({ page }) => {
    await signIn(page, NUSRAT.email, '/me')
    expect((await page.request.get('/api/hr/employees')).status()).toBe(403)
  })

  test('the API needs a session', async ({ request }) => {
    expect((await request.get('/api/me')).status()).toBe(401)
  })

  test('a wrong method is a 405 naming the allowed ones', async ({ request }) => {
    const res = await request.delete('/api/auth/login')
    expect(res.status()).toBe(405)
    expect(res.headers()['allow']).toBe('POST')
    expect((await res.json()).error).toBe('METHOD_NOT_ALLOWED')
  })
})

test.describe('registration', () => {
  test('under 18 is refused before submitting', async ({ page }) => {
    await page.goto('/register')
    const eighteenYearsAgoTomorrow = new Date()
    eighteenYearsAgoTomorrow.setFullYear(eighteenYearsAgoTomorrow.getFullYear() - 18)
    eighteenYearsAgoTomorrow.setDate(eighteenYearsAgoTomorrow.getDate() + 1)
    await page.getByLabel('Date of birth').fill(eighteenYearsAgoTomorrow.toISOString().slice(0, 10))
    await expect(page.getByText('You must be at least 18 years old.')).toBeVisible()
  })

  test('a new person becomes an employee and lands on My leave', async ({ page }) => {
    const email = uniqueEmail('e2e.new')
    await page.goto('/register')
    await page.getByLabel('First name').fill('Test')
    await page.getByLabel('Last name').fill('Person')
    await page.getByLabel('Date of birth').fill('1995-06-15')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill('password123')
    await page.getByLabel('Confirm password').fill('password123')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/me$/)
    await expect(page.getByRole('heading', { name: /^Hi Test/ })).toBeVisible()

    const me = await (await page.request.get('/api/me')).json()
    expect(me.user).toMatchObject({ email, role: 'employee', hasPassword: true })
  })

  test('an email that is already registered is refused', async ({ page }) => {
    await page.goto('/register')
    await page.getByLabel('First name').fill('Dup')
    await page.getByLabel('Last name').fill('Licate')
    await page.getByLabel('Date of birth').fill('1990-01-01')
    await page.getByLabel('Email').fill(NUSRAT.email)
    await page.getByLabel('Password', { exact: true }).fill('password123')
    await page.getByLabel('Confirm password').fill('password123')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('alert')).toContainText('already exists')
  })
})
