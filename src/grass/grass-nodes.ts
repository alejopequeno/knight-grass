import { abs, clamp, float, mod, oneMinus, select, smoothstep, step } from 'three/tsl'
import type { Node } from 'three/webgpu'
import { FAR_GRID_STRIDE, FAR_MIN_DENSITY, FAR_OUTER_FADE_START, FAR_WIDTH_SCALE, GRASS_RINGS, LOD_HANDOFF, LOD_THIN_START } from './grass-config'
import { FAR_START_DENSITY, GROUND_HALF_EXTENT, VISIBILITY_FADE_BAND } from './grass-layout'

// TSL twins of the pure functions in grass-layout.ts — keep them in sync.

const SUBSET_OFFSET = 1
const HALF = 0.5

export function bladeVisibilityNode(rank: Node<'float'>, density: Node<'float'>): Node<'float'> {
  return smoothstep(rank, rank.add(VISIBILITY_FADE_BAND), density)
}

// 1 for near cells shared with the far ring, else 0. TSL `mod` is floored
// (GLSL semantics), so negative cells work like positiveModulo().
export function farSubsetNode(cell: Node<'vec2'>): Node<'float'> {
  const onX = step(abs(mod(cell.x, FAR_GRID_STRIDE).sub(SUBSET_OFFSET)), HALF)
  const onZ = step(abs(mod(cell.y, FAR_GRID_STRIDE).sub(SUBSET_OFFSET)), HALF)
  return onX.mul(onZ)
}

export function nearOnlyDensityNode(distance: Node<'float'>): Node<'float'> {
  return oneMinus(smoothstep(LOD_THIN_START, LOD_HANDOFF, distance))
}

export function farDensityNode(distance: Node<'float'>): Node<'float'> {
  const farExtent = GRASS_RINGS.far.halfExtent
  const thinT = clamp(distance.sub(LOD_HANDOFF).div(farExtent - LOD_HANDOFF), 0, 1)
  const thinned = float(FAR_START_DENSITY).add(thinT.mul(FAR_MIN_DENSITY - FAR_START_DENSITY))
  return thinned.mul(oneMinus(smoothstep(FAR_OUTER_FADE_START, farExtent, distance)))
}

export function nearBladeVisibilityNode(
  rank: Node<'float'>,
  distance: Node<'float'>,
  shared: Node<'float'>,
): Node<'float'> {
  const sharedVisible = select(distance.lessThan(LOD_HANDOFF), float(1), float(0))
  return select(shared.greaterThan(HALF), sharedVisible, bladeVisibilityNode(rank, nearOnlyDensityNode(distance)))
}

export function farBladeVisibilityNode(rank: Node<'float'>, distance: Node<'float'>): Node<'float'> {
  return select(distance.lessThan(LOD_HANDOFF), float(0), bladeVisibilityNode(rank, farDensityNode(distance)))
}

export function subsetWidthScaleNode(distance: Node<'float'>): Node<'float'> {
  return float(1).add(smoothstep(LOD_THIN_START, LOD_HANDOFF, distance).mul(FAR_WIDTH_SCALE - 1))
}

// 1 on the ground, 0 over the void.
export function groundMaskNode(world: Node<'vec2'>): Node<'float'> {
  return step(abs(world.x), float(GROUND_HALF_EXTENT)).mul(step(abs(world.y), float(GROUND_HALF_EXTENT)))
}
