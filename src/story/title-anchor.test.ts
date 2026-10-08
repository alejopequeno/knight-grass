import { describe, expect, it } from 'vitest'
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu'
import { FOLLOW_FOV } from '../lib/camera-shot'
import { TITLE_DISTANCE, TITLE_ELEVATION_DEG, placeTitle, titleRise } from './title-anchor'

function decompose(matrix: Matrix4) {
  const position = new Vector3()
  const rotation = new Quaternion()
  matrix.decompose(position, rotation, new Vector3())
  return { position, normal: new Vector3(0, 0, 1).applyQuaternion(rotation) }
}

describe('placeTitle', () => {
  it('pins the title on the horizon ahead of where the camera looks', () => {
    const matrix = new Matrix4()
    placeTitle(matrix, new Vector3(0, 1, 0), new Vector3(0, 0, 1))
    const { position } = decompose(matrix)
    expect(position.z).toBeCloseTo(TITLE_DISTANCE)
    expect(position.x).toBeCloseTo(0)
    expect(position.y).toBeCloseTo(1 + titleRise(TITLE_DISTANCE))
  })

  it('turns the title to face the viewer', () => {
    const matrix = new Matrix4()
    placeTitle(matrix, new Vector3(0, 0, 0), new Vector3(1, 0, 0))
    const { position, normal } = decompose(matrix)
    expect(position.x).toBeCloseTo(TITLE_DISTANCE)
    expect(normal.x).toBeCloseTo(-1)
  })

  it('ignores the pitch of the look direction', () => {
    const matrix = new Matrix4()
    placeTitle(matrix, new Vector3(0, 0, 0), new Vector3(0, -3, 4))
    const { position } = decompose(matrix)
    expect(position.z).toBeCloseTo(TITLE_DISTANCE)
    expect(position.y).toBeCloseTo(titleRise(TITLE_DISTANCE))
  })
})

describe('placeTitle scale', () => {
  it('applies the given scale to the title', () => {
    const matrix = new Matrix4()
    placeTitle(matrix, new Vector3(), new Vector3(0, 0, 1), 0.5)
    const scale = new Vector3()
    matrix.decompose(new Vector3(), new Quaternion(), scale)
    expect(scale.x).toBeCloseTo(0.5)
  })
})

describe('title elevation', () => {
  // The follow camera looks about 19 degrees down at the paladin on flat
  // ground, and tips further on a slope. A title has to clear that and still
  // sit inside the top half of the lens.
  const FOLLOW_DOWNWARD_DEG = 19
  const SLOPE_ALLOWANCE_DEG = 10

  it('stays inside the frame even with the camera tipped down a slope', () => {
    const fromFrameCentre = TITLE_ELEVATION_DEG + FOLLOW_DOWNWARD_DEG + SLOPE_ALLOWANCE_DEG
    expect(fromFrameCentre).toBeLessThan(FOLLOW_FOV / 2)
  })

  it('rises in step with distance, so the angle is what is pinned', () => {
    expect(titleRise(90) / titleRise(45)).toBeCloseTo(2)
    expect(Math.atan2(titleRise(45), 45) * (180 / Math.PI)).toBeCloseTo(TITLE_ELEVATION_DEG)
  })
})
