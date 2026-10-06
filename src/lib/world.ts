// Side length of the square playable ground, in world units.
export const GROUND_SIZE = 400
// Keep the character this far from the ground edge so it never falls off.
const WORLD_EDGE_MARGIN = 10
export const WORLD_HALF_EXTENT = GROUND_SIZE / 2 - WORLD_EDGE_MARGIN

export function clampToWorld(value: number): number {
  return Math.min(WORLD_HALF_EXTENT, Math.max(-WORLD_HALF_EXTENT, value))
}
