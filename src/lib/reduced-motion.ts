import { useSyncExternalStore } from 'react'

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function reducedMotionQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION_QUERY) : null
}

export function prefersReducedMotion(): boolean {
  return reducedMotionQuery()?.matches ?? false
}

function subscribe(onChange: () => void): () => void {
  const query = reducedMotionQuery()
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}

// Live preference: updates when the user toggles the OS setting mid-session.
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion)
}

// Multiplier for ambient animation amplitude (star twinkle, firefly pulse).
export function motionScaleFor(reducedMotion: boolean): number {
  return reducedMotion ? 0 : 1
}
