import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  clamp,
  exp,
  color,
  float,
  Fn,
  hash,
  instanceIndex,
  instancedArray,
  length,
  mix,
  mod,
  mx_noise_vec3,
  oneMinus,
  pow,
  select,
  sin,
  smoothstep,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import { AdditiveBlending, Sprite, SpriteNodeMaterial, type Node } from 'three/webgpu'
import { capsuleVolumePushNode } from '../lib/character-capsules'
import { FIREFLY_COUNT, fireflyTargets } from './firefly-targets'
import { clampFrameDelta } from '../lib/frame-delta'
import { motionScale, playerPosition } from '../lib/shared-uniforms'
import { terrainHeightNode } from '../lib/terrain'
import { asWebGPURenderer } from '../renderer/as-webgpu-renderer'

const SPAWN_RADIUS = 25
const MIN_HEIGHT = 0.8
const MAX_HEIGHT = 2.6
const DRIFT_SPEED = 0.6
const NOISE_SCALE = 0.15
const NOISE_TIME_SCALE = 0.1
const SPRITE_SIZE = 0.2
// A swarm of identical discs reads as particles. Every firefly draws its own
// size, hue, blink rate and blink depth from its instance hash instead.
const SIZE_SCALE_RANGE = [0.45, 1.7] as const
const GLOW_COOL = '#cdf27a'
const GLOW_WARM = '#ffc247'
const GLOW_INTENSITY = 6
const PULSE_SPEED_RANGE = [1.1, 3.6] as const
// Depth 1 blinks all the way to dark; low values only breathe.
const PULSE_DEPTH_RANGE = [0.35, 1] as const
// Tight core over a wide halo — a bare radial falloff reads as a flat disc.
const CORE_POWER = 5
const CORE_GAIN = 0.8
const HALO_GAIN = 0.22
const TWO_PI = Math.PI * 2
// Extra gap between a firefly and the body surface (m).
const BODY_CLEARANCE = 0.12
// How fast a firefly with a story target flies to it (1/s).
const TARGET_PULL = 3.5
const FOLLOW_WEIGHT_EDGE = 0.5

const frameDelta = uniform(0)
const positions = instancedArray(FIREFLY_COUNT, 'vec3')

// Seed every firefly on a disc around the player.
const initCompute = Fn(() => {
  const p = positions.element(instanceIndex)
  const offset = vec2(hash(instanceIndex), hash(instanceIndex.add(1))).mul(2).sub(1).mul(SPAWN_RADIUS)
  const ground = terrainHeightNode(playerPosition.xz.add(offset))
  const height = hash(instanceIndex.add(2)).mul(MAX_HEIGHT - MIN_HEIGHT).add(MIN_HEIGHT)
  p.assign(vec3(playerPosition.x.add(offset.x), ground.add(height), playerPosition.z.add(offset.y)))
})().compute(FIREFLY_COUNT)

// Drift on a noise field, wrap around the player, stay in a band above the ground.
const updateCompute = Fn(() => {
  const p = positions.element(instanceIndex)
  const drift = mx_noise_vec3(p.mul(NOISE_SCALE).add(time.mul(NOISE_TIME_SCALE)))
  p.addAssign(drift.mul(DRIFT_SPEED).mul(frameDelta))
  const span = float(SPAWN_RADIUS * 2)
  const relative = vec2(
    mod(p.x.sub(playerPosition.x).add(SPAWN_RADIUS), span).sub(SPAWN_RADIUS),
    mod(p.z.sub(playerPosition.z).add(SPAWN_RADIUS), span).sub(SPAWN_RADIUS),
  )
  const xz = playerPosition.xz.add(relative)
  const ground = terrainHeightNode(xz)
  const banded = vec3(xz.x, clamp(p.y, ground.add(MIN_HEIGHT), ground.add(MAX_HEIGHT)), xz.y)
  // Story targets: weighted fireflies fly to their target (no wrap, no band),
  // so trails can reach waypoints beyond the wrap radius.
  const target = fireflyTargets.element(instanceIndex)
  const pull = oneMinus(exp(frameDelta.mul(TARGET_PULL).negate()))
  const chasing = mix(p, target.xyz, pull)
  const settled = select(target.w.greaterThan(FOLLOW_WEIGHT_EDGE), chasing, banded)
  // Never fly through the paladin: slide out of every body capsule.
  p.assign(settled.add(capsuleVolumePushNode(settled, BODY_CLEARANCE)))
})().compute(FIREFLY_COUNT)

type Range = readonly [number, number]

/** Reads a per-firefly value out of `[low, high]` using a 0..1 hash. */
function lerpRange([low, high]: Range, t: Node<'float'>): Node<'float'> {
  return mix(float(low), float(high), t)
}

function createFireflyMaterial(): SpriteNodeMaterial {
  const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending })
  material.fog = false
  material.positionNode = positions.toAttribute()
  // Independent hashes per trait, so size does not correlate with colour.
  const sizeHash = hash(instanceIndex.add(7))
  const hueHash = hash(instanceIndex.add(8))
  const speedHash = hash(instanceIndex.add(9))
  const depthHash = hash(instanceIndex.add(10))

  material.scaleNode = float(SPRITE_SIZE).mul(lerpRange(SIZE_SCALE_RANGE, sizeHash))

  // Reduced motion holds every firefly at a steady mid glow.
  const speed = lerpRange(PULSE_SPEED_RANGE, speedHash)
  const depth = lerpRange(PULSE_DEPTH_RANGE, depthHash).mul(motionScale)
  const pulse = sin(time.mul(speed).add(hash(instanceIndex).mul(TWO_PI)))
    .mul(depth.mul(0.5))
    .add(oneMinus(depth.mul(0.5)))

  const falloff = smoothstep(0.5, 0, length(uv().sub(0.5)))
  const glow = pow(falloff, CORE_POWER).mul(CORE_GAIN).add(falloff.mul(HALO_GAIN))
  const tint = mix(color(GLOW_COOL), color(GLOW_WARM), hueHash)
  material.colorNode = vec4(tint.mul(GLOW_INTENSITY).mul(pulse).mul(glow), glow)
  return material
}

export function Fireflies() {
  const gl = useThree((state) => state.gl)
  const sprite = useMemo(() => {
    const instance = new Sprite(createFireflyMaterial())
    instance.count = FIREFLY_COUNT
    instance.frustumCulled = false
    return instance
  }, [])

  useEffect(() => {
    void asWebGPURenderer(gl).computeAsync(initCompute)
  }, [gl])

  useEffect(() => () => sprite.material.dispose(), [sprite])

  useFrame((state, delta) => {
    frameDelta.value = clampFrameDelta(delta)
    asWebGPURenderer(state.gl).compute(updateCompute)
  })

  return <primitive object={sprite} />
}
