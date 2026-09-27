import { expect, test, type APIRequestContext } from '@playwright/test'
import { HR, RAKIB, signIn } from './helpers'

// Seed: Tanvir's annual leave 04–07 Oct (#2043) and Mitu's sick leave
// 28–29 Sep (#2046) are pending. Decisions wait 5 seconds for Undo before
// they are sent.
test.describe.configure({ mode: 'serial' })

const requestStatus = async (api: APIRequestContext, id: number) =>
  (await (await api.get(`/api/requests/${id}`)).json()).request as { status: string; decisionNote: string }

test.describe('HR decisions', () => {
  test('Undo within 5 seconds sends nothing', async ({ page }) => {
    await signIn(page, HR.email, '/hr/pending')
    const row = page.getByRole('row').filter({ hasText: 'Tanvir Ahmed' }).filter({ hasText: '04–07 Oct 2026' })
    await row.getByRole('button', { name: 'Approve Tanvir Ahmed' }).click()
    await expect(row).toBeHidden()
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(row).toBeVisible()

    await page.waitForTimeout(6_000) // past the Undo window
    expect((await requestStatus(page.request, 2043)).status).toBe('pending')
  })

  test('approve: the decision is sent after the Undo window', async ({ page }) => {
    await signIn(page, HR.email, '/hr/pending')
    await page.getByRole('row').filter({ hasText: '04–07 Oct 2026' }).getByRole('button', { name: 'Approve Tanvir Ahmed' }).click()
    await expect(page.getByText(/Approved Tanvir Ahmed.s leave/)).toBeVisible()
    await expect.poll(async () => (await requestStatus(page.request, 2043)).status, { timeout: 12_000 }).toBe('approved')

    await page.getByRole('link', { name: 'Approved' }).click()
    await expect(page.getByRole('row').filter({ hasText: 'Tanvir Ahmed' }).filter({ hasText: '04–07 Oct 2026' })).toBeVisible()
  })

  test('reject with a note', async ({ page }) => {
    await signIn(page, HR.email, '/hr/pending')
    await page.getByRole('button', { name: 'Reject Mitu Das' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Note (optional)').fill('Please pick dates after the audit.')
    await dialog.getByRole('button', { name: 'Reject' }).click()
    await expect.poll(async () => (await requestStatus(page.request, 2046)).status, { timeout: 12_000 }).toBe('rejected')
    expect((await requestStatus(page.request, 2046)).decisionNote).toBe('Please pick dates after the audit.')
  })

  test('HR cannot decide their own request', async ({ page }) => {
    await signIn(page, HR.email, '/hr/pending')
    const created = await page.request.post('/api/requests', { data: { type: 'annual', startDate: '2026-12-20', endDate: '2026-12-22', reason: 'E2E: HR own leave' } })
    expect(created.status()).toBe(201)
    const id = (await created.json()).id as number

    await page.reload()
    const own = page.getByRole('row').filter({ hasText: HR.name }).filter({ hasText: '20–22 Dec 2026' })
    await expect(own.getByRole('button', { name: 'Another HR must decide your own request' })).toHaveCount(2)
    await expect(own.getByRole('button', { name: 'Another HR must decide your own request' }).first()).toBeDisabled()

    const self = await page.request.post(`/api/requests/${id}/decision`, { data: { status: 'approved', note: '' } })
    expect(self.status()).toBe(403)
    expect((await self.json()).error).toBe('SELF_APPROVAL')
  })

  test('Export downloads the pending list as CSV', async ({ page }) => {
    await signIn(page, HR.email, '/hr/pending')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Export' }).click()])
    expect(download.suggestedFilename()).toMatch(/\.csv$/)
    const body = await (await download.createReadStream()).toArray()
    const csv = Buffer.concat(body).toString('utf8')
    expect(csv.split('\n')[0]).toMatch(/Employee/i)
    expect(csv).toContain('Nusrat Jahan')
  })
})

test.describe('Human Resources department', () => {
  test('moving someone into Human Resources gives them the HR dashboard', async ({ page, browser }) => {
    await signIn(page, HR.email, '/hr/people')
    const rakib = (await (await page.request.get('/api/hr/employees?q=Rakib')).json()).items[0]
    expect(rakib.role).toBe('employee')

    await page.goto(`/hr/people/${rakib.id}`)
    await page.getByRole('combobox', { name: 'Department' }).click()
    await page.getByRole('option', { name: 'Human Resources' }).click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(async () => (await (await page.request.get('/api/hr/employees?q=Rakib')).json()).items[0].role).toBe('hr')

    // Rakib now signs in to the HR dashboard, and can decide Farhana's own request.
    const rakibContext = await browser.newContext()
    const rakibPage = await rakibContext.newPage()
    await signIn(rakibPage, RAKIB.email, '/')
    await expect(rakibPage).toHaveURL(/\/hr\/pending$/)
    await expect(rakibPage.getByRole('button', { name: `Approve ${HR.name}` })).toBeEnabled()
    await rakibContext.close()
  })
})
