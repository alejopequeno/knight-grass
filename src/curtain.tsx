import { useProgress } from '@react-three/drei'
import { useEffect, useState } from 'react'
import { setSceneRevealed, useCharacterStatus } from './lib/load-state'
import { prefersReducedMotion } from './lib/reduced-motion'

const HOLD_AT_FULL_MS = 200
const FADE_OUT_MS = 600

// Solid black overlay that hides the scene until (a) every loader registered
// with THREE.DefaultLoadingManager has finished and (b) the character has
// explicitly reported ready. (b) closes the gap where the paladin's FBX loads
// only start after the Suspense boundary resolves, which used to let the
// curtain lift on an empty field.
export function Curtain() {
  const { active } = useProgress()
  const characterStatus = useCharacterStatus()
  const [leaving, setLeaving] = useState(false)
  const [unmounted, setUnmounted] = useState(false)

  const ready = characterStatus === 'ready' && !active

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
    <div
      className={`curtain ${leaving ? 'curtain--leaving' : ''}`}
      role="status"
      aria-label={leaving ? undefined : 'Loading scene'}
    />
  )
}
