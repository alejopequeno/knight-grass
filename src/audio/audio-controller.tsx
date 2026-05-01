import { Suno } from '@joycostudio/suno'
import { SunoProvider, useAutoUnlock, useSuno } from '@joycostudio/suno/react'
import { useEffect, useState, type ReactNode } from 'react'

export const AUDIO_KEYS = {
  wind: 'wind',
  steps: 'steps',
} as const

const MANIFEST = {
  [AUDIO_KEYS.wind]: { src: '/sounds/wind.mp3', loop: true, volume: 0.45 },
  [AUDIO_KEYS.steps]: { src: '/sounds/grass-steps.mp3', loop: true, volume: 0.7 },
}

export function AudioController({ children }: { children: ReactNode }) {
  const [suno] = useState(
    () =>
      new Suno({
        manifest: MANIFEST,
        muted: false,
        mutePersistKey: 'walk-grass-muted',
      }),
  )

  // Single lifecycle effect: kick off the load on mount, dispose on unmount.
  // `cancelled` guards the async catch so a teardown mid-load doesn't log a
  // misleading warning.
  useEffect(() => {
    let cancelled = false
    suno.loadAll().catch((err) => {
      if (!cancelled) console.warn('[audio] loadAll failed', err)
    })
    return () => {
      cancelled = true
      void suno.dispose()
    }
  }, [suno])

  return <SunoProvider value={suno}>{children}</SunoProvider>
}

// Auto-unlock + start ambient wind once the source is loaded.
export function AudioBoot() {
  const suno = useSuno()
  useAutoUnlock(suno)

  useEffect(() => {
    let stopped = false

    function tryStart() {
      if (stopped) return
      if (!suno.isUnlocked) return
      if (!suno.has(AUDIO_KEYS.wind)) return
      const playing = suno.playing()
      if (!playing.some((p) => p.key === AUDIO_KEYS.wind)) {
        suno.get(AUDIO_KEYS.wind).play()
      }
    }

    const id = setInterval(tryStart, 200)
    tryStart()

    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [suno])

  return null
}
