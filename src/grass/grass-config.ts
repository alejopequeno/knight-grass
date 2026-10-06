export type GrassRingName = 'near' | 'far'

export type GrassRingConfig = {
  name: GrassRingName
  /** Half side of the square ring around the player (m). */
  halfExtent: number
  /** Grid cell size (m); one blade per cell. */
  spacing: number
  /** Bezier segments along the blade. */
  segments: number
}

const NEAR_SPACING = 0.07

// The far grid is every FAR_GRID_STRIDE-th near cell, and a far blade is the
// very same blade as the near blade in that cell (same hash → same position,
// height, yaw, colour). LOD changes only how many blades are drawn and their
// segment count — blades never move between rings.
export const FAR_GRID_STRIDE = 3

// Near-only blades (not in the shared subset) thin out from here…
export const LOD_THIN_START = 9
// …and are gone at the hand-off, where shared blades switch to the far ring.
export const LOD_HANDOFF = 13.5
// Shared blades widen to this factor across the thinning band.
export const FAR_WIDTH_SCALE = 1.8
// Far-ring thinning beyond the hand-off and its outer fade.
export const FAR_MIN_DENSITY = 0.35
export const FAR_OUTER_FADE_START = 50

export const GRASS_RINGS: Record<GrassRingName, GrassRingConfig> = {
  near: { name: 'near', halfExtent: 15, spacing: NEAR_SPACING, segments: 6 },
  far: { name: 'far', halfExtent: 60, spacing: NEAR_SPACING * FAR_GRID_STRIDE, segments: 2 },
}

export const GRASS_RING_LIST: readonly GrassRingConfig[] = [GRASS_RINGS.near, GRASS_RINGS.far]

// Single source of truth for every tweakable grass value: uniforms and leva
// both read from here.
export const GRASS_DEFAULTS = {
  bladeWidth: 0.04,
  heightMin: 0.7,
  heightMax: 1.3,
  clumpHeightMin: 0.8,
  clumpHeightMax: 1.2,
  leanMin: 0.2,
  leanMax: 0.6,
  stiffnessMin: 0.6,
  stiffnessMax: 1.4,
  clumpSize: 1.5,
  windAngleDeg: 30,
  windStrength: 0.45,
  windScale: 0.035,
  windSpeed: 0.5,
  trampleStrength: 1,
  baseColor: '#2a3018',
  tipColor: '#c8b273',
  dryColor: '#d9c78f',
  lushColor: '#6d7a3c',
  skyAmbient: '#3e4a6a',
  groundAmbient: '#141810',
  ambientStrength: 0.35,
  diffuseStrength: 0.55,
  aoNear: 0.35,
  aoFar: 0.7,
  translucency: 1.4,
  specStrength: 0.12,
  specShininess: 18,
} as const

export function maxBladeHeight(): number {
  return GRASS_DEFAULTS.heightMax * GRASS_DEFAULTS.clumpHeightMax
}

// Reduced motion keeps a gentle sway instead of freezing the field.
export const REDUCED_GUST_SCALE = 0.3

export function gustScaleFor(motionScale: number): number {
  return REDUCED_GUST_SCALE + (1 - REDUCED_GUST_SCALE) * motionScale
}
