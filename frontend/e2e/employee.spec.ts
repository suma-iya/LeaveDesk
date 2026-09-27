import { expect, test } from '@playwright/test'
import { RAKIB, showMonth, signIn } from './helpers'

// Rakib joined this week and has no leave yet, so his balance is the full
// default. Fri and Sat are the weekend.
test.describe.configure({ mode: 'serial' })

test.describe('employee leave', () => {
  test('only weekend days cannot be submitted', async ({ page }) => {
    await signIn(page, RAKIB.email, '/me/request/new')
    await page.getByRole('radio', { name: /Annual/ }).click()
    await showMonth(page, 'December 2026')
    await page.getByRole('button', { name: 'Friday 11 December 2026, weekend' }).click()
    await page.getByRole('button', { name: 'Saturday 12 December 2026, weekend' }).click()
    await expect(page.getByRole('button', { name: 'Submit request' })).toBeDisabled()
  })

  test('request annual leave, see it pending, then cancel it', async ({ page }) => {
    await signIn(page, RAKIB.email, '/me/request/new')
    await page.getByRole('radio', { name: /Annual/ }).click()
    await showMonth(page, 'December 2026')
    await page.getByRole('button', { name: 'Sunday 6 December 2026' }).click()
    await page.getByRole('button', { name: 'Tuesday 8 December 2026' }).click()
    await expect(page.getByLabel('From')).toHaveValue(/6 Dec 2026/)
    await expect(page.getByLabel('To')).toHaveValue(/8 Dec 2026/)
    await page.getByLabel('Reason').fill('E2E: family visit')
    await page.getByRole('button', { name: 'Submit request' }).click()

    // Back on My leave with the new request pending.
    await expect(page).toHaveURL(/\/me$/)
    const row = page.getByRole('row').filter({ hasText: '06–08 Dec 2026' })
    await expect(row).toContainText(/pending/i)
    await expect(row).toContainText('3') // Sun–Tue = 3 working days

    // The server agrees.
    const mine = await (await page.request.get('/api/requests?scope=mine&status=pending')).json()
    expect(mine.items).toEqual(expect.arrayContaining([expect.objectContaining({ startDate: '2026-12-06', endDate: '2026-12-08', workingDays: 3, status: 'pending' })]))

    // Cancel it from the details page.
    await row.getByRole('link', { name: 'View request' }).click()
    await page.getByRole('button', { name: 'Cancel request' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel request' }).click()
    await expect(page).toHaveURL(/\/me$/)
    await expect(page.getByRole('row').filter({ hasText: '06–08 Dec 2026' })).toHaveCount(0)

    // History lists decided requests (approved + rejected) by default, so
    // check the cancellation on the server.
    const cancelled = await (await page.request.get('/api/requests?scope=mine&status=cancelled')).json()
    expect(cancelled.items).toEqual(expect.arrayContaining([expect.objectContaining({ startDate: '2026-12-06', status: 'cancelled' })]))
  })

  test('the same dates cannot be requested twice', async ({ page }) => {
    await signIn(page, RAKIB.email, '/me')
    const first = await page.request.post('/api/requests', { data: { type: 'annual', startDate: '2026-12-13', endDate: '2026-12-14', reason: 'E2E overlap' } })
    expect(first.status()).toBe(201)
    const second = await page.request.post('/api/requests', { data: { type: 'casual', startDate: '2026-12-14', endDate: '2026-12-15', reason: 'E2E overlap' } })
    expect(second.status()).toBe(409)
    expect((await second.json()).error).toBe('OVERLAP')
  })

  test('an empty attachment id is treated as no attachment', async ({ page }) => {
    await signIn(page, RAKIB.email, '/me')
    const res = await page.request.post('/api/requests', { data: { type: 'annual', startDate: '2027-01-04', endDate: '2027-01-04', reason: 'E2E', attachmentFileId: '' } })
    expect(res.status()).toBe(201)
    expect((await res.json()).attachment).toBeNull()
  })
})
