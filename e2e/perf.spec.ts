import { expect, test } from '@playwright/test'

const SAMPLE_MS = 10_000
const TARGET_FPS = 60
const TOLERANCE_FPS = 5

test.use({ deviceScaleFactor: 2 }) // Canvas dpr clamps to 1.5

test('walks at ~60 fps for 10 s at dpr 1.5', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await page.locator('.curtain').waitFor({ state: 'detached', timeout: 60_000 })
  await page.waitForTimeout(2000)
  await page.keyboard.down('KeyW')
  const fps = await page.evaluate(
    (sampleMs) =>
      new Promise<number>((resolve) => {
        let frames = 0
        const start = performance.now()
        const tick = (now: number) => {
          frames++
          if (now - start < sampleMs) requestAnimationFrame(tick)
          else resolve((frames * 1000) / (now - start))
        }
        requestAnimationFrame(tick)
      }),
    SAMPLE_MS,
  )
  await page.keyboard.up('KeyW')
  console.log(`fps: ${fps.toFixed(1)}`)
  test.info().annotations.push({ type: 'fps', description: fps.toFixed(1) })
  expect.soft(fps).toBeGreaterThanOrEqual(TARGET_FPS - TOLERANCE_FPS)
})
