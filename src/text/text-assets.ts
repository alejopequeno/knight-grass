import { use } from 'react'
import type { MSDFFont } from 'lettra'
import type { Texture } from 'three/webgpu'
import { STORY_FONT_ATLAS_URL, STORY_FONT_URL } from '../loading/asset-manifest'
import { loadAsset } from '../loading/assets'

export type StoryFont = { font: MSDFFont; map: Texture }

// One promise for the session: use() must see the same one on every render.
// Rejections reach use(), so the scene error boundary shows the load error.
let storyFont: Promise<StoryFont> | null = null

function loadStoryFont(): Promise<StoryFont> {
  storyFont ??= Promise.all([
    loadAsset(STORY_FONT_URL, 'msdf-font'),
    loadAsset(STORY_FONT_ATLAS_URL, 'font-atlas'),
  ]).then(([font, map]) => ({ font, map }))
  return storyFont
}

export function useStoryFont(): StoryFont {
  return use(loadStoryFont())
}
