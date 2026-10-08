import {
  abs,
  attribute,
  cameraPosition,
  cos,
  cross,
  dot,
  float,
  Fn,
  fract,
  frontFacing,
  instanceIndex,
  inverseSqrt,
  length,
  max,
  min,
  mix,
  normalize,
  oneMinus,
  positionWorld,
  pow,
  select,
  sign,
  sin,
  smoothstep,
  sqrt,
  step,
  varying,
  vec3,
  vec4,
} from 'three/tsl'
import { atmosphere } from '../atmosphere/atmosphere'
import { DoubleSide, MeshBasicNodeMaterial } from 'three/webgpu'
import { capsuleShadowNode } from '../lib/character-capsules'
import { playerPosition } from '../lib/shared-uniforms'
import { terrainHeightNode } from '../lib/terrain'
import { grassAlbedoNode } from './grass-color'
import { FAR_START_DENSITY } from './grass-layout'
import { farDensityNode, subsetWidthScaleNode } from './grass-nodes'
import type { RingState } from './grass-state'
import { grassUniforms } from './grass-uniforms'

const EDGE_WIDEN_START = 0.6
const ROUND_ANGLE = Math.PI / 6 // ±30°
const TAPER_POWER = 0.7
const MAX_BEND_FRACTION = 0.9
const NORMAL_FLATTEN_START = 6
const NORMAL_FLATTEN_END = 35
const NORMAL_FLATTEN_AMOUNT = 0.6
const MIN_LENGTH = 1e-4
const AO_FADE_START = 5
const AO_FADE_END = 40
const TRANSLUCENCY_POWER = 4
const SPEC_EPSILON = 1e-4
const MIN_COMPENSATED_DENSITY = 0.25
// How much light the body can take away. Deep grass under a figure is dark,
// but never black: driving this near 1 cuts a hole in the field.
const SHADOW_STRENGTH = 0.55
const SHADOW_AMBIENT_SHARE = 0.4
const UP = vec3(0, 1, 0)

// Builds one blade from its compute state: a quadratic Bezier from the root
// toward a bent tip, tapered, widened when seen edge-on, with rounded normals.
export function bladeVaryings(state: RingState) {
  const u = grassUniforms
  const a = state.bladeA.element(instanceIndex)
  const b = state.bladeB.element(instanceIndex)
  const t = attribute<'float'>('bladeT', 'float')
  const side = attribute<'float'>('bladeSide', 'float')

  const root = vec3(a.x, terrainHeightNode(a.xy), a.y)
  const height = a.z
  const widthDir = vec3(cos(a.w), 0, sin(a.w))

  // Root → control → tip; the bend moves the tip while the blade keeps
  // (roughly) its length, so it bends instead of stretching.
  const bend = vec3(b.x, 0, b.y)
  const bendLength = min(length(bend), height.mul(MAX_BEND_FRACTION))
  const bendDir = bend.div(max(length(bend), MIN_LENGTH))
  const tipHeight = sqrt(max(height.mul(height).sub(bendLength.mul(bendLength)), 0))
  const control = root.add(vec3(0, tipHeight, 0))
  const tip = control.add(bendDir.mul(bendLength))
  const s = oneMinus(t)
  const point = root.mul(s.mul(s)).add(control.mul(s.mul(t).mul(2))).add(tip.mul(t.mul(t)))
  const tangent = normalize(
    control.sub(root).mul(s.mul(2)).add(tip.sub(control).mul(t.mul(2))).add(UP.mul(MIN_LENGTH)),
  )
  const bladeNormal = normalize(cross(widthDir, tangent))

  // Edge-on blades turn their width axis toward the screen (view-space
  // widening, as in Ghost of Tsushima) so they never collapse to 1-px lines.
  const toCamera = normalize(cameraPosition.sub(root))
  const edgeOn = oneMinus(abs(dot(bladeNormal, toCamera)))
  const screenAxis = normalize(cross(tangent, toCamera).add(widthDir.mul(MIN_LENGTH)))
  const alignedScreenAxis = screenAxis.mul(sign(dot(screenAxis, widthDir)).add(MIN_LENGTH))
  const widthAxis = normalize(mix(widthDir, alignedScreenAxis, smoothstep(EDGE_WIDEN_START, 1, edgeOn)))
  // Shared blades widen continuously as their near-only neighbours thin
  // out; far blades also compensate for distance thinning. Width is a pure
  // function of distance, so it never jumps at the near → far hand-off.
  const fromPlayer = root.xz.sub(playerPosition.xz)
  const ringDistance = max(abs(fromPlayer.x), abs(fromPlayer.y))
  const shared = step(1, b.z)
  const sharedWidth = mix(float(1), subsetWidthScaleNode(ringDistance), shared)
  const thinningCompensation =
    state.ring.name === 'far'
      ? inverseSqrt(max(farDensityNode(ringDistance).div(FAR_START_DENSITY), MIN_COMPENSATED_DENSITY))
      : float(1)
  const width = u.bladeWidth.mul(sharedWidth).mul(thinningCompensation).mul(pow(s, TAPER_POWER))
  const position = point.add(widthAxis.mul(side.mul(width).mul(0.5)))

  // Rounded normal: tilt ±30° across the blade; flatten toward up with
  // distance so the far field shades like a soft surface.
  const rounded = normalize(
    bladeNormal.mul(Math.cos(ROUND_ANGLE)).add(widthDir.mul(side.mul(Math.sin(ROUND_ANGLE)))),
  )
  const distance = length(cameraPosition.sub(root))
  const flatten = smoothstep(NORMAL_FLATTEN_START, NORMAL_FLATTEN_END, distance).mul(NORMAL_FLATTEN_AMOUNT)
  const normal = normalize(mix(rounded, UP, flatten))

  // bladeB.z packs clump tint (fraction) + shared flag (integer part).
  return { position, normal, t, seed: b.w, tint: fract(b.z), distance }
}

export function createGrassMaterial(state: RingState): MeshBasicNodeMaterial {
  const u = grassUniforms
  const blade = bladeVaryings(state)
  const material = new MeshBasicNodeMaterial({ side: DoubleSide })
  material.positionNode = blade.position
  const vNormal = varying(blade.normal)
  const vT = varying(blade.t)
  const vSeed = varying(blade.seed)
  const vTint = varying(blade.tint)
  const vDistance = varying(blade.distance)

  material.colorNode = Fn(() => {
    const albedo = grassAlbedoNode(positionWorld.xz, vT, vSeed, vTint)
    const n = normalize(select(frontFacing, vNormal, vNormal.negate()))
    const v = normalize(cameraPosition.sub(positionWorld))
    const sunL = normalize(atmosphere.sunDirection)
    const moonL = normalize(atmosphere.moonDirection)

    const wrapSun = dot(n, sunL).mul(0.5).add(0.5)
    const wrapMoon = dot(n, moonL).mul(0.5).add(0.5)
    const direct = atmosphere.sunColor
      .mul(atmosphere.sunIntensity.mul(wrapSun))
      .add(atmosphere.moonColor.mul(atmosphere.moonIntensity.mul(wrapMoon)))
      .mul(u.diffuseStrength)
    const ambient = mix(u.groundAmbient, u.skyAmbient, n.y.mul(0.5).add(0.5)).mul(u.ambientStrength)

    const aoMin = mix(u.aoNear, u.aoFar, smoothstep(AO_FADE_START, AO_FADE_END, vDistance))
    const ao = mix(aoMin, float(1), vT)

    // The body closes the field in around itself: blades at his feet lose
    // most of their light, and it opens back up within about a metre. That
    // short dark well is what plants him in the grass.
    const shadow = capsuleShadowNode(positionWorld, sunL)
    const lit = oneMinus(shadow.mul(SHADOW_STRENGTH))
    const shadowedAmbient = oneMinus(shadow.mul(SHADOW_AMBIENT_SHARE))

    // Backlit translucency: tips glow when looking toward the sun.
    const backlight = pow(max(dot(v.negate(), sunL), 0), TRANSLUCENCY_POWER)
    const translucency = albedo.mul(atmosphere.sunColor).mul(backlight).mul(vT.mul(vT)).mul(u.translucency)

    // Soft anisotropic spec along the blade (tangent ≈ up).
    const halfVector = normalize(sunL.add(v))
    const sinHT = sqrt(max(oneMinus(halfVector.y.mul(halfVector.y)), SPEC_EPSILON))
    const spec = atmosphere.sunColor.mul(pow(sinHT, u.specShininess)).mul(u.specStrength).mul(vT)

    const shaded = direct.mul(lit).add(ambient.mul(shadowedAmbient))
    return vec4(albedo.mul(shaded).mul(ao).add(translucency.mul(lit)).add(spec.mul(lit)), 1)
  })()
  return material
}
