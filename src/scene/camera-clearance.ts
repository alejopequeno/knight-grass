import { terrainHeight } from '../lib/terrain'

// Tallest blades reach ~1.6 m (card height × max height scale); keep the lens
// above them so close cards never fill the frame as flat strips.
export const CAMERA_MIN_CLEARANCE = 1.9

export function clampCameraHeight(desiredY: number, x: number, z: number): number {
  return Math.max(desiredY, terrainHeight(x, z) + CAMERA_MIN_CLEARANCE)
}
