// Captures a fixed-pose screenshot of whatever renderer the dev server runs.
// Usage: node scripts/capture-baseline.mjs <output-name>
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const BASE_URL = 'http://localhost:5199/'
const SETTLE_MS = 4000
const name = process.argv[2] ?? 'baseline'

await mkdir('test-artifacts', { recursive: true })
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto(BASE_URL)
await page.waitForFunction(() => !document.querySelector('.curtain'), null, { timeout: 60000 })
await page.waitForTimeout(SETTLE_MS)
await page.screenshot({ path: `test-artifacts/${name}.png` })
await browser.close()
console.log(`saved test-artifacts/${name}.png`)
