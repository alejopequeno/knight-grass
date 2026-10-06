import { test } from '@playwright/test'

const OUT = 'test-artifacts'
const ATTACK_FRAMES_MS = [600, 1150, 1250, 1350, 1450, 1600]
const JUMP_FRAMES_MS = [300, 700, 850, 1000, 1200]
const CHARACTER_CLIP = { x: 440, y: 100, width: 400, height: 580 }

test('@capture scene frames for visual review', async ({ page }) => {
  await page.goto('/')
  await page.locator('.curtain').waitFor({ state: 'detached', timeout: 60_000 })
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${OUT}/webgpu-scene.png` })

  await page.keyboard.press('KeyF')
  let elapsed = 0
  for (const at of ATTACK_FRAMES_MS) {
    await page.waitForTimeout(at - elapsed)
    elapsed = at
    await page.screenshot({ path: `${OUT}/attack-${at}.png`, clip: CHARACTER_CLIP })
  }

  await page.waitForTimeout(800)
  await page.keyboard.press('Space')
  elapsed = 0
  for (const at of JUMP_FRAMES_MS) {
    await page.waitForTimeout(at - elapsed)
    elapsed = at
    await page.screenshot({ path: `${OUT}/jump-${at}.png`, clip: CHARACTER_CLIP })
  }
})

test('@capture grass views for visual review', async ({ page }) => {
  await page.goto('/')
  await page.locator('.curtain').waitFor({ state: 'detached', timeout: 60_000 })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/grass-front.png` })

  await page.keyboard.down('KeyJ')
  await page.waitForTimeout(1300)
  await page.keyboard.up('KeyJ')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/grass-backlit.png` })

  await page.keyboard.down('KeyI')
  await page.waitForTimeout(1500)
  await page.keyboard.up('KeyI')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/grass-closeup.png` })

  await page.keyboard.down('ShiftLeft')
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(9000)
  await page.keyboard.up('KeyW')
  await page.keyboard.up('ShiftLeft')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/grass-walk.png` })
})

const STORY_FRAMES_MS: ReadonlyArray<[number, string]> = [
  [3300, 'story-line'],
  [9000, 'story-reply'],
  [15000, 'story-follow'],
]

test('@capture story beats for visual review', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await page.locator('.curtain').waitFor({ state: 'detached', timeout: 60_000 })
  let elapsed = 0
  for (const [at, name] of STORY_FRAMES_MS) {
    await page.waitForTimeout(at - elapsed)
    elapsed = at
    await page.screenshot({ path: `${OUT}/${name}.png` })
  }
  await page.waitForTimeout(7000)
  await page.screenshot({ path: `${OUT}/story-trail.png` })
})
