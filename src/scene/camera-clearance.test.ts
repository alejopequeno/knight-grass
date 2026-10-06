import { describe, expect, it } from 'vitest'
import { terrainHeight } from '../lib/terrain'
import { CAMERA_MIN_CLEARANCE, clampCameraHeight } from './camera-clearance'

describe('clampCameraHeight', () => {
  it('keeps a camera that is already high enough', () => {
    const y = terrainHeight(10, 20) + 5
    expect(clampCameraHeight(y, 10, 20)).toBe(y)
  })

  it('lifts a camera that would dip into the grass', () => {
    const ground = terrainHeight(-30, 4)
    expect(clampCameraHeight(ground + 0.1, -30, 4)).toBeCloseTo(ground + CAMERA_MIN_CLEARANCE)
  })

  it('clears the tallest grass blades', () => {
    expect(CAMERA_MIN_CLEARANCE).toBeGreaterThan(1.6)
  })
})
