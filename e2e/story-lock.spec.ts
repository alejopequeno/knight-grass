import { expect, test, type Page } from '@playwright/test'

const playerZ = (page: Page) => page.evaluate(() => Number(Reflect.get(window, '__playerZ')))

test('the paladin cannot move while the story talks, and can once the trail appears', async ({ page }) => {
  await page.goto('/')
  await page.locator('.curtain').waitFor({ state: 'detached', timeout: 60_000 })
  const live = page.getByTestId('story-live')
  await expect(live).toContainText('Síguenos.', { timeout: 15_000 })

  const before = await playerZ(page)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(1500)
  await page.keyboard.up('KeyW')
  expect(Math.abs((await playerZ(page)) - before)).toBeLessThan(0.05)

  // 'Síguenos.' has no reply: once it dissolves the trail appears and the player is free.
  await page.waitForTimeout(4500)
  const freed = await playerZ(page)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(1500)
  await page.keyboard.up('KeyW')
  expect(Math.abs((await playerZ(page)) - freed)).toBeGreaterThan(1)
})
