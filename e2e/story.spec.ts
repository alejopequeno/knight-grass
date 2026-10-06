import { expect, test } from '@playwright/test'

test('story speaks through the live region', async ({ page }) => {
  await page.goto('/')
  await page.locator('.curtain').waitFor({ state: 'detached', timeout: 60_000 })
  const live = page.getByTestId('story-live')
  await expect(live).toContainText('PLAINS OF THE FALLEN', { timeout: 15_000 })
  await expect(live).toContainText('Fireflies: Follow us.', { timeout: 15_000 })
})

test('a slow paladin load never lets the opening title play under the curtain', async ({ page }) => {
  const SLOW_MODEL_MS = 6000
  await page.route('**/models/paladin.fbx', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_MODEL_MS))
    await route.continue()
  })
  await page.goto('/')
  await page.locator('.curtain').waitFor({ state: 'detached', timeout: 60_000 })
  const live = page.getByTestId('story-live')
  // Right after the reveal the title is on screen and the line has not come yet.
  await expect(live).toContainText('PLAINS OF THE FALLEN', { timeout: 2_000 })
  await expect(live).not.toContainText('Follow us.')
})
