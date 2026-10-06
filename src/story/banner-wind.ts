import { abs, clamp, float, max, mix, positionLocal, pow, sin, smoothstep, step, texture, time, uv, vec2, vec3 } from 'three/tsl'
import { Color, DoubleSide, Mesh, MeshStandardMaterial, MeshStandardNodeMaterial, type Node, type Object3D, type Texture } from 'three/webgpu'
import { GRASS_DEFAULTS } from '../grass/grass-config'
import { grassUniforms } from '../grass/grass-uniforms'
import { motionScale } from '../lib/shared-uniforms'

/** Node name of the cloth mesh in standard.glb (scripts/blender/compose-standard.py). */
export const BANNER_MESH_NAME = 'banner'

// Wave shape (local units: the banner hangs along -Y and faces ±Z).
const SWAY_AMPLITUDE = 0.22
const FLUTTER_AMPLITUDE = 0.05
const WAVE_SPEED = 2.2
const WAVE_FREQUENCY = 3.1
const FLUTTER_SPEED = 6.5
const FLUTTER_FREQUENCY = 9
const CROSS_FREQUENCY = 2.4
// Pinned edge stays still; motion grows toward the free tail.
const HANG_CURVE = 1.4
// Reduced motion keeps a slow, small breath instead of freezing.
const REDUCED_MOTION_SWAY = 0.25

// The pole stands behind the cloth (local z = -BANNER_POLE_GAP, radius
// POLE_RADIUS; same values as compose-standard.py). Near it the cloth may
// not swing past the wood, or the pole shows through the banner.
const BANNER_POLE_GAP = 0.12
const POLE_RADIUS = 0.05
const POLE_CLEARANCE = 0.03
const POLE_BAND_INNER = 0.08
const POLE_BAND_OUTER = 0.18

// The order's emblem, stamped mid-cloth (banner is 1 m wide, 1.9 m long).
const BANNER_WIDTH_M = 1
const BANNER_LENGTH_M = 1.9
const EMBLEM_WIDTH_FRACTION = 0.62
const EMBLEM_CENTRE_FROM_TOP = 0.33
// Ivory, like the gilded thread on old standards (Color converts to linear).
const EMBLEM_COLOR = new Color('#efe3c2')

export type BannerUvFrame = { uMin: number; uMax: number; topV: number; bottomV: number }

// Where the cloth's uv space lies: its u extent and which v edge hangs from
// the crossbar (the exporter may flip v), so the emblem lands upright.
export function bannerUvFrame(positions: ArrayLike<number>, uvs: ArrayLike<number>): BannerUvFrame {
  let uMin = Infinity
  let uMax = -Infinity
  let vMin = Infinity
  let vMax = -Infinity
  let topY = -Infinity
  let topV = 0
  const count = Math.min(positions.length / 3, uvs.length / 2)
  for (let i = 0; i < count; i++) {
    const u = uvs[i * 2]
    const v = uvs[i * 2 + 1]
    uMin = Math.min(uMin, u)
    uMax = Math.max(uMax, u)
    vMin = Math.min(vMin, v)
    vMax = Math.max(vMax, v)
    const y = positions[i * 3 + 1]
    if (y > topY) {
      topY = y
      topV = v
    }
  }
  const bottomV = Math.abs(topV - vMin) < Math.abs(topV - vMax) ? vMax : vMin
  return { uMin, uMax, topV, bottomV }
}

function bannerWindPosition(top: number, length: number) {
  const hang = clamp(float(top).sub(positionLocal.y).div(length), 0, 1)
  const reach = pow(hang, HANG_CURVE)
  // Same wind as the grass: stronger gusts wave the banner harder.
  const strength = grassUniforms.windStrength.div(GRASS_DEFAULTS.windStrength)
  const motion = float(REDUCED_MOTION_SWAY).add(float(1 - REDUCED_MOTION_SWAY).mul(motionScale))
  const wave = sin(time.mul(WAVE_SPEED).sub(positionLocal.y.mul(WAVE_FREQUENCY)).add(positionLocal.x.mul(CROSS_FREQUENCY)))
  const flutter = sin(time.mul(FLUTTER_SPEED).sub(positionLocal.y.mul(FLUTTER_FREQUENCY)).add(positionLocal.x.mul(FLUTTER_FREQUENCY)))
  const sway = wave.mul(SWAY_AMPLITUDE).add(flutter.mul(FLUTTER_AMPLITUDE)).mul(reach).mul(strength).mul(motion)
  const waved = positionLocal.add(vec3(sway.mul(0.3), sway.abs().mul(0.15), sway))
  const nearPole = float(1).sub(smoothstep(POLE_BAND_INNER, POLE_BAND_OUTER, abs(waved.x)))
  const clearZ = max(waved.z, float(-BANNER_POLE_GAP + POLE_RADIUS + POLE_CLEARANCE))
  return vec3(waved.x, waved.y, mix(waved.z, clearZ, nearPole))
}

// Stamps the emblem texture (white on transparent) centred on the cloth.
function emblemCloth(cloth: Node<'vec3'>, emblem: Texture, frame: BannerUvFrame) {
  const widthV = (EMBLEM_WIDTH_FRACTION * BANNER_WIDTH_M) / BANNER_LENGTH_M
  const uSpan = frame.uMax - frame.uMin
  const vSpan = frame.bottomV - frame.topV
  const across = uv().x.sub(frame.uMin).div(uSpan).sub(0.5).div(EMBLEM_WIDTH_FRACTION).add(0.5)
  const down = uv().y.sub(frame.topV).div(vSpan).sub(EMBLEM_CENTRE_FROM_TOP).div(widthV).add(0.5)
  const inside = step(0, across).mul(step(across, 1)).mul(step(0, down)).mul(step(down, 1))
  const mask = texture(emblem, vec2(across, float(1).sub(down))).a.mul(inside)
  return mix(cloth, vec3(EMBLEM_COLOR.r, EMBLEM_COLOR.g, EMBLEM_COLOR.b), mask)
}

function toWindMaterial(source: MeshStandardMaterial, top: number, length: number): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ side: DoubleSide })
  material.color.copy(source.color)
  material.map = source.map
  material.normalMap = source.normalMap
  material.roughnessMap = source.roughnessMap
  material.roughness = source.roughness
  material.metalness = source.metalness
  material.positionNode = bannerWindPosition(top, length)
  return material
}

// Makes the standard's cloth wave in the scene wind and, given the order's
// emblem, stamps it mid-cloth. Returns false when the model has no banner.
export function applyBannerWind(root: Object3D, emblem?: Texture): boolean {
  const banner = root.getObjectByName(BANNER_MESH_NAME)
  if (!(banner instanceof Mesh) || !(banner.material instanceof MeshStandardMaterial)) return false
  banner.geometry.computeBoundingBox()
  const box = banner.geometry.boundingBox
  if (!box) return false
  const length = Math.max(box.max.y - box.min.y, Number.EPSILON)
  const source = banner.material
  const material = toWindMaterial(source, box.max.y, length)
  const uvAttribute = banner.geometry.getAttribute('uv')
  if (emblem && uvAttribute) {
    const frame = bannerUvFrame(banner.geometry.getAttribute('position').array, uvAttribute.array)
    const tint = vec3(source.color.r, source.color.g, source.color.b)
    const linen = source.map ? texture(source.map).rgb.mul(tint) : tint
    material.colorNode = emblemCloth(linen, emblem, frame)
  }
  banner.material = material
  source.dispose()
  return true
}
