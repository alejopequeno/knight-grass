import { describe, expect, it } from 'vitest'
import { haloPoint, trailEnd } from './firefly-targets'

describe('trailEnd', () => {
  it('stops at the clearing edge on the side the player comes from', () => {
    const end = trailEnd({ x: 0, z: 0 }, { x: 0, z: 40 }, 4)
    expect(end.x).toBeCloseTo(0)
    expect(end.z).toBeCloseTo(36)
  })

  it('never overshoots behind the player when already inside the clearing', () => {
    const end = trailEnd({ x: 0, z: 38 }, { x: 0, z: 40 }, 4)
    expect(end.z).toBeCloseTo(38)
  })

  it('goes all the way when there is no clearing', () => {
    expect(trailEnd({ x: 1, z: 1 }, { x: 5, z: 4 }, 0)).toEqual({ x: 5, z: 4 })
  })
})

describe('haloPoint', () => {
  it('orbits the prop at its radius instead of piling up in one spot', () => {
    const centre = { x: 6, z: 38 }
    const a = haloPoint(centre, 0, 160, 0, 3)
    const b = haloPoint(centre, 80, 160, 0, 3)
    expect(Math.hypot(a.x - centre.x, a.z - centre.z)).toBeCloseTo(3, 0)
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(4)
  })
})
