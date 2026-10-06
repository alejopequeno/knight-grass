import { describe, expect, it } from 'vitest'
import { CLEARING_FLOOR, clearingHeightFactor, type Clearing } from './grass-clearings'

const CLEARINGS: readonly Clearing[] = [{ x: 10, z: 20, radius: 4 }]

describe('clearingHeightFactor', () => {
  it('leaves grass untouched far from every clearing', () => {
    expect(clearingHeightFactor(100, 100, CLEARINGS)).toBe(1)
  })

  it('cuts grass down to the floor at a clearing centre', () => {
    expect(clearingHeightFactor(10, 20, CLEARINGS)).toBeCloseTo(CLEARING_FLOOR)
  })

  it('grows back smoothly toward the clearing edge', () => {
    const inner = clearingHeightFactor(10 + 2.6, 20, CLEARINGS)
    const outer = clearingHeightFactor(10 + 3.6, 20, CLEARINGS)
    expect(inner).toBeLessThan(outer)
    expect(clearingHeightFactor(10 + 4, 20, CLEARINGS)).toBe(1)
  })
})
