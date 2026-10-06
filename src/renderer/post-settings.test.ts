import { describe, expect, it } from 'vitest'
import { DEFAULT_GRAIN, grainIntensityFor } from './post-settings'

describe('grainIntensityFor', () => {
  it('uses the default grain normally', () => {
    expect(grainIntensityFor(false)).toBe(DEFAULT_GRAIN)
  })

  it('disables grain for reduced motion', () => {
    expect(grainIntensityFor(true)).toBe(0)
  })
})
