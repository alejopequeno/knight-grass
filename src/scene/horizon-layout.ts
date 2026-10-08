import { createSeededRandom } from '../lib/seeded-random'
import type { PropCollider } from './scattered-props'
import { STORY_SCRIPT, type Waypoint } from '../story/story-script'
import { WORLD_HALF_EXTENT } from '../lib/world'

export const TREE_VARIANTS = ['tree_0', 'tree_1', 'tree_2', 'tree_3', 'tree_4'] as const
export const RUIN_VARIANTS = ['arch_0', 'wall_0'] as const

export type HorizonVariant = (typeof TREE_VARIANTS)[number] | (typeof RUIN_VARIANTS)[number]

export type HorizonInstance = {
  variant: HorizonVariant
  x: number
  z: number
  /** Rotation around y, radians. */
  yaw: number
  scale: number
}

const SEED = 5321
// Stay inside the walkable bound so nothing straddles the world edge.
const PLACEMENT_HALF_EXTENT = WORLD_HALF_EXTENT - 12
// The story walks the player up the field; keep this much room either side of
// that line so silhouettes stay scenery and never block the route.
const PATH_CLEARANCE = 34
const MIN_SPACING = 13
const TREE_COUNT = 54
const RUIN_COUNT = 5
const MAX_ATTEMPTS = 4000
const TREE_SCALE_RANGE = [0.8, 1.45] as const
const RUIN_SCALE_RANGE = [0.85, 1.3] as const

/** The route the story walks, starting at the spawn. */
export const STORY_PATH: readonly Waypoint[] = [
  { x: 0, z: 0 },
  ...STORY_SCRIPT.flatMap((beat) => (beat.waypoint ? [beat.waypoint] : [])),
]

function distanceToSegment(x: number, z: number, a: Waypoint, b: Waypoint): number {
  const abX = b.x - a.x
  const abZ = b.z - a.z
  const lengthSquared = abX * abX + abZ * abZ
  if (lengthSquared === 0) return Math.hypot(x - a.x, z - a.z)
  const t = Math.min(1, Math.max(0, ((x - a.x) * abX + (z - a.z) * abZ) / lengthSquared))
  return Math.hypot(x - (a.x + abX * t), z - (a.z + abZ * t))
}

/** Shortest distance from a point to the story route. */
export function distanceToStoryPath(x: number, z: number): number {
  let shortest = Infinity
  for (let index = 1; index < STORY_PATH.length; index++) {
    shortest = Math.min(shortest, distanceToSegment(x, z, STORY_PATH[index - 1], STORY_PATH[index]))
  }
  return shortest
}

function between(random: () => number, [low, high]: readonly [number, number]): number {
  return low + random() * (high - low)
}

/**
 * Silhouettes scattered over the whole field — not a ring around the origin.
 * The player walks far from where they started, so anything anchored to the
 * world centre ends up on top of them halfway through the story.
 */
export function horizonInstances(): HorizonInstance[] {
  const random = createSeededRandom(SEED)
  const instances: HorizonInstance[] = []

  const fits = (x: number, z: number): boolean => {
    if (distanceToStoryPath(x, z) < PATH_CLEARANCE) return false
    return instances.every((placed) => Math.hypot(placed.x - x, placed.z - z) >= MIN_SPACING)
  }

  const scatter = (count: number, variants: readonly HorizonVariant[], scaleRange: readonly [number, number]) => {
    let placed = 0
    let attempts = 0
    while (placed < count && attempts < MAX_ATTEMPTS) {
      attempts++
      const x = (random() * 2 - 1) * PLACEMENT_HALF_EXTENT
      const z = (random() * 2 - 1) * PLACEMENT_HALF_EXTENT
      if (!fits(x, z)) continue
      instances.push({
        variant: variants[Math.floor(random() * variants.length)],
        x,
        z,
        yaw: random() * Math.PI * 2,
        scale: between(random, scaleRange),
      })
      placed++
    }
  }

  scatter(TREE_COUNT, TREE_VARIANTS, TREE_SCALE_RANGE)
  scatter(RUIN_COUNT, RUIN_VARIANTS, RUIN_SCALE_RANGE)
  return instances
}

export const HORIZON_LIMITS = { pathClearance: PATH_CLEARANCE, minSpacing: MIN_SPACING }

export function isTreeVariant(variant: string): boolean {
  return (TREE_VARIANTS as readonly string[]).includes(variant)
}

function isRuinVariant(variant: string): variant is (typeof RUIN_VARIANTS)[number] {
  return (RUIN_VARIANTS as readonly string[]).includes(variant)
}

const TRUNK_COLLIDER: PropCollider = { shape: 'cylinder', halfHeight: 4.5, radius: 0.5 }
const RUIN_COLLIDERS: Readonly<Record<(typeof RUIN_VARIANTS)[number], PropCollider>> = {
  arch_0: { shape: 'cuboid', halfExtents: [3.5, 3, 0.6] },
  wall_0: { shape: 'cuboid', halfExtents: [5.5, 1.8, 0.6] },
}

export function colliderFor(variant: string): PropCollider | null {
  if (isTreeVariant(variant)) return TRUNK_COLLIDER
  return isRuinVariant(variant) ? RUIN_COLLIDERS[variant] : null
}
