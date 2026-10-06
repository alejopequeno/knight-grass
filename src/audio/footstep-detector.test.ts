import { describe, expect, it } from 'vitest'
import { createFootTracker, createStepGate, type FootThresholds } from './footstep-detector'

const THRESHOLDS: FootThresholds = { plantAbove: 0.04, liftAbove: 0.1, baselineRisePerSecond: 0.15 }
const FRAME_S = 1 / 60

function feed(heights: number[]): number {
  const tracker = createFootTracker(THRESHOLDS)
  return heights.filter((height) => tracker.update(height, FRAME_S)).length
}

// A stride: planted at `ground`, swings up `swing` metres, lands again.
function stride(ground: number, swing: number, frames = 20): number[] {
  return Array.from({ length: frames }, (_, i) => ground + swing * Math.sin((Math.PI * i) / (frames - 1)))
}

describe('createFootTracker', () => {
  it('fires once per landing of a walking stride', () => {
    expect(feed([...stride(0.23, 0.27), ...stride(0.23, 0.27)])).toBe(2)
  })

  it('works regardless of the absolute planted height (slope, gait)', () => {
    expect(feed([...stride(0.55, 0.27), ...stride(0.55, 0.27)])).toBe(2)
  })

  it('does not fire for a foot that stays on the ground', () => {
    expect(feed(Array.from({ length: 60 }, () => 0.3))).toBe(0)
  })

  it('ignores jitter near the ground (hysteresis)', () => {
    const jitter = Array.from({ length: 40 }, (_, i) => 0.3 + (i % 2 === 0 ? 0 : 0.05))
    expect(feed([...stride(0.3, 0.3), ...jitter])).toBe(1)
  })
})

describe('createStepGate', () => {
  it('lets steps through when they are far enough apart', () => {
    const gate = createStepGate(0.25)
    expect(gate.tryStep(0)).toBe(true)
    expect(gate.tryStep(0.3)).toBe(true)
  })

  it('swallows a second step that comes too soon', () => {
    const gate = createStepGate(0.25)
    expect(gate.tryStep(1)).toBe(true)
    expect(gate.tryStep(1.2)).toBe(false)
    expect(gate.tryStep(1.3)).toBe(true)
  })
})
