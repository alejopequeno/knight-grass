import { describe, expect, it } from 'vitest'
import { clampFrameDelta, MAX_FRAME_DELTA_S } from './frame-delta'

describe('clampFrameDelta', () => {
  it('passes normal frame deltas through', () => {
    expect(clampFrameDelta(1 / 60)).toBeCloseTo(1 / 60)
  })

  it('caps long pauses (tab hidden)', () => {
    expect(clampFrameDelta(12)).toBe(MAX_FRAME_DELTA_S)
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('returns 0 for invalid delta %s', (delta) => {
    expect(clampFrameDelta(delta)).toBe(0)
  })
})
