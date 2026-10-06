import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'

const VERTICES_PER_ROW = 2

// A flat strip: rows from root (bladeT = 0) to tip (bladeT = 1), two vertices
// per row (bladeSide −1 / +1). Positions are placeholders — the vertex shader
// builds the real shape from bladeT / bladeSide and the blade's state.
export function createBladeGeometry(segments: number): BufferGeometry {
  const rows = segments + 1
  const vertexCount = rows * VERTICES_PER_ROW
  const bladeT = new Float32Array(vertexCount)
  const bladeSide = new Float32Array(vertexCount)
  for (let row = 0; row < rows; row++) {
    const t = row / segments
    bladeT[row * 2] = t
    bladeT[row * 2 + 1] = t
    bladeSide[row * 2] = -1
    bladeSide[row * 2 + 1] = 1
  }

  const indices: number[] = []
  for (let segment = 0; segment < segments; segment++) {
    const a = segment * 2
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(vertexCount * 3), 3))
  geometry.setAttribute('bladeT', new Float32BufferAttribute(bladeT, 1))
  geometry.setAttribute('bladeSide', new Float32BufferAttribute(bladeSide, 1))
  geometry.setIndex(indices)
  return geometry
}
