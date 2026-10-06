import { float, mix, mx_noise_float, pow, smoothstep, vec3 } from 'three/tsl'
import type { Node } from 'three/webgpu'
import { grassUniforms } from './grass-uniforms'

const ZONE_SCALE = 0.02
const ZONE_LOW = 0.35
const ZONE_HIGH = 0.65
const ZONE_WEIGHT = 0.6
const GRADIENT_POWER = 1.5
const BRIGHTNESS_RANGE = 0.3 // ±15 %
const CLUMP_TINT_COOL = vec3(0.93, 1, 0.92)
const CLUMP_TINT_WARM = vec3(1.06, 1, 0.94)
const GROUND_SAMPLE_T = 0.55
const GROUND_DARKEN = 0.7

// Field colour at `xz` for a point `t` along a blade (0 root → 1 tip).
export function grassAlbedoNode(
  xz: Node<'vec2'>,
  t: Node<'float'>,
  seed: Node<'float'>,
  tint: Node<'float'>,
): Node<'vec3'> {
  const u = grassUniforms
  const zone = mx_noise_float(vec3(xz.mul(ZONE_SCALE), 0)).mul(0.5).add(0.5)
  const zoneTip = mix(u.lushColor, u.dryColor, smoothstep(ZONE_LOW, ZONE_HIGH, zone))
  const tip = mix(u.tipColor, zoneTip, ZONE_WEIGHT)
  const gradient = mix(u.baseColor, tip, pow(t, GRADIENT_POWER))
  const brightness = seed.sub(0.5).mul(BRIGHTNESS_RANGE).add(1)
  return gradient.mul(brightness).mul(mix(CLUMP_TINT_COOL, CLUMP_TINT_WARM, tint))
}

// Ground under/after the grass: the field's mean colour, darkened like distant AO.
export function groundAlbedoNode(xz: Node<'vec2'>): Node<'vec3'> {
  return grassAlbedoNode(xz, float(GROUND_SAMPLE_T), float(0.5), float(0.5)).mul(GROUND_DARKEN)
}
