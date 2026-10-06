import { expect, test, type Page } from '@playwright/test'

const CURTAIN_TIMEOUT_MS = 60_000

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function waitForScene(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible({ timeout: CURTAIN_TIMEOUT_MS })
  await expect(page.locator('.curtain')).toHaveCount(0, { timeout: CURTAIN_TIMEOUT_MS })
}

test('scene boots on WebGPU without console errors', async ({ page }) => {
  const errors = collectErrors(page)
  await waitForScene(page)
  await page.waitForTimeout(2000)
  expect(errors).toEqual([])
})

test('Space on the focused sound button toggles it without being swallowed by the game', async ({ page }) => {
  await waitForScene(page)
  await page.keyboard.press('Tab')
  // The name stays put; the toggle state lives in aria-pressed.
  const button = page.getByRole('button', { name: 'Sonido', exact: true })
  await expect(button).toBeFocused()
  // The first press may only unlock audio (any key gesture can): after it,
  // every press must flip the toggle.
  await page.keyboard.press('Space')
  await expect(button).toHaveAttribute('aria-pressed', /true|false/)
  const settled = await button.getAttribute('aria-pressed')
  await page.keyboard.press('Space')
  await expect(button).toHaveAttribute('aria-pressed', settled === 'true' ? 'false' : 'true')
  await expect(button).toHaveAccessibleName('Sonido')
})

test('canvas follows a viewport resize', async ({ page }) => {
  const errors = collectErrors(page)
  await waitForScene(page)
  await page.setViewportSize({ width: 900, height: 600 })
  await page.waitForTimeout(1000)
  const box = await page.locator('canvas').boundingBox()
  expect(box?.width).toBe(900)
  expect(box?.height).toBe(600)
  // The drawing buffer (and the post-processing targets sized from it) must follow too.
  const buffer = await page.locator('canvas').evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) return { width: 0, height: 0, dpr: 1 }
    return { width: canvas.width, height: canvas.height, dpr: Math.min(window.devicePixelRatio, 1.5) }
  })
  expect(buffer.width).toBe(Math.round(900 * buffer.dpr))
  expect(buffer.height).toBe(Math.round(600 * buffer.dpr))
  expect(errors).toEqual([])
})

test('shows the WebGPU gate when the API is missing', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true })
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('necesita WebGPU')
  await expect(page.locator('canvas')).toHaveCount(0)
})

test('a failed scene asset shows the load error, not the WebGPU gate', async ({ page }) => {
  await page.route('**/hdri/*.hdr', (route) => route.abort())
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('no se pudo cargar', { timeout: CURTAIN_TIMEOUT_MS })
  await expect(page.getByRole('alert')).not.toContainText('renderer')
})

test('the sound button is not focusable while it is covered', async ({ page }) => {
  await page.route('**/hdri/*.hdr', (route) => route.abort())
  await page.goto('/')
  await expect(page.getByRole('alert')).toBeVisible({ timeout: CURTAIN_TIMEOUT_MS })
  await page.keyboard.press('Tab')
  await expect(page.locator('.audio-hud')).not.toBeFocused()
})
