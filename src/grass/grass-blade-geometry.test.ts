import { describe, expect, it } from 'vitest'
import { createBladeGeometry } from './grass-blade-geometry'

const SEGMENTS = 6

describe('createBladeGeometry', () => {
  const geometry = createBladeGeometry(SEGMENTS)
  const t = geometry.getAttribute('bladeT')
  const side = geometry.getAttribute('bladeSide')
  const index = geometry.getIndex()

  it('has two vertices per row and two triangles per segment', () => {
    expect(geometry.getAttribute('position').count).toBe(2 * (SEGMENTS + 1))
    expect(index?.count).toBe(SEGMENTS * 6)
  })

  it('runs bladeT from 0 at the root to 1 at the tip', () => {
    expect(t.getX(0)).toBe(0)
    expect(t.getX(t.count - 1)).toBe(1)
    for (let i = 2; i < t.count; i++) expect(t.getX(i)).toBeGreaterThanOrEqual(t.getX(i - 2))
  })

  it('alternates bladeSide between -1 and +1', () => {
    for (let i = 0; i < side.count; i++) expect([-1, 1]).toContain(side.getX(i))
  })

  it('only references existing vertices', () => {
    const vertexCount = t.count
    for (let i = 0; i < (index?.count ?? 0); i++) expect(index?.getX(i)).toBeLessThan(vertexCount)
  })
})
