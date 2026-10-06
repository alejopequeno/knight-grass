import { dot, fract, sin, vec2 } from 'three/tsl'
import type { Node } from 'three/webgpu'

const HASH_DOT = vec2(127.1, 311.7)
const HASH_SCALE = 43758.5453
const HASH22_OFFSET = vec2(19.19, 7.31)

// Classic sin-fract hash; inputs are integer cell coordinates (small), so
// float precision is fine.
export function hash21(p: Node<'vec2'>): Node<'float'> {
  return fract(sin(dot(p, HASH_DOT)).mul(HASH_SCALE))
}

export function hash22(p: Node<'vec2'>): Node<'vec2'> {
  return vec2(hash21(p), hash21(p.add(HASH22_OFFSET)))
}
