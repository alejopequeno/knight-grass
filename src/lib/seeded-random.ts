export type RandomSource = () => number

const UINT32_RANGE = 4294967296
const MULBERRY_INCREMENT = 0x6d2b79f5

// mulberry32: tiny, fast, good enough for procedural placement. Same seed →
// same sequence, so generated content is identical across reloads and
// renderers (needed for WebGL vs WebGPU parity screenshots).
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0
  return () => {
    state = (state + MULBERRY_INCREMENT) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE
  }
}
