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
import { AdditiveBlending, Sprite, SpriteNodeMaterial } from 'three/webgpu'
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
const GLOW_COLOR = '#d8f27a'
const GLOW_INTENSITY = 6
const PULSE_SPEED = 2.4
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

function createFireflyMaterial(): SpriteNodeMaterial {
  const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending })
  material.fog = false
  material.positionNode = positions.toAttribute()
  material.scaleNode = float(SPRITE_SIZE)
  // Reduced motion holds every firefly at a steady mid glow.
  const pulse = sin(time.mul(PULSE_SPEED).add(hash(instanceIndex).mul(TWO_PI)))
    .mul(float(0.5).mul(motionScale))
    .add(0.5)
  const glow = smoothstep(0.5, 0, length(uv().sub(0.5)))
  material.colorNode = vec4(color(GLOW_COLOR).mul(GLOW_INTENSITY).mul(pulse).mul(glow), glow)
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
