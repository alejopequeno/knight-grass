import { useProgress } from '@react-three/drei'
import { useEffect, useState } from 'react'
import { setSceneRevealed, useCharacterStatus } from './lib/load-state'
import { prefersReducedMotion } from './lib/reduced-motion'
import { usePreloadComplete, usePreloadPercent } from './loading/preload-progress'

const HOLD_AT_FULL_MS = 200
const FADE_OUT_MS = 600
const FULL_PERCENT = 100
// Downloads can finish before the paladin is built; the bar waits one short
// of full so it never claims "done" over a scene that is still assembling.
const LAST_UNREADY_PERCENT = 99

// Black overlay that hides the scene until (a) the Susano preload batch has
// settled, (b) every loader registered with THREE.DefaultLoadingManager has
// finished and (c) the character has explicitly reported ready. While it
// waits it shows how much of the scene has arrived.
export function Curtain() {
  const { active } = useProgress()
  const characterStatus = useCharacterStatus()
  const preloadComplete = usePreloadComplete()
  const preloadPercent = usePreloadPercent()
  const [leaving, setLeaving] = useState(false)
  const [unmounted, setUnmounted] = useState(false)

  const ready = preloadComplete && characterStatus === 'ready' && !active
  const percent = ready ? FULL_PERCENT : Math.min(preloadPercent, LAST_UNREADY_PERCENT)

  useEffect(() => {
    if (leaving || !ready) return
    const id = setTimeout(() => setLeaving(true), HOLD_AT_FULL_MS)
    return () => clearTimeout(id)
  }, [ready, leaving])

  useEffect(() => {
    if (!leaving) return
    setSceneRevealed()
    const fadeMs = prefersReducedMotion() ? 0 : FADE_OUT_MS
    const id = setTimeout(() => setUnmounted(true), fadeMs)
    return () => clearTimeout(id)
  }, [leaving])

  if (unmounted) return null

  if (characterStatus === 'failed') {
    return (
      <div className="curtain curtain--error" role="alert">
        <p>The scene failed to load. Check your connection and reload the page.</p>
      </div>
    )
  }

  return (
    <div className={`curtain ${leaving ? 'curtain--leaving' : ''}`}>
      <div
        className="curtain__loader"
        role="progressbar"
        aria-label="Loading scene"
        aria-valuemin={0}
        aria-valuemax={FULL_PERCENT}
        aria-valuenow={percent}
        aria-hidden={leaving || undefined}
      >
        <div className="curtain__track">
          <div className="curtain__fill" style={{ transform: `scaleX(${percent / FULL_PERCENT})` }} />
        </div>
        <div className="curtain__caption" aria-hidden="true">
          <span>Loading</span>
          <span className="curtain__percent">{percent}%</span>
        </div>
      </div>
    </div>
  )
}
