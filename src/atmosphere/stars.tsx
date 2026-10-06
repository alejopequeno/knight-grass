import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  float,
  hash,
  instanceIndex,
  instancedBufferAttribute,
  length,
  normalize,
  sin,
  smoothstep,
  time,
  uv,
  vec3,
  vec4,
} from 'three/tsl'
import { AdditiveBlending, InstancedBufferAttribute, Sprite, SpriteNodeMaterial, type Group } from 'three/webgpu'
import { createSeededRandom } from '../lib/seeded-random'
import { motionScale } from '../lib/shared-uniforms'

const STAR_COUNT = 4000
const STAR_RADIUS = 300
const STAR_SEED = 4242
const STAR_SIZE = 0.006
const MIN_ELEVATION_Y = -0.05
const TWINKLE_SPEED = 1.7
const BRIGHTNESS = 1.6
const TWO_PI = Math.PI * 2

function buildStarPositions(): Float32Array {
  const random = createSeededRandom(STAR_SEED)
  const positions = new Float32Array(STAR_COUNT * 3)
  let written = 0
  while (written < STAR_COUNT) {
    const x = random() * 2 - 1
    const y = random() * 2 - 1
    const z = random() * 2 - 1
    const lengthSq = x * x + y * y + z * z
    if (lengthSq < 0.01 || lengthSq > 1) continue
    const scale = STAR_RADIUS / Math.sqrt(lengthSq)
    if ((y * scale) / STAR_RADIUS < MIN_ELEVATION_Y) continue
    positions.set([x * scale, y * scale, z * scale], written * 3)
    written++
  }
  return positions
}

function createStarMaterial(positions: InstancedBufferAttribute): SpriteNodeMaterial {
  const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending })
  material.fog = false
  material.sizeAttenuation = false
  const position = instancedBufferAttribute<'vec3'>(positions, 'vec3')
  material.positionNode = position
  material.scaleNode = float(STAR_SIZE).mul(hash(instanceIndex).mul(0.8).add(0.4))
  const twinkle = sin(time.mul(TWINKLE_SPEED).add(hash(instanceIndex.add(7)).mul(TWO_PI)))
    .mul(float(0.35).mul(motionScale))
    .add(0.65)
  const horizonFade = smoothstep(0, 0.25, normalize(position).y)
  const disc = smoothstep(0.5, 0.1, length(uv().sub(0.5)))
  material.colorNode = vec4(vec3(float(BRIGHTNESS).mul(twinkle).mul(horizonFade).mul(disc)), disc)
  return material
}

export function Stars() {
  const groupRef = useRef<Group>(null)
  const sprite = useMemo(() => {
    const attribute = new InstancedBufferAttribute(buildStarPositions(), 3)
    const instance = new Sprite(createStarMaterial(attribute))
    instance.count = STAR_COUNT
    instance.frustumCulled = false
    return instance
  }, [])

  useEffect(() => () => sprite.material.dispose(), [sprite])

  // Stars live at infinity: keep them centred on the camera.
  useFrame(({ camera }) => {
    groupRef.current?.position.copy(camera.position)
  })

  return (
    <group ref={groupRef}>
      <primitive object={sprite} />
    </group>
  )
}
