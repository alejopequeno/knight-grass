import { float, length, min, mix, smoothstep, vec2 } from 'three/tsl'
import type { Node } from 'three/webgpu'

export type Clearing = { x: number; z: number; radius: number }

// Grass height at a clearing's centre, as a fraction of normal height.
export const CLEARING_FLOOR = 0.12
// Fraction of the radius that stays fully cut before grass grows back.
const CLEARING_CORE = 0.6

function smoothstepCpu(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

// 1 = full grass, CLEARING_FLOOR = cut short. Lowest clearing wins.
export function clearingHeightFactor(x: number, z: number, clearings: readonly Clearing[]): number {
  let factor = 1
  for (const c of clearings) {
    const grow = smoothstepCpu(c.radius * CLEARING_CORE, c.radius, Math.hypot(x - c.x, z - c.z))
    factor = Math.min(factor, CLEARING_FLOOR + (1 - CLEARING_FLOOR) * grow)
  }
  return factor
}

// TSL twin of clearingHeightFactor(); clearings are baked in as constants.
export function clearingHeightNode(world: Node<'vec2'>, clearings: readonly Clearing[]): Node<'float'> {
  let factor: Node<'float'> = float(1)
  for (const c of clearings) {
    const grow = smoothstep(c.radius * CLEARING_CORE, c.radius, length(world.sub(vec2(c.x, c.z))))
    factor = min(factor, mix(float(CLEARING_FLOOR), float(1), grow))
  }
  return factor
}
