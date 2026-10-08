import { describe, expect, it } from 'vitest'
import { MOVING_THRESHOLD, RUN_SPEED } from '../lib/movement'
import { RUN_FOV_BOOST, runFovBoost } from './camera-feel'

describe('runFovBoost', () => {
  it('leaves the lens alone while standing or barely moving', () => {
    expect(runFovBoost(0)).toBe(0)
    expect(runFovBoost(MOVING_THRESHOLD)).toBe(0)
  })

  it('reaches its full opening at a run and never goes past it', () => {
    expect(runFovBoost(RUN_SPEED)).toBeCloseTo(RUN_FOV_BOOST, 10)
    expect(runFovBoost(RUN_SPEED * 3)).toBeCloseTo(RUN_FOV_BOOST, 10)
  })

  it('opens monotonically with speed', () => {
    let previous = -1
    for (let step = 0; step <= 20; step++) {
      const boost = runFovBoost((step / 20) * RUN_SPEED)
      expect(boost).toBeGreaterThanOrEqual(previous)
      previous = boost
    }
  })
})
