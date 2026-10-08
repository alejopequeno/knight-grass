import { useEffect, useState } from 'react'

/** Idle time after which the control list comes back on screen. */
export const HUD_IDLE_RESTORE_MS = 6000
const POLL_MS = 500
const INPUT_EVENTS = ['keydown', 'pointerdown', 'pointermove', 'wheel'] as const

/**
 * The control list is a reference, not decoration: it stays up until the
 * player has actually used it, gets out of the way while they play, and
 * returns once they go idle long enough to have lost the thread.
 */
export function shouldShowHud(hasPlayed: boolean, msSinceInput: number): boolean {
  if (!hasPlayed) return true
  return msSinceInput >= HUD_IDLE_RESTORE_MS
}

export function useHudVisible(): boolean {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    let hasPlayed = false
    let lastInput = performance.now()

    const refresh = () => setVisible(shouldShowHud(hasPlayed, performance.now() - lastInput))
    const handleInput = () => {
      hasPlayed = true
      lastInput = performance.now()
      refresh()
    }

    for (const event of INPUT_EVENTS) window.addEventListener(event, handleInput, { passive: true })
    const poll = window.setInterval(refresh, POLL_MS)
    return () => {
      for (const event of INPUT_EVENTS) window.removeEventListener(event, handleInput)
      window.clearInterval(poll)
    }
  }, [])

  return visible
}
