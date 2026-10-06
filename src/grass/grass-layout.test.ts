import { describe, expect, it } from 'vitest'
import { FAR_GRID_STRIDE, GRASS_RINGS, LOD_HANDOFF, LOD_THIN_START } from './grass-config'
import {
  bladeCellIndex,
  bladeVisibility,
  cellCenter,
  chebyshevDistance,
  farBladeVisibility,
  GROUND_HALF_EXTENT,
  isFarSubsetCell,
  isOnGround,
  nearBladeVisibility,
  nearCellOfFarCell,
  ringBladeCount,
  ringSide,
  subsetWidthScale,
} from './grass-layout'

const near = GRASS_RINGS.near
const far = GRASS_RINGS.far
const SAMPLE_STRIDE = 997
const EPSILON = 1e-6
const RANKS = Array.from({ length: 21 }, (_, i) => i / 20)

function sampledCells(playerX: number, playerZ: number) {
  const cells: string[] = []
  for (let index = 0; index < ringBladeCount(near); index += SAMPLE_STRIDE) {
    const { ix, iz } = bladeCellIndex(index, near, playerX, playerZ)
    cells.push(`${ix}:${iz}`)
  }
  return cells
}

describe('ring sizing', () => {
  it('covers each ring with a square grid', () => {
    expect(ringSide(near)).toBe(Math.ceil((2 * near.halfExtent) / near.spacing))
    expect(ringBladeCount(far)).toBe(ringSide(far) ** 2)
  })

  it('nests the far grid inside the near grid', () => {
    expect(far.spacing).toBeCloseTo(near.spacing * FAR_GRID_STRIDE, 10)
  })
})

describe('world-anchored grid', () => {
  it('keeps every blade on the same world cell while the player moves inside a cell', () => {
    const base = 3 * near.spacing
    expect(sampledCells(base + 0.01, 1.2)).toEqual(sampledCells(base + near.spacing * 0.9, 1.2))
  })

  it('crossing a cell shifts indices by one column but keeps shared world cells identical', () => {
    const before = bladeCellIndex(500, near, 0.001, 0.001)
    const after = bladeCellIndex(499, near, near.spacing + 0.001, 0.001)
    expect(after).toEqual(before)
  })

  it('never places a blade outside its ring', () => {
    const playerX = 12.34
    const playerZ = -56.7
    for (let index = 0; index < ringBladeCount(near); index += SAMPLE_STRIDE) {
      const { ix, iz } = bladeCellIndex(index, near, playerX, playerZ)
      const dx = cellCenter(ix, near.spacing) - playerX
      const dz = cellCenter(iz, near.spacing) - playerZ
      expect(chebyshevDistance(dx, dz)).toBeLessThanOrEqual(near.halfExtent + near.spacing)
    }
  })
})

describe('nested LOD', () => {
  it('maps every far cell onto a near cell of the shared subset', () => {
    for (const farCell of [-7, -1, 0, 1, 5, 123]) {
      const nearCell = nearCellOfFarCell(farCell)
      expect(isFarSubsetCell(nearCell, nearCell)).toBe(true)
    }
  })

  it('marks exactly one near cell in every stride × stride block as shared', () => {
    let shared = 0
    for (let ix = -6; ix < 3; ix++) for (let iz = -6; iz < 3; iz++) if (isFarSubsetCell(ix, iz)) shared++
    expect(shared).toBe(9)
  })

  it('hands a shared blade from the near to the far ring without it ever disappearing', () => {
    for (const rank of RANKS) {
      expect(nearBladeVisibility(rank, LOD_HANDOFF - EPSILON, true)).toBe(1)
      expect(farBladeVisibility(rank, LOD_HANDOFF + EPSILON)).toBe(1)
    }
  })

  it('never shows a shared blade in both rings at once', () => {
    for (const d of [0, 5, LOD_HANDOFF - 0.01, LOD_HANDOFF, LOD_HANDOFF + 0.01, 30]) {
      const both = nearBladeVisibility(0.5, d, true) > 0 && farBladeVisibility(0.5, d) > 0
      expect(both).toBe(false)
    }
  })

  it('fades the near-only blades out completely before the hand-off', () => {
    for (const rank of RANKS) expect(nearBladeVisibility(rank, LOD_HANDOFF, false)).toBe(0)
    expect(nearBladeVisibility(0.5, LOD_THIN_START, false)).toBe(1)
  })

  it('widens shared blades continuously with distance (no jump at the hand-off)', () => {
    for (let d = 0; d < 40; d += 0.05) {
      expect(Math.abs(subsetWidthScale(d + 0.05) - subsetWidthScale(d))).toBeLessThan(0.05)
    }
    expect(subsetWidthScale(0)).toBe(1)
  })

  it('fades the far ring out at its edge', () => {
    expect(farBladeVisibility(0, far.halfExtent)).toBe(0)
  })
})

describe('bladeVisibility', () => {
  it('hides every blade where the density is zero, even a rank of exactly 0', () => {
    expect(bladeVisibility(0, 0)).toBe(0)
  })

  it('changes smoothly as the density drifts while the player walks (no popping)', () => {
    const DENSITY_STEP = 0.01
    const MAX_JUMP = 0.1
    for (const rank of RANKS) {
      for (let density = 0; density < 1; density += DENSITY_STEP) {
        expect(Math.abs(bladeVisibility(rank, density + DENSITY_STEP) - bladeVisibility(rank, density))).toBeLessThan(MAX_JUMP)
      }
    }
  })
})

describe('isOnGround', () => {
  it('accepts points on the 400 m ground and rejects the void past it', () => {
    expect(isOnGround(0, 0)).toBe(true)
    expect(isOnGround(GROUND_HALF_EXTENT - 0.1, -GROUND_HALF_EXTENT + 0.1)).toBe(true)
    expect(isOnGround(GROUND_HALF_EXTENT + 0.1, 0)).toBe(false)
  })
})
