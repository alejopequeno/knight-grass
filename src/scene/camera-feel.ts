import { MOVING_THRESHOLD, RUN_SPEED } from '../lib/movement'

/** Degrees the lens opens up at a full run, on top of the resting field. */
export const RUN_FOV_BOOST = 7

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Extra field of view for how fast the paladin is moving. Opening the lens as
 * speed builds is what sells running; the edges of frame stretch past you.
 */
export function runFovBoost(speed: number): number {
  return RUN_FOV_BOOST * smoothstep(MOVING_THRESHOLD, RUN_SPEED, speed)
}
