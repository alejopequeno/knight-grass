// Rasterizes the order's emblem (scripts/textures/order-emblem.svg) to a
// white-on-transparent PNG the banner shader tints and stamps on the cloth.
// Usage: node scripts/textures/rasterize-emblem.mjs
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const SOURCE = new URL('./order-emblem.svg', import.meta.url)
const OUT = new URL('../../public/textures/order-emblem.png', import.meta.url)
const SIZE = 512

const svg = (await readFile(SOURCE, 'utf8')).replace(/fill="black"/g, 'fill="white"')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } })
await page.setContent(
  `<html><body style="margin:0;background:transparent;display:grid;place-items:center;width:${SIZE}px;height:${SIZE}px">` +
    svg.replace('<svg ', `<svg style="width:${SIZE}px;height:${SIZE}px" preserveAspectRatio="xMidYMid meet" `) +
    '</body></html>',
)
await page.screenshot({ path: OUT.pathname, omitBackground: true })
await browser.close()
console.log('wrote', OUT.pathname)
