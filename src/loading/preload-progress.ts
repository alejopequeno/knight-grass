import type { Batch, SusanoLoader } from '@joycostudio/susano'
import { useSyncExternalStore } from 'react'
import assetSizes from 'virtual:asset-sizes'
import { TrackedAssetLoader } from './asset-loaders'
import { byteProgress, type ByteSample } from './byte-progress'

const PERCENT = 100

// Whole percent only: the curtain re-renders once per visible change, not on
// every network chunk. Monotonic, so a late Content-Length never pulls it back.
let percent = 0
let complete = false
const listeners = new Set<() => void>()

function notify(): void {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// The on-disk size wins over Content-Length: it is known before the request
// is even sent, and it matches the decompressed bytes the loaders count.
function sampleOf(loader: SusanoLoader<unknown>): ByteSample {
  const settled = loader.status === 'loaded' || loader.status === 'error'
  const knownSize = assetSizes[loader.url] ?? 0
  if (!(loader instanceof TrackedAssetLoader)) return { loaded: 0, total: knownSize, settled }
  return { loaded: loader.bytesLoaded, total: knownSize || loader.bytesTotal, settled }
}

/** Mirrors a Susano batch into the store the loading curtain reads. */
export function trackPreload(batch: Batch): void {
  const loaders = [...new Set(batch.items.map((item) => item.loader))]

  const update = (): void => {
    const next = Math.floor(byteProgress(loaders.map(sampleOf)) * PERCENT)
    if (next <= percent) return
    percent = next
    notify()
  }

  const unsubscribers = loaders.flatMap((loader) => [
    loader.on('progress', update),
    loader.on('loaded', update),
    loader.on('error', update),
  ])

  batch.on('completed', () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe())
    percent = PERCENT
    complete = true
    notify()
  })
}

export function usePreloadPercent(): number {
  return useSyncExternalStore(subscribe, () => percent)
}

export function usePreloadComplete(): boolean {
  return useSyncExternalStore(subscribe, () => complete)
}
