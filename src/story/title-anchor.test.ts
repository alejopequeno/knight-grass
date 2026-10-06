import { describe, expect, it } from 'vitest'
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu'
import { TITLE_DISTANCE, TITLE_HEIGHT, placeTitle } from './title-anchor'

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
    expect(position.y).toBeCloseTo(1 + TITLE_HEIGHT)
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
    expect(position.y).toBeCloseTo(TITLE_HEIGHT)
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
