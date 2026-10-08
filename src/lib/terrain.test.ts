import { describe, expect, it } from 'vitest'
import { terrainHeight } from './terrain'

// Reference: the heightfield written out by hand, octave by octave.
function referenceHeight(x: number, z: number): number {
  const landform = Math.sin(x * 0.021) * Math.cos(z * 0.017 + 0.9) * 5
  const a = Math.sin(x * 0.04) * Math.cos(z * 0.04) * 2.6
  const b = Math.sin(x * 0.13 + 2) * Math.cos(z * 0.11 + 1) * 0.6
  const c = Math.sin(x * 0.28 - 1) * Math.cos(z * 0.31 - 2) * 0.25
  return landform + a + b + c
}

const SAMPLE_POINTS: ReadonlyArray<[number, number]> = [
  [0, 0],
  [10, -4],
  [-37.5, 81.25],
  [199, -199],
  [3.3, 3.3],
]

describe('terrainHeight', () => {
  it.each(SAMPLE_POINTS)('matches the reference formula at (%d, %d)', (x, z) => {
    expect(terrainHeight(x, z)).toBeCloseTo(referenceHeight(x, z), 10)
  })
})
