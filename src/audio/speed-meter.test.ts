import { describe, expect, it } from 'vitest'
import { createSpeedMeter } from './speed-meter'

const FRAME_S = 1 / 120
const WALK_SPEED = 3

describe('createSpeedMeter', () => {
  it('reports ~the true speed when physics only moves every other frame', () => {
    const meter = createSpeedMeter()
    let x = 0
    let speed = 0
    for (let frame = 0; frame < 240; frame++) {
      if (frame % 2 === 0) x += WALK_SPEED * FRAME_S * 2
      speed = meter.update(x, 0, FRAME_S)
    }
    expect(speed).toBeGreaterThan(WALK_SPEED * 0.85)
    expect(speed).toBeLessThan(WALK_SPEED * 1.15)
  })

  it('settles to zero when standing still', () => {
    const meter = createSpeedMeter()
    let speed = 1
    for (let frame = 0; frame < 240; frame++) speed = meter.update(5, 5, FRAME_S)
    expect(speed).toBeLessThan(0.01)
  })
})
