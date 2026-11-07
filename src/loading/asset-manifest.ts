import type { BatchEntry } from '@joycostudio/susano'
import type { PaladinState } from '../scene/paladin-animator'
import type { AssetLoaderRegistry } from './asset-loaders'

// Every file the scene needs before the curtain lifts. Components import their
// URLs from here, so the preload and the scene always ask for the same thing.

export const PALADIN_MODEL_URL = '/models/paladin.fbx'
export const PALADIN_ANIMATION_URLS: Readonly<Record<PaladinState, string>> = {
  idle: '/models/anim-idle.fbx',
  idle2: '/models/anim-idle2.fbx',
  walk: '/models/anim-walk.fbx',
  run: '/models/anim-run.fbx',
  strafeLeft: '/models/anim-strafe-left.fbx',
  strafeRight: '/models/anim-strafe-right.fbx',
  jump: '/models/anim-jump.fbx',
  attack: '/models/anim-attack.fbx',
  block: '/models/anim-block.fbx',
}

export const NIGHT_HDRI_URL = '/hdri/dikhololo-night-1k.hdr'
export const HORIZON_URL = '/models/props/horizon.glb'
export const FIELD_PROPS_URL = '/models/props/field.glb'

/** Story props, keyed by the story beat that places them. */
export const STORY_PROP_URLS: Readonly<Record<string, string>> = {
  fabroos: '/models/props/tomb.glb',
  oath: '/models/props/stones.glb',
  standard: '/models/props/standard.glb',
}
// The order's emblem, stamped on the standard's banner.
export const EMBLEM_URL = '/textures/order-emblem.png'

export const STORY_FONT_URL = '/fonts/cinzel.json'
export const STORY_FONT_ATLAS_URL = '/fonts/cinzel.png'

type SceneAsset = BatchEntry<AssetLoaderRegistry>

export const SCENE_ASSETS: readonly SceneAsset[] = [
  { url: PALADIN_MODEL_URL, type: 'fbx' },
  ...Object.values(PALADIN_ANIMATION_URLS).map((url): SceneAsset => ({ url, type: 'fbx' })),
  { url: NIGHT_HDRI_URL, type: 'environment' },
  { url: HORIZON_URL, type: 'gltf' },
  { url: FIELD_PROPS_URL, type: 'gltf' },
  ...Object.values(STORY_PROP_URLS).map((url): SceneAsset => ({ url, type: 'gltf' })),
  { url: EMBLEM_URL, type: 'texture' },
  { url: STORY_FONT_URL, type: 'msdf-font' },
  { url: STORY_FONT_ATLAS_URL, type: 'font-atlas' },
]
