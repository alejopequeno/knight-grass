import { use } from 'react'
import { loadFont, loadFontTexture } from 'lettra/three'
import type { MSDFFont } from 'lettra'
import type { Texture } from 'three/webgpu'

const FONT_JSON_URL = '/fonts/cinzel.json'
const FONT_ATLAS_URL = '/fonts/cinzel.png'

export type StoryFont = { font: MSDFFont; map: Texture }

// One fetch per asset for the whole session; rejections are logged here and
// still reach use() so the scene error boundary shows the load error.
export const storyFontPromise: Promise<StoryFont> = Promise.all([
  loadFont(FONT_JSON_URL),
  loadFontTexture(FONT_ATLAS_URL),
]).then(([font, map]) => ({ font, map }))
storyFontPromise.catch((error: unknown) => console.error('[text] story font failed to load:', error))

export function useStoryFont(): StoryFont {
  return use(storyFontPromise)
}
