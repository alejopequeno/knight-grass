import { describe, expect, it } from 'vitest'
import { createSeededRandom } from './seeded-random'

const SAMPLE_COUNT = 1000

describe('createSeededRandom', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = createSeededRandom(42)
    const b = createSeededRandom(42)
    for (let i = 0; i < SAMPLE_COUNT; i++) expect(a()).toBe(b())
  })

  it('produces different sequences for different seeds', () => {
    const a = createSeededRandom(1)
    const b = createSeededRandom(2)
    const same = Array.from({ length: 10 }, () => a() === b()).every(Boolean)
    expect(same).toBe(false)
  })

  it('stays within [0, 1)', () => {
    const random = createSeededRandom(7)
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const value = random()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})
