import { describe, expect, it } from 'vitest'
import { CAMERA_MIN_CLEARANCE } from '../scene/camera-clearance'
import { GRASS_DEFAULTS, gustScaleFor, maxBladeHeight, REDUCED_GUST_SCALE } from './grass-config'
import { grassUniforms } from './grass-uniforms'

describe('grass config', () => {
  it('keeps the tallest blade below the camera clearance', () => {
    expect(maxBladeHeight()).toBeLessThan(CAMERA_MIN_CLEARANCE)
  })
})

describe('grass uniforms', () => {
  it('start from GRASS_DEFAULTS', () => {
    expect(grassUniforms.windStrength.value).toBe(GRASS_DEFAULTS.windStrength)
    expect(grassUniforms.heightMax.value).toBe(GRASS_DEFAULTS.heightMax)
    expect(`#${grassUniforms.tipColor.value.getHexString()}`).toBe(GRASS_DEFAULTS.tipColor)
  })
})

describe('gustScaleFor', () => {
  it('keeps full gusts with normal motion', () => {
    expect(gustScaleFor(1)).toBe(1)
  })

  it('reduces gusts for reduced motion', () => {
    expect(gustScaleFor(0)).toBe(REDUCED_GUST_SCALE)
  })
})
