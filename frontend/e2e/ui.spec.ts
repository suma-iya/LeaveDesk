import { writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { HR, NUSRAT, RAKIB, signIn } from './helpers'

const sidebarWidth = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Main' }).evaluate((el) => Math.round(el.getBoundingClientRect().width))

test.describe('sidebar', () => {
  test('collapses to icons, keeps the page beside it, and remembers the choice', async ({ page }) => {
    await signIn(page, HR.email, '/hr/pending')
    expect(await sidebarWidth(page)).toBe(240)
    await expect(page.getByRole('link', { name: /Pending/ })).toContainText('Pending')

    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    await expect.poll(() => sidebarWidth(page)).toBe(64)
    await expect(page.locator('main')).toHaveCSS('margin-left', '64px')
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-expanded', 'false')

    // Collapsed items keep their name for screen readers and show it in a tooltip.
    await page.getByRole('link', { name: 'People' }).hover()
    await expect(page.getByRole('tooltip', { name: 'People' })).toBeVisible()

    await page.reload()
    await expect.poll(() => sidebarWidth(page)).toBe(64)

    await page.getByRole('button', { name: 'Expand sidebar' }).click()
    await expect.poll(() => sidebarWidth(page)).toBe(240)
  })

  test('Ctrl+B toggles it, except while typing', async ({ page }) => {
    await signIn(page, HR.email, '/hr/pending')
    await page.keyboard.press('ControlOrMeta+b')
    await expect.poll(() => sidebarWidth(page)).toBe(64)

    await page.getByPlaceholder('Search employee').click()
    await page.keyboard.press('ControlOrMeta+b')
    await page.waitForTimeout(300)
    expect(await sidebarWidth(page)).toBe(64)

    await page.locator('main h1').click()
    await page.keyboard.press('ControlOrMeta+b')
    await expect.poll(() => sidebarWidth(page)).toBe(240)
  })

  test('the profile card opens the account menu above it', async ({ page }) => {
    await signIn(page, NUSRAT.email, '/me')
    const card = page.getByRole('button', { name: `Account menu for ${NUSRAT.name}` })
    await expect(card).toContainText('Employee · Engineering')
    // Measure first: an open menu hides the rest of the page from the accessibility tree.
    const cardBox = (await card.boundingBox())!
    await card.click()
    const menu = page.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: 'My profile' })).toBeVisible()
    // The menu zooms in from 95%; wait for it to settle at the card's width.
    await expect.poll(async () => Math.round((await menu.boundingBox())!.width)).toBe(Math.round(cardBox.width))
    const menuBox = (await menu.boundingBox())!
    expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(cardBox.y)
  })
})

test('the theme icon switches to dark and the choice survives a reload', async ({ page }) => {
  await signIn(page, NUSRAT.email, '/me')
  await page.evaluate(() => localStorage.setItem('leavedesk-theme', 'light'))
  await page.reload()
  await expect(page.locator('html')).not.toHaveClass(/dark/)

  await page.getByRole('button', { name: 'Switch to dark theme' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Switch to light theme' }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})

test('a new profile photo is only saved with Save changes', async ({ page }, testInfo) => {
  // A tiny valid PNG (1×1), written for this test.
  const png = testInfo.outputPath('avatar.png')
  writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64'))

  await signIn(page, RAKIB.email, '/profile')
  const save = page.getByRole('button', { name: 'Save changes' })
  await expect(save).toBeDisabled()

  await page.locator('input[type=file]').setInputFiles(png)
  await expect(save).toBeEnabled()
  await expect(page.locator('main img').first()).toHaveAttribute('src', /^blob:/)
  expect((await (await page.request.get('/api/me')).json()).user.avatarUrl).toBeUndefined()

  await save.click()
  await expect(page.getByText('Profile saved')).toBeVisible()
  await expect.poll(async () => (await (await page.request.get('/api/me')).json()).user.avatarUrl).toMatch(/^\/api\/files\//)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled()
})

test.describe('mobile (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('uses the bottom tab bar instead of the sidebar', async ({ page }) => {
    await signIn(page, HR.email, '/hr/pending')
    const nav = page.getByRole('navigation', { name: 'Main' })
    const box = (await nav.boundingBox())!
    expect(box.width).toBe(390)
    expect(box.y + box.height).toBe(844)
    await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: /Pending/ })).toBeVisible()
  })
})
