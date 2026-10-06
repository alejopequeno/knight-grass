import { describe, expect, it } from 'vitest'
import { directionFromAngles } from './atmosphere'

describe('directionFromAngles', () => {
  it('points straight up at 90° elevation', () => {
    const d = directionFromAngles(90, 0)
    expect(d.y).toBeCloseTo(1, 6)
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(0, 6)
  })

  it('lies on the horizon at 0° elevation', () => {
    expect(directionFromAngles(0, 194).y).toBeCloseTo(0, 6)
  })

  it('is below the horizon for negative elevation', () => {
    expect(directionFromAngles(-2, 194).y).toBeLessThan(0)
  })

  it('is unit length', () => {
    expect(directionFromAngles(35, 14).length()).toBeCloseTo(1, 6)
  })
})
