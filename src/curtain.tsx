import { useProgress } from '@react-three/drei'
import { useEffect, useState } from 'react'

const HOLD_AT_FULL_MS = 200
const FADE_OUT_MS = 600

// Solid black overlay that hides the scene until every loader registered
// with THREE.DefaultLoadingManager (cloud texture, paladin FBX, animation
// FBXs) has finished. Then it fades out and unmounts.
export function Curtain() {
  const { active, progress, total } = useProgress()
  const [leaving, setLeaving] = useState(false)
  const [unmounted, setUnmounted] = useState(false)

  useEffect(() => {
    if (leaving) return
    if (active || total === 0 || progress < 100) return
    const id = setTimeout(() => setLeaving(true), HOLD_AT_FULL_MS)
    return () => clearTimeout(id)
  }, [active, progress, total, leaving])

  useEffect(() => {
    if (!leaving) return
    const id = setTimeout(() => setUnmounted(true), FADE_OUT_MS)
    return () => clearTimeout(id)
  }, [leaving])

  if (unmounted) return null
  return <div className={`curtain ${leaving ? 'curtain--leaving' : ''}`} />
}
