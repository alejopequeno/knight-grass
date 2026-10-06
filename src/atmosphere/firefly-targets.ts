import { instancedArray } from 'three/tsl'
import type { Vector3 } from 'three/webgpu'
import { terrainHeight } from '../lib/terrain'

export const FIREFLY_COUNT = 800
export const TRAIL_COUNT = 160
const TRAIL_HEIGHT = 1.6
// The trail starts a few metres ahead so it never clumps on the paladin.
const TRAIL_START_OFFSET = 4
const TRAIL_BOB = 0.25
const TRAIL_SWAY = 0.35
const RISE_RADIUS = 3
const RISE_SPEED = 1.5
const RISE_MAX = 60
const VEC4 = 4
// Target weight > 0.5 means 'follow the target'.
const GUIDE_WEIGHT = 1

export const fireflyTargets = instancedArray(FIREFLY_COUNT, 'vec4')

function targetArray(): Float32Array {
  const { array } = fireflyTargets.value
  if (!(array instanceof Float32Array)) throw new Error('[fireflies] targets must be Float32Array')
  return array
}

function commit(): void {
  fireflyTargets.value.needsUpdate = true
}

export function clearTargets(): void {
  targetArray().fill(0)
  commit()
}

type PointXZ = { x: number; z: number }

// Where the trail ends: on the edge of the waypoint's clearing, facing the
// player, so the fireflies never pile up on the prop itself.
export function trailEnd(from: PointXZ, to: PointXZ, stopShort: number): PointXZ {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const length = Math.hypot(dx, dz)
  if (stopShort <= 0 || length === 0) return { x: to.x, z: to.z }
  const travel = Math.max(0, length - stopShort)
  return { x: from.x + (dx / length) * travel, z: from.z + (dz / length) * travel }
}

// Souls gathered around a waypoint while its beat plays: a slow ring with
// a little wobble in radius and height.
const HALO_SPEED = 0.25
// Low and tight around the prop: they light it, never the texts above it
// nor the paladin standing at the trigger radius.
const HALO_HEIGHT = 0.9
const HALO_COUNT = 32
const HALO_HEIGHT_SWAY = 0.3
const HALO_RADIUS_SWAY = 0.3

export function haloPoint(centre: PointXZ, index: number, count: number, time: number, radius: number): PointXZ {
  const angle = (index / count) * Math.PI * 2 + time * HALO_SPEED
  const r = radius + Math.sin(index * 1.7 + time * 0.6) * HALO_RADIUS_SWAY
  return { x: centre.x + Math.cos(angle) * r, z: centre.z + Math.sin(angle) * r }
}

// The rest of the trail souls drift out into a wide, high ring, so they never
// stay clumped where the trail ended (beside the paladin).
const SCATTER_RADIUS = 16
const SCATTER_HEIGHT = 3
const SCATTER_HEIGHT_SPREAD = 2

export function writeHaloTargets(centre: PointXZ, radius: number, time: number): void {
  const array = targetArray()
  array.fill(0)
  for (let i = 0; i < HALO_COUNT; i++) {
    const { x, z } = haloPoint(centre, i, HALO_COUNT, time, radius)
    const y = terrainHeight(x, z) + HALO_HEIGHT + Math.sin(time * 0.9 + i * 0.8) * HALO_HEIGHT_SWAY
    array.set([x, y, z, GUIDE_WEIGHT], i * VEC4)
  }
  const scattered = TRAIL_COUNT - HALO_COUNT
  for (let i = 0; i < scattered; i++) {
    const { x, z } = haloPoint(centre, i, scattered, time, SCATTER_RADIUS)
    const y = terrainHeight(x, z) + SCATTER_HEIGHT + Math.sin(i * 2.3) * SCATTER_HEIGHT_SPREAD
    array.set([x, y, z, GUIDE_WEIGHT], (HALO_COUNT + i) * VEC4)
  }
  commit()
}

export function writeTrailTargets(from: Vector3, waypoint: Vector3, time: number, stopShort = 0): void {
  const array = targetArray()
  array.fill(0)
  const to = trailEnd(from, waypoint, stopShort)
  const length = Math.hypot(to.x - from.x, to.z - from.z)
  const startT = length > 0 ? Math.min(1, TRAIL_START_OFFSET / length) : 1
  for (let i = 0; i < TRAIL_COUNT; i++) {
    const t = startT + (1 - startT) * ((i + 0.5) / TRAIL_COUNT)
    const x = from.x + (to.x - from.x) * t + Math.sin(time * 0.8 + i) * TRAIL_SWAY
    const z = from.z + (to.z - from.z) * t + Math.cos(time * 0.7 + i * 1.3) * TRAIL_SWAY
    const y = terrainHeight(x, z) + TRAIL_HEIGHT + Math.sin(time * 1.4 + i * 0.6) * TRAIL_BOB
    array.set([x, y, z, GUIDE_WEIGHT], i * VEC4)
  }
  commit()
}

export function writeRiseTargets(center: Vector3, time: number): void {
  const array = targetArray()
  for (let i = 0; i < FIREFLY_COUNT; i++) {
    const angle = (i / FIREFLY_COUNT) * Math.PI * 2 + time * 0.3
    const radius = RISE_RADIUS + (i % 7)
    const height = Math.min(RISE_MAX, (time * RISE_SPEED + (i % 40)) * 1.2)
    array.set([center.x + Math.cos(angle) * radius, center.y + height, center.z + Math.sin(angle) * radius, GUIDE_WEIGHT], i * VEC4)
  }
  commit()
}
