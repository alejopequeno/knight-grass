import { describe, expect, it } from 'vitest'
import { motionScaleFor } from './reduced-motion'

describe('motionScaleFor', () => {
  it('keeps full ambient motion by default', () => {
    expect(motionScaleFor(false)).toBe(1)
  })

  it('stills twinkle and pulsing for reduced motion', () => {
    expect(motionScaleFor(true)).toBe(0)
  })
})
