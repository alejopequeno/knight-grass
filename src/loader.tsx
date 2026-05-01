import { useProgress } from '@react-three/drei'
import { useEffect, useState } from 'react'

// How long to hold at 100% before fading out — gives the eye a moment to
// register that loading is done so the transition doesn't feel abrupt.
const HOLD_AT_FULL_MS = 400
// CSS opacity transition duration — must match `.loader` in index.css.
const FADE_OUT_MS = 600

export function Loader() {
  const { active, progress, total } = useProgress()
  const [leaving, setLeaving] = useState(false)
  const [unmounted, setUnmounted] = useState(false)

  // Trigger the fade once the loading queue drains. We require total > 0 so
  // we don't fire on the initial idle state before any loader starts.
  useEffect(() => {
    if (leaving) return
    if (active || total === 0 || progress < 100) return
    const id = setTimeout(() => setLeaving(true), HOLD_AT_FULL_MS)
    return () => clearTimeout(id)
  }, [active, progress, total, leaving])

  // Fully remove from the tree after the fade completes so the overlay
  // doesn't sit there eating clicks.
  useEffect(() => {
    if (!leaving) return
    const id = setTimeout(() => setUnmounted(true), FADE_OUT_MS)
    return () => clearTimeout(id)
  }, [leaving])

  if (unmounted) return null

  return (
    <div className={`loader ${leaving ? 'loader--leaving' : ''}`}>
      <div className="loader__content">
        <div className="loader__eyebrow">A walk through the grass</div>
        <div className="loader__title">Knight Grass</div>
        <div className="loader__bar">
          <div
            className="loader__bar-fill"
            style={{ width: `${Math.round(progress)}%` }}
          />
        </div>
        <div className="loader__percent">{Math.round(progress)}%</div>
      </div>
    </div>
  )
}
