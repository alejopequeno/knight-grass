import { Data3DTexture, LinearFilter, RGBAFormat, UnsignedByteType } from 'three/webgpu'

export const LUT_SIZE = 32
const CHANNELS = 4
const MAX_BYTE = 255
const SHADOW_TINT = [-0.04, 0.0, 0.06] as const
const HIGHLIGHT_TINT = [0.06, 0.02, -0.04] as const
const LUMA = [0.2126, 0.7152, 0.0722] as const

type Rgb = readonly [number, number, number]

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

// Split toning: cool shadows, warm highlights, mid-grey untouched.
function grade(rgb: Rgb): Rgb {
  const luma = rgb[0] * LUMA[0] + rgb[1] * LUMA[1] + rgb[2] * LUMA[2]
  const shadowWeight = 1 - smoothstep(0, 0.5, luma)
  const highlightWeight = smoothstep(0.5, 1, luma)
  const channel = (c: 0 | 1 | 2) =>
    clamp01(rgb[c] + SHADOW_TINT[c] * shadowWeight + HIGHLIGHT_TINT[c] * highlightWeight)
  return [channel(0), channel(1), channel(2)]
}

export function createBlueHourLutData(size: number): Uint8Array {
  const data = new Uint8Array(size ** 3 * CHANNELS)
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const graded = grade([r / (size - 1), g / (size - 1), b / (size - 1)])
        const index = ((b * size + g) * size + r) * CHANNELS
        data[index] = Math.round(graded[0] * MAX_BYTE)
        data[index + 1] = Math.round(graded[1] * MAX_BYTE)
        data[index + 2] = Math.round(graded[2] * MAX_BYTE)
        data[index + 3] = MAX_BYTE
      }
    }
  }
  return data
}

export function createBlueHourLut(): Data3DTexture {
  const texture = new Data3DTexture(createBlueHourLutData(LUT_SIZE), LUT_SIZE, LUT_SIZE, LUT_SIZE)
  texture.format = RGBAFormat
  texture.type = UnsignedByteType
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.unpackAlignment = 1
  texture.needsUpdate = true
  return texture
}
