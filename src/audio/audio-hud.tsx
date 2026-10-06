import { useMuted, useSuno, useSunoState } from '@joycostudio/suno/react'
import { useRef } from 'react'

export function AudioHud({ inert = false }: { inert?: boolean }) {
  const suno = useSuno()
  const { muted, toggleMuted } = useMuted()
  const state = useSunoState()
  // Whether audio was still locked when this press began. The same gesture
  // unlocks it (suno listens on document, after React's root listeners), so
  // by click time it already reads unlocked; without this, "enable" would
  // unlock and mute in one press.
  const lockedAtPressRef = useRef<boolean | null>(null)

  const notePress = () => {
    lockedAtPressRef.current = suno.isLocked
  }

  const handleClick = () => {
    const wasLocked = lockedAtPressRef.current ?? suno.isLocked
    lockedAtPressRef.current = null
    if (!wasLocked) toggleMuted()
  }

  const stateLabel = !state.isUnlocked ? 'enable' : muted ? 'off' : 'on'

  // The name stays "Sound"; aria-pressed carries on/off, so the visible
  // state word is hidden from assistive tech instead of read twice.
  return (
    <button
      type="button"
      className="audio-hud"
      onPointerDown={notePress}
      onKeyDown={notePress}
      onClick={handleClick}
      aria-pressed={state.isUnlocked && !muted}
      inert={inert}
    >
      Sound
      <span className="audio-hud__state" aria-hidden="true">
        {stateLabel}
      </span>
    </button>
  )
}
