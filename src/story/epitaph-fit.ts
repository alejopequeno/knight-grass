export type Size = { width: number; height: number }

/** Share of the panel left as margin around the inscription. */
const PANEL_PADDING = 0.1
// Distances are measured from the camera, which in this third-person rig sits
// 4.5 m behind the paladin and 1.8 m up. So a player standing at the stone is
// still ~5 m away from it, and these thresholds are set to that rig, not to
// what a first-person reading distance would be.
/** Fully burned in: the player is within a couple of metres of the stone. */
export const EPITAPH_LEGIBLE_DISTANCE = 7
/** Beyond this the stone reads as bare — the carving has caught no light yet. */
export const EPITAPH_DISTANT_DISTANCE = 20
const MIN_INK = 1e-6

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * World metres per baked layout pixel that fits `ink` inside `panel`, keeping
 * the text's aspect. The headstone's recess is a fixed size, so the type is
 * measured into it rather than set at a guessed point size.
 */
export function fitScale(ink: Size, panel: Size): number {
  const usableWidth = panel.width * (1 - PANEL_PADDING)
  const usableHeight = panel.height * (1 - PANEL_PADDING)
  return Math.min(usableWidth / Math.max(ink.width, MIN_INK), usableHeight / Math.max(ink.height, MIN_INK))
}

/**
 * How far the inscription has revealed, 0 (bare stone) → 1 (fully burned in),
 * from the viewer's distance. Carved text is always there; walking up to it is
 * what makes it legible.
 */
export function epitaphReveal(distance: number): number {
  return 1 - smoothstep(EPITAPH_LEGIBLE_DISTANCE, EPITAPH_DISTANT_DISTANCE, distance)
}
