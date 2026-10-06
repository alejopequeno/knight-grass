import { describe, expect, it } from 'vitest'
import { composeShot, FOLLOW_FOV, lensScale } from './camera-shot'

const FLAT = () => 0

function angleBetween(from: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const ax = a.x - from.x
  const az = a.z - from.z
  const bx = b.x - from.x
  const bz = b.z - from.z
  return Math.acos((ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz)))
}

describe('composeShot', () => {
  it('films from the side so the paladin never hides the prop', () => {
    const player = { x: 0, z: 0 }
    const prop = { x: 0, z: 4 }
    const shot = composeShot(player, prop, FLAT)
    const camera = { x: shot.position.x, z: shot.position.z }
    // Clear angular separation between paladin and prop on screen.
    expect(angleBetween(camera, player, prop)).toBeGreaterThan(0.35)
  })

  it('sees the face of the prop that looks at the paladin (three-quarter, not profile)', () => {
    const player = { x: 0, z: 0 }
    const prop = { x: 0, z: 4 }
    const shot = composeShot(player, prop, FLAT)
    const camera = { x: shot.position.x, z: shot.position.z }
    expect(angleBetween(prop, camera, player)).toBeLessThan((50 * Math.PI) / 180)
  })

  it('uses a long cinematic lens so both read big on screen', () => {
    const shot = composeShot({ x: 0, z: 0 }, { x: 0, z: 4 }, FLAT)
    expect(shot.fov).toBeGreaterThan(25)
    expect(shot.fov).toBeLessThan(45)
  })

  it('looks between the paladin and the prop', () => {
    const shot = composeShot({ x: 0, z: 0 }, { x: 0, z: 4 }, FLAT)
    expect(shot.target.z).toBeGreaterThan(0.5)
    expect(shot.target.z).toBeLessThan(3.5)
  })

  it('keeps the lens at a human-ish height above the terrain under it', () => {
    const shot = composeShot({ x: 10, z: 10 }, { x: 14, z: 10 }, () => 3)
    expect(shot.position.y).toBeGreaterThan(3 + 1)
    expect(shot.position.y).toBeLessThan(3 + 3)
  })
})



describe('lensScale', () => {
  it('is 1 for the follow lens itself', () => {
    expect(lensScale(FOLLOW_FOV)).toBeCloseTo(1)
  })

  it('shrinks world sizes under a longer lens so they read the same on screen', () => {
    const shot = composeShot({ x: 0, z: 0 }, { x: 0, z: 4 }, FLAT)
    const scale = lensScale(shot.fov)
    expect(scale).toBeLessThan(0.5)
    expect(scale).toBeCloseTo(Math.tan((shot.fov * Math.PI) / 360) / Math.tan((FOLLOW_FOV * Math.PI) / 360))
  })
})
