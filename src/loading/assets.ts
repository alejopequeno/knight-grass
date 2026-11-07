import { Susano, type Batch, type ContentOf } from '@joycostudio/susano'
import { ASSET_LOADERS, type AssetLoaderRegistry, type AssetType } from './asset-loaders'
import { SCENE_ASSETS } from './asset-manifest'
import { trackPreload } from './preload-progress'

export type AssetContent<K extends AssetType> = ContentOf<AssetLoaderRegistry, K>

// One fetch and one parse per URL for the whole session: the preload batch
// and every component that later asks for the same file share the loader.
const assets = new Susano(ASSET_LOADERS)

// Susano hands out a fresh promise per call; React's use() needs the same
// one on every render, so each URL's first call is kept.
const assetPromises = new Map<string, Promise<unknown>>()

/** Stable, deduped promise for one asset. A URL must always use one type. */
export function loadAsset<K extends AssetType>(url: string, type: K): Promise<AssetContent<K>> {
  const cached = assetPromises.get(url)
  // Safe: the map is only filled below, with the result of a load of `type`.
  if (cached) return cached as Promise<AssetContent<K>>
  const promise = assets.load(url, { type })
  assetPromises.set(url, promise)
  return promise
}

let scenePreload: Batch | null = null

/** Starts fetching every scene asset at once. Idempotent. */
export function startScenePreload(): Batch {
  if (scenePreload) return scenePreload
  scenePreload = assets.batch([...SCENE_ASSETS], {
    // Fail-soft: the batch still completes; whichever component needs the
    // file surfaces the failure through its own error path.
    onError: ({ loader, error }) => console.error(`[assets] ${loader.url} failed to load:`, error),
  })
  trackPreload(scenePreload)
  return scenePreload
}
