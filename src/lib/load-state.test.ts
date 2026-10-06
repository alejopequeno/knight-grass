import { describe, expect, it } from 'vitest'
import { isSceneRevealed, setSceneRevealed } from './load-state'

describe('scene reveal', () => {
  it('starts hidden and flips once the curtain lifts', () => {
    expect(isSceneRevealed()).toBe(false)
    setSceneRevealed()
    expect(isSceneRevealed()).toBe(true)
  })
})
