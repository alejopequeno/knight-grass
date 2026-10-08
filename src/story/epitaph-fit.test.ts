import { describe, expect, it } from 'vitest'
import {
  EPITAPH_DISTANT_DISTANCE,
  EPITAPH_LEGIBLE_DISTANCE,
  epitaphReveal,
  fitScale,
} from './epitaph-fit'

const PANEL = { width: 0.418, height: 0.624 }

describe('fitScale', () => {
  it('keeps the inscription inside the panel on both axes', () => {
    for (const ink of [
      { width: 1176, height: 62 },
      { width: 741, height: 148 },
      { width: 120, height: 900 },
    ]) {
      const scale = fitScale(ink, PANEL)
      expect(ink.width * scale).toBeLessThanOrEqual(PANEL.width)
      expect(ink.height * scale).toBeLessThanOrEqual(PANEL.height)
    }
  })

  it('is limited by whichever axis runs out first', () => {
    const wide = fitScale({ width: 2000, height: 10 }, PANEL)
    const tall = fitScale({ width: 10, height: 2000 }, PANEL)
    expect(wide * 2000).toBeLessThan(PANEL.width)
    expect(wide * 2000).toBeGreaterThan(PANEL.width * 0.75)
    expect(tall * 2000).toBeLessThan(PANEL.height)
    expect(tall * 2000).toBeGreaterThan(PANEL.height * 0.75)
  })

  it('reads at a size a player can actually make out', () => {
    // The real inscription, laid out by lettra at the baked 64 px font size.
    const scale = fitScale({ width: 741, height: 433 }, PANEL)
    expect(scale * 64).toBeGreaterThan(0.03) // > 3 cm cap height on the stone
  })

  it('never divides by a zero-sized layout', () => {
    expect(Number.isFinite(fitScale({ width: 0, height: 0 }, PANEL))).toBe(true)
  })
})

describe('epitaphReveal', () => {
  it('is fully revealed once the reader is close', () => {
    expect(epitaphReveal(0)).toBe(1)
    expect(epitaphReveal(EPITAPH_LEGIBLE_DISTANCE)).toBe(1)
  })

  it('is bare stone from far off', () => {
    expect(epitaphReveal(EPITAPH_DISTANT_DISTANCE)).toBe(0)
    expect(epitaphReveal(EPITAPH_DISTANT_DISTANCE * 4)).toBe(0)
  })

  it('rises monotonically as the reader approaches', () => {
    const steps = 24
    let previous = 0
    for (let i = steps; i >= 0; i--) {
      const distance = (i / steps) * EPITAPH_DISTANT_DISTANCE
      const reveal = epitaphReveal(distance)
      expect(reveal).toBeGreaterThanOrEqual(previous)
      previous = reveal
    }
    expect(previous).toBe(1)
  })
})
