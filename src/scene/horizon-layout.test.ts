import { describe, expect, it } from 'vitest'
import { WORLD_HALF_EXTENT } from '../lib/world'
import {
  HORIZON_LIMITS,
  RUIN_VARIANTS,
  STORY_PATH,
  TREE_VARIANTS,
  distanceToStoryPath,
  horizonInstances,
} from './horizon-layout'

const ALL_VARIANTS: readonly string[] = [...TREE_VARIANTS, ...RUIN_VARIANTS]

describe('distanceToStoryPath', () => {
  it('is zero on the route itself', () => {
    for (const point of STORY_PATH) {
      expect(distanceToStoryPath(point.x, point.z)).toBeCloseTo(0, 6)
    }
  })

  it('measures to the nearest segment, not just the waypoints', () => {
    const [start, next] = STORY_PATH
    const midX = (start.x + next.x) / 2
    const midZ = (start.z + next.z) / 2
    expect(distanceToStoryPath(midX, midZ)).toBeLessThan(1)
  })
})

describe('horizonInstances', () => {
  const instances = horizonInstances()

  it('is deterministic across calls', () => {
    expect(horizonInstances()).toEqual(instances)
  })

  it('only uses variants the glb exports', () => {
    for (const instance of instances) expect(ALL_VARIANTS).toContain(instance.variant)
  })

  it('never drops a silhouette on the route the story walks', () => {
    for (const { x, z } of instances) {
      expect(distanceToStoryPath(x, z)).toBeGreaterThanOrEqual(HORIZON_LIMITS.pathClearance)
    }
  })

  it('scatters over the whole field instead of ringing the origin', () => {
    const radii = instances.map(({ x, z }) => Math.hypot(x, z))
    expect(Math.min(...radii)).toBeLessThan(80)
    expect(Math.max(...radii)).toBeGreaterThan(150)
  })

  it('keeps every silhouette inside the playable ground', () => {
    for (const { x, z } of instances) {
      expect(Math.abs(x)).toBeLessThan(WORLD_HALF_EXTENT)
      expect(Math.abs(z)).toBeLessThan(WORLD_HALF_EXTENT)
    }
  })

  it('never stacks two silhouettes on top of each other', () => {
    for (let i = 0; i < instances.length; i++) {
      for (let j = i + 1; j < instances.length; j++) {
        const gap = Math.hypot(instances[i].x - instances[j].x, instances[i].z - instances[j].z)
        expect(gap).toBeGreaterThanOrEqual(HORIZON_LIMITS.minSpacing)
      }
    }
  })

  it('places at least one of every ruin variant', () => {
    const used = new Set(instances.map((instance) => instance.variant))
    for (const variant of RUIN_VARIANTS) expect(used).toContain(variant)
  })
})
