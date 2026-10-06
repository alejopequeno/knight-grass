import { MOVING_THRESHOLD, RUNNING_THRESHOLD } from '../lib/movement'

export type FootstepGait = 'still' | 'walk' | 'run'

export function footstepGait(horizontalSpeed: number): FootstepGait {
  if (horizontalSpeed > RUNNING_THRESHOLD) return 'run'
  if (horizontalSpeed > MOVING_THRESHOLD) return 'walk'
  return 'still'
}
