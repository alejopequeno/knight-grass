import { describe, expect, it } from 'vitest'
import { WORLD_HALF_EXTENT } from '../lib/world'
import {
  FIELD_LIMITS,
  FIELD_VARIANTS,
  colliderFor,
  fieldPropInstances,
} from './field-props-layout'
import { distanceToStoryPath, horizonInstances } from './horizon-layout'

describe('fieldPropInstances', () => {
  const instances = fieldPropInstances()

  it('is deterministic across calls', () => {
    expect(fieldPropInstances()).toEqual(instances)
  })

  it('places the full set', () => {
    expect(instances.length).toBeGreaterThan(30)
  })

  it('only uses variants the glb exports', () => {
    for (const instance of instances) {
      expect(FIELD_VARIANTS as readonly string[]).toContain(instance.variant)
    }
  })

  it('keeps clear of the route without drifting out of sight of it', () => {
    for (const { x, z } of instances) {
      const toPath = distanceToStoryPath(x, z)
      expect(toPath).toBeGreaterThanOrEqual(FIELD_LIMITS.minPathClearance)
      expect(toPath).toBeLessThanOrEqual(FIELD_LIMITS.maxPathClearance)
    }
  })

  it('never stacks two props on top of each other', () => {
    for (let i = 0; i < instances.length; i++) {
      for (let j = i + 1; j < instances.length; j++) {
        const gap = Math.hypot(instances[i].x - instances[j].x, instances[i].z - instances[j].z)
        expect(gap).toBeGreaterThanOrEqual(FIELD_LIMITS.minSpacing)
      }
    }
  })

  it('stays inside the playable ground', () => {
    for (const { x, z } of instances) {
      expect(Math.abs(x)).toBeLessThan(WORLD_HALF_EXTENT)
      expect(Math.abs(z)).toBeLessThan(WORLD_HALF_EXTENT)
    }
  })

  it('does not land inside a horizon silhouette', () => {
    const silhouettes = horizonInstances()
    for (const prop of instances) {
      for (const silhouette of silhouettes) {
        expect(Math.hypot(prop.x - silhouette.x, prop.z - silhouette.z)).toBeGreaterThan(3)
      }
    }
  })
})

describe('colliderFor', () => {
  it('gives every exported variant a solid', () => {
    for (const variant of FIELD_VARIANTS) expect(colliderFor(variant)).not.toBeNull()
  })

  it('returns null for anything else, so unknown nodes stay walk-through', () => {
    expect(colliderFor('tree_0')).toBeNull()
    expect(colliderFor('')).toBeNull()
  })
})
