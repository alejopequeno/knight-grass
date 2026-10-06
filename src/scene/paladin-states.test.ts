import { describe, expect, it } from 'vitest'
import { PALADIN_STATES } from './paladin-animator'
import { mapPaladinStates } from './paladin-states'

describe('mapPaladinStates', () => {
  it('builds a value for every paladin state', () => {
    const record = mapPaladinStates((state) => `clip:${state}`)
    expect(Object.keys(record).sort()).toEqual([...PALADIN_STATES].sort())
    for (const state of PALADIN_STATES) expect(record[state]).toBe(`clip:${state}`)
  })
})
