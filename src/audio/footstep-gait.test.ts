import { describe, expect, it } from 'vitest'
import { RUN_SPEED, WALK_SPEED } from '../lib/movement'
import { footstepGait } from './footstep-gait'

describe('footstepGait', () => {
  it('is still when barely moving', () => {
    expect(footstepGait(0.1)).toBe('still')
  })

  it('walks at walking speed', () => {
    expect(footstepGait(WALK_SPEED)).toBe('walk')
  })

  it('runs at running speed (including slight lerp lag)', () => {
    expect(footstepGait(RUN_SPEED)).toBe('run')
    expect(footstepGait(RUN_SPEED * 0.9)).toBe('run')
  })
})
