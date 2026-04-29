import { useMuted, useSunoState } from '@joycostudio/suno/react'

export function AudioHud() {
  const { muted, toggleMuted } = useMuted()
  const state = useSunoState()

  const label = !state.isUnlocked ? 'sound: tap' : muted ? 'sound: off' : 'sound: on'

  return (
    <button
      type="button"
      className="audio-hud"
      onClick={() => toggleMuted()}
      aria-pressed={!muted}
    >
      {label}
    </button>
  )
}
