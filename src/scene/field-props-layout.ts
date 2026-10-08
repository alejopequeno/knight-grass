import { createSeededRandom } from '../lib/seeded-random'
import { WORLD_HALF_EXTENT } from '../lib/world'
import { distanceToStoryPath } from './horizon-layout'
import type { PropCollider, ScatterInstance } from './scattered-props'

export const FIELD_VARIANTS = ['log_0', 'boulder_0', 'boulder_1'] as const

export type FieldVariant = (typeof FIELD_VARIANTS)[number]

const SEED = 8821
const PLACEMENT_HALF_EXTENT = WORLD_HALF_EXTENT - 10
// Close enough to the route that the player walks past them, far enough that
// none of them ever blocks the way or crowds a story prop.
const MIN_PATH_CLEARANCE = 7
const MAX_PATH_CLEARANCE = 46
const MIN_SPACING = 11
const PROP_COUNT = 38
const MAX_ATTEMPTS = 6000
const SCALE_RANGE = [0.8, 1.35] as const

// The props are modelled standing 1.5–1.9 m so they clear the grass; the
// colliders are the blunt shapes inside them.
const COLLIDERS: Readonly<Record<FieldVariant, PropCollider>> = {
  log_0: { shape: 'cuboid', halfExtents: [2.6, 0.7, 0.5] },
  boulder_0: { shape: 'cuboid', halfExtents: [1.1, 0.95, 1.5] },
  boulder_1: { shape: 'cuboid', halfExtents: [2.1, 0.85, 1.0] },
}

function isFieldVariant(variant: string): variant is FieldVariant {
  return (FIELD_VARIANTS as readonly string[]).includes(variant)
}

export function colliderFor(variant: string): PropCollider | null {
  return isFieldVariant(variant) ? COLLIDERS[variant] : null
}

/**
 * Fallen trunks and erratic boulders through the field the player walks.
 *
 * Unlike the horizon silhouettes these live inside the route's shoulder: the
 * point is that you pass close to them, because near the camera is the only
 * place a photogrammetry scan earns its triangles.
 */
export function fieldPropInstances(): ScatterInstance[] {
  const random = createSeededRandom(SEED)
  const instances: ScatterInstance[] = []

  let attempts = 0
  while (instances.length < PROP_COUNT && attempts < MAX_ATTEMPTS) {
    attempts++
    const x = (random() * 2 - 1) * PLACEMENT_HALF_EXTENT
    const z = (random() * 2 - 1) * PLACEMENT_HALF_EXTENT
    const toPath = distanceToStoryPath(x, z)
    if (toPath < MIN_PATH_CLEARANCE || toPath > MAX_PATH_CLEARANCE) continue
    if (instances.some((placed) => Math.hypot(placed.x - x, placed.z - z) < MIN_SPACING)) continue
    instances.push({
      variant: FIELD_VARIANTS[Math.floor(random() * FIELD_VARIANTS.length)],
      x,
      z,
      yaw: random() * Math.PI * 2,
      scale: SCALE_RANGE[0] + random() * (SCALE_RANGE[1] - SCALE_RANGE[0]),
    })
  }

  return instances
}

export const FIELD_LIMITS = {
  minPathClearance: MIN_PATH_CLEARANCE,
  maxPathClearance: MAX_PATH_CLEARANCE,
  minSpacing: MIN_SPACING,
}
