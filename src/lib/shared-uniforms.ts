import { uniform } from 'three/tsl'
import { Vector3 } from 'three/webgpu'

// Character world position, written once per frame by <PlayerUniformSync>.
// Grass (wrap + trample) and fireflies (wrap) read it on the GPU.
export const playerPosition = uniform(new Vector3())

// 1 = full ambient motion, 0 = reduced motion (no twinkle / pulse).
export const motionScale = uniform(1)
