import { describe, expect, it } from 'vitest'
import { HUD_IDLE_RESTORE_MS, shouldShowHud } from './hud-visibility'

describe('shouldShowHud', () => {
  it('stays up until the player has touched the controls', () => {
    expect(shouldShowHud(false, 0)).toBe(true)
    expect(shouldShowHud(false, HUD_IDLE_RESTORE_MS * 10)).toBe(true)
  })

  it('gets out of the way while they are playing', () => {
    expect(shouldShowHud(true, 0)).toBe(false)
    expect(shouldShowHud(true, HUD_IDLE_RESTORE_MS - 1)).toBe(false)
  })

  it('comes back once they have been idle long enough', () => {
    expect(shouldShowHud(true, HUD_IDLE_RESTORE_MS)).toBe(true)
    expect(shouldShowHud(true, HUD_IDLE_RESTORE_MS * 2)).toBe(true)
  })
})
