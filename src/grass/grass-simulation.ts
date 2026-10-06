import {
  abs,
  cos,
  float,
  floor,
  Fn,
  instanceIndex,
  length,
  max,
  min,
  mix,
  mx_noise_float,
  oneMinus,
  select,
  sin,
  time,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import { capsuleGroundPushNode } from '../lib/character-capsules'
import { motionScale, playerPosition } from '../lib/shared-uniforms'
import { terrainHeightNode } from '../lib/terrain'
import { FAR_GRID_STRIDE, GRASS_RINGS, REDUCED_GUST_SCALE } from './grass-config'
import { STORY_CLEARINGS } from '../story/story-script'
import { clearingHeightNode } from './grass-clearings'
import { hash21, hash22 } from './grass-hash'
import { ringSide } from './grass-layout'
import { farBladeVisibilityNode, farSubsetNode, groundMaskNode, nearBladeVisibilityNode } from './grass-nodes'
import type { RingState } from './grass-state'
import { grassUniforms } from './grass-uniforms'

const TWO_PI = Math.PI * 2
// Distinct offsets so each per-blade property draws an independent hash.
const HASH_HEIGHT = vec2(13.7, 7.1)
const HASH_YAW = vec2(29.3, 3.9)
const HASH_LEAN = vec2(5.1, 41.2)
const HASH_RANK = vec2(57.8, 17.4)
const HASH_SEED = vec2(71.9, 63.3)
const HASH_STIFFNESS = vec2(83.3, 29.9)
const HASH_CLUMP = vec2(3.3, 91.1)
const HASH_CLUMP_TINT = vec2(47.7, 11.3)
const CLUMP_SEARCH_INFINITY = 1e9
const CLUMP_YAW_WEIGHT = 0.6
const CLUMP_LEAN = 0.15
const WIND_WARP = 0.6
const WARP_Z_A = 1.7
const WARP_Z_B = 9.2
const GUST_EVOLUTION = 0.05
const FLUTTER_RATE = 3.1
const FLUTTER_AMPLITUDE = 0.06
// Gap kept between blades and the body (m).
const CONTACT_MARGIN = 0.04
// A quadratic blade's middle moves ~half its tip: bend the tip ~2× the
// penetration so the whole blade clears the leg.
const CONTACT_BEND_GAIN = 2.2
const CONTACT_SINK = 0.5
const MIN_LENGTH = 1e-4
const NEAR_SPACING = GRASS_RINGS.near.spacing
// Shared near cells sit at the centre of each stride × stride block.
const SUBSET_OFFSET = 1

// One compute thread per blade: world-anchored placement, per-blade traits
// from the cell hash, Voronoi clumps, noise wind, trample and LOD fades.
export function createRingSimulation(state: RingState) {
  const { ring } = state
  const side = ringSide(ring)
  const half = Math.floor(side / 2)
  const u = grassUniforms
  const isFarRing = ring.name === 'far'

  return Fn(() => {
    const index = float(instanceIndex)
    const column = index.mod(side)
    const row = floor(index.div(side))
    const ringCell = vec2(
      floor(playerPosition.x.div(ring.spacing)).add(column).sub(half),
      floor(playerPosition.z.div(ring.spacing)).add(row).sub(half),
    )
    // Every blade is identified by its NEAR-grid cell, so a far blade is the
    // exact same blade (position, traits) as the near blade it replaces.
    const cell = isFarRing ? ringCell.mul(FAR_GRID_STRIDE).add(SUBSET_OFFSET) : ringCell
    const jitter = hash22(cell).sub(0.5).mul(NEAR_SPACING)
    const world = cell.add(0.5).mul(NEAR_SPACING).add(jitter)

    const baseHeight = mix(u.heightMin, u.heightMax, hash21(cell.add(HASH_HEIGHT)))
    const yaw = hash21(cell.add(HASH_YAW)).mul(TWO_PI)
    const lean = mix(u.leanMin, u.leanMax, hash21(cell.add(HASH_LEAN)))
    const rank = hash21(cell.add(HASH_RANK))
    const seed = hash21(cell.add(HASH_SEED))

    // Voronoi clumps: nearest jittered centre among the 3×3 neighbouring cells.
    const clumpCell = floor(world.div(u.clumpSize))
    const bestDistance = float(CLUMP_SEARCH_INFINITY).toVar()
    const bestCell = vec2(0, 0).toVar()
    const bestCenter = vec2(0, 0).toVar()
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const candidateCell = clumpCell.add(vec2(dx, dz))
        const candidateCenter = candidateCell.add(hash22(candidateCell)).mul(u.clumpSize)
        const candidateDistance = length(world.sub(candidateCenter))
        const closer = candidateDistance.lessThan(bestDistance)
        bestCell.assign(select(closer, candidateCell, bestCell))
        bestCenter.assign(select(closer, candidateCenter, bestCenter))
        bestDistance.assign(min(bestDistance, candidateDistance))
      }
    }
    const clumpHash = hash21(bestCell.add(HASH_CLUMP))
    const clumpTint = hash21(bestCell.add(HASH_CLUMP_TINT))
    const clumpHeight = mix(u.clumpHeightMin, u.clumpHeightMax, clumpHash)
    const clumpYaw = mix(yaw, clumpHash.mul(TWO_PI), CLUMP_YAW_WEIGHT)
    const toClump = bestCenter.sub(world)
    const clumpLean = toClump.div(max(length(toClump), MIN_LENGTH)).mul(CLUMP_LEAN)

    // Wind: domain-warped scrolling noise → gusts that travel across the field.
    const windUv = world.mul(u.windScale).sub(u.windDirection.mul(time.mul(u.windSpeed)))
    const warp = vec2(mx_noise_float(vec3(windUv, WARP_Z_A)), mx_noise_float(vec3(windUv, WARP_Z_B))).mul(WIND_WARP)
    const gust = mx_noise_float(vec3(windUv.add(warp), time.mul(GUST_EVOLUTION))).mul(0.5).add(0.5)
    const stiffness = mix(u.stiffnessMin, u.stiffnessMax, hash21(cell.add(HASH_STIFFNESS)))
    const flutter = sin(time.mul(FLUTTER_RATE).add(seed.mul(TWO_PI))).mul(FLUTTER_AMPLITUDE).mul(motionScale)
    const gustScale = float(REDUCED_GUST_SCALE).add(oneMinus(float(REDUCED_GUST_SCALE)).mul(motionScale))
    const windAmount = gust.mul(u.windStrength).mul(gustScale).add(flutter).div(stiffness)

    // Body contact: every leg/foot/torso capsule that reaches into the blade
    // pushes it out; blades rooted inside a capsule also flatten.
    const rootY = terrainHeightNode(world)
    const reachY = rootY.add(baseHeight.mul(clumpHeight))
    const contact = capsuleGroundPushNode(world, reachY, CONTACT_MARGIN)
    const fullHeight = baseHeight.mul(clumpHeight).mul(oneMinus(contact.z.mul(CONTACT_SINK)))

    const offset = world.sub(playerPosition.xz)
    const distance = max(abs(offset.x), abs(offset.y))
    const shared = isFarRing ? float(1) : farSubsetNode(cell)
    const visible = isFarRing
      ? farBladeVisibilityNode(rank, distance)
      : nearBladeVisibilityNode(rank, distance, shared)
    const height = fullHeight.mul(visible).mul(groundMaskNode(world)).mul(clearingHeightNode(world, STORY_CLEARINGS))

    // Blades lean along their facing (perpendicular to the width direction).
    const facing = vec2(sin(clumpYaw).negate(), cos(clumpYaw))
    const bend = facing
      .mul(lean)
      .add(clumpLean)
      .add(u.windDirection.mul(windAmount))
      .mul(fullHeight)
      .add(contact.xy.mul(u.trampleStrength.mul(CONTACT_BEND_GAIN)))

    state.bladeA.element(instanceIndex).assign(vec4(world.x, world.y, height, clumpYaw))
    state.bladeB.element(instanceIndex).assign(vec4(bend.x, bend.y, clumpTint.add(shared), seed))
  })().compute(state.count)
}
