import { describe, expect, it } from 'vitest'
import { createBlueHourLutData } from './blue-hour-lut'

const SIZE = 17
const CHANNELS = 4

function texel(data: Uint8Array, r: number, g: number, b: number): number[] {
  const index = ((b * SIZE + g) * SIZE + r) * CHANNELS
  return Array.from(data.slice(index, index + CHANNELS))
}

describe('createBlueHourLutData', () => {
  it('has size³ RGBA texels', () => {
    expect(createBlueHourLutData(SIZE)).toHaveLength(SIZE ** 3 * CHANNELS)
  })

  it('leaves mid-grey unchanged (neutral point)', () => {
    const mid = (SIZE - 1) / 2
    const [r, g, b] = texel(createBlueHourLutData(SIZE), mid, mid, mid)
    for (const channel of [r, g, b]) expect(Math.abs(channel - 128)).toBeLessThanOrEqual(2)
  })

  it('cools the shadows (blue > red near black)', () => {
    const [r, , b] = texel(createBlueHourLutData(SIZE), 2, 2, 2)
    expect(b).toBeGreaterThan(r)
  })

  it('warms the highlights (red > blue near white)', () => {
    const [r, , b] = texel(createBlueHourLutData(SIZE), SIZE - 3, SIZE - 3, SIZE - 3)
    expect(r).toBeGreaterThan(b)
  })

  it('writes opaque alpha', () => {
    expect(texel(createBlueHourLutData(SIZE), 0, 0, 0)[3]).toBe(255)
  })
})
