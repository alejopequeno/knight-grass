import { GROUND_SIZE } from '../lib/world'
import {
  FAR_GRID_STRIDE,
  FAR_MIN_DENSITY,
  FAR_OUTER_FADE_START,
  FAR_WIDTH_SCALE,
  GRASS_RINGS,
  LOD_HANDOFF,
  LOD_THIN_START,
  type GrassRingConfig,
} from './grass-config'

export const GROUND_HALF_EXTENT = GROUND_SIZE / 2

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function ringSide(ring: GrassRingConfig): number {
  return Math.ceil((2 * ring.halfExtent) / ring.spacing)
}

export function ringBladeCount(ring: GrassRingConfig): number {
  return ringSide(ring) ** 2
}

// Integer world cell of blade `index`. The grid origin snaps to the cell under
// the player, so a blade keeps its world cell until the player crosses a
// cell — then indices shift by exactly one row/column.
export function bladeCellIndex(
  index: number,
  ring: GrassRingConfig,
  playerX: number,
  playerZ: number,
): { ix: number; iz: number } {
  const side = ringSide(ring)
  const half = Math.floor(side / 2)
  const column = index % side
  const row = Math.floor(index / side)
  return {
    ix: Math.floor(playerX / ring.spacing) + column - half,
    iz: Math.floor(playerZ / ring.spacing) + row - half,
  }
}

export function cellCenter(cellIndex: number, spacing: number): number {
  return (cellIndex + 0.5) * spacing
}

export function chebyshevDistance(dx: number, dz: number): number {
  return Math.max(Math.abs(dx), Math.abs(dz))
}

export function isOnGround(x: number, z: number): boolean {
  return Math.abs(x) <= GROUND_HALF_EXTENT && Math.abs(z) <= GROUND_HALF_EXTENT
}

// Density band over which a blade grows from 0 to full height. A binary
// cut (rank < density) made blades pop in and out every step, because the
// density depends on the distance to the moving player.
export const VISIBILITY_FADE_BAND = 0.2

// 0 → hidden, 1 → full height; continuous in density so walking never pops.
export function bladeVisibility(rank: number, density: number): number {
  return smoothstep(rank, rank + VISIBILITY_FADE_BAND, density)
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus
}

const SUBSET_OFFSET = 1

// Near cells shared with the far ring: the centre of every stride × stride block.
export function isFarSubsetCell(ix: number, iz: number): boolean {
  return (
    positiveModulo(ix, FAR_GRID_STRIDE) === SUBSET_OFFSET && positiveModulo(iz, FAR_GRID_STRIDE) === SUBSET_OFFSET
  )
}

export function nearCellOfFarCell(farCell: number): number {
  return farCell * FAR_GRID_STRIDE + SUBSET_OFFSET
}

// Density for blades only the near ring draws: full, then gone by the hand-off.
export function nearOnlyDensity(distance: number): number {
  return 1 - smoothstep(LOD_THIN_START, LOD_HANDOFF, distance)
}

// Far-ring density starts above 1 + band (+ headroom) so every shared blade
// arrives at full height, then thins with distance and fades at the edge.
const FAR_DENSITY_HEADROOM = 0.05
export const FAR_START_DENSITY = 1 + VISIBILITY_FADE_BAND + FAR_DENSITY_HEADROOM

export function farDensity(distance: number): number {
  const thinT = Math.min(1, Math.max(0, (distance - LOD_HANDOFF) / (GRASS_RINGS.far.halfExtent - LOD_HANDOFF)))
  const thinned = FAR_START_DENSITY + (FAR_MIN_DENSITY - FAR_START_DENSITY) * thinT
  return thinned * (1 - smoothstep(FAR_OUTER_FADE_START, GRASS_RINGS.far.halfExtent, distance))
}

export function nearBladeVisibility(rank: number, distance: number, shared: boolean): number {
  if (shared) return distance < LOD_HANDOFF ? 1 : 0
  return bladeVisibility(rank, nearOnlyDensity(distance))
}

export function farBladeVisibility(rank: number, distance: number): number {
  if (distance < LOD_HANDOFF) return 0
  return bladeVisibility(rank, farDensity(distance))
}

// Shared blades widen as their near-only neighbours thin out, so coverage
// holds; continuous in distance, so nothing jumps at the hand-off.
export function subsetWidthScale(distance: number): number {
  return 1 + (FAR_WIDTH_SCALE - 1) * smoothstep(LOD_THIN_START, LOD_HANDOFF, distance)
}
