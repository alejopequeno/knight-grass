import { describe, expect, it } from 'vitest'
import { byteProgress } from './byte-progress'

describe('byteProgress', () => {
  it('is complete when there is nothing to load', () => {
    expect(byteProgress([])).toBe(1)
  })

  it('weighs each file by its size', () => {
    const progress = byteProgress([
      { loaded: 900, total: 900, settled: false },
      { loaded: 0, total: 100, settled: false },
    ])
    expect(progress).toBeCloseTo(0.9)
  })

  it('gives a file of unknown size the average known weight', () => {
    const progress = byteProgress([
      { loaded: 100, total: 100, settled: true },
      { loaded: 0, total: 0, settled: false },
    ])
    expect(progress).toBeCloseTo(0.5)
  })

  it('counts a settled file as done even without byte events', () => {
    expect(byteProgress([{ loaded: 0, total: 0, settled: true }])).toBe(1)
  })

  it('never exceeds 1 when the server under-reports the size', () => {
    expect(byteProgress([{ loaded: 200, total: 100, settled: false }])).toBe(1)
  })
})
