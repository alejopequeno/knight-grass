import { instancedArray } from 'three/tsl'
import type { StorageBufferNode } from 'three/webgpu'
import type { GrassRingConfig } from './grass-config'
import { ringBladeCount } from './grass-layout'

export type StorageBuffer = StorageBufferNode<'vec4'>

export type RingState = {
  ring: GrassRingConfig
  count: number
  /** (worldX, worldZ, height, yaw) */
  bladeA: StorageBuffer
  /** (bendX, bendZ, clumpTint, seed) */
  bladeB: StorageBuffer
}

export function createRingState(ring: GrassRingConfig): RingState {
  const count = ringBladeCount(ring)
  return { ring, count, bladeA: instancedArray(count, 'vec4'), bladeB: instancedArray(count, 'vec4') }
}
