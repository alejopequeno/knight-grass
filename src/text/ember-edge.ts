import {
  composeEffects,
  wipe,
  type ComposedEffect,
  type TextEffect,
  type WipeEffect,
} from 'lettra/three'
import { color, mix, smoothstep } from 'three/tsl'
import type { Color } from 'three/webgpu'

// Erosion range that glows: the thin front where the wipe eats the glyph.
const EMBER_EDGE_START = 0.02
const EMBER_EDGE_END = 0.55

/**
 * The wipe front burns like paper: wherever the distance field is being
 * eroded the ink turns to `ember`, so letters ignite in and smoulder out.
 */
export function emberEdge(ember: Color): TextEffect {
  const emberColor = color(ember)
  return {
    uniforms: {},
    stages: {
      color: (prev, { erosion }) => mix(prev, emberColor, smoothstep(EMBER_EDGE_START, EMBER_EDGE_END, erosion)),
    },
  }
}

export type BurningEffect = ComposedEffect<[WipeEffect, TextEffect]>

/** A wipe whose front burns: the shared reveal for every text in the world. */
export function burning(band: number, ember: Color): BurningEffect {
  return composeEffects(wipe({ band }), emberEdge(ember))
}
