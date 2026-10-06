import { Suno } from '@joycostudio/suno'
import {
  SunoProvider,
  useAutoUnlock,
  useSource,
  useSuno,
  useSunoState,
} from '@joycostudio/suno/react'
import { useEffect, useState, type ReactNode } from 'react'
import { AUDIO_KEYS, AUDIO_MANIFEST } from './audio-manifest'

export function AudioController({ children }: { children: ReactNode }) {
  const [suno] = useState(
    () =>
      new Suno({
        manifest: AUDIO_MANIFEST,
        muted: false,
      }),
  )

  // Single lifecycle effect: kick off the load on mount, dispose on unmount.
  // `cancelled` guards the async catch so a teardown mid-load doesn't log a
  // misleading warning.
  useEffect(() => {
    let cancelled = false
    suno.loadAll().catch((error: unknown) => {
      if (!cancelled) console.warn('[audio] loadAll failed', error)
    })
    return () => {
      cancelled = true
      void suno.dispose()
    }
  }, [suno])

  return <SunoProvider value={suno}>{children}</SunoProvider>
}

// Unlock on the first gesture, then start the ambient wind as soon as the
// context is running and the source has loaded — event-driven, no polling.
export function AudioBoot() {
  const suno = useSuno()
  useAutoUnlock(suno)
  const { isUnlocked } = useSunoState(suno)
  const wind = useSource(AUDIO_KEYS.wind, suno)

  useEffect(() => {
    if (!isUnlocked || !wind || wind.isPlaying) return
    wind.source.play()
  }, [isUnlocked, wind])

  return null
}
