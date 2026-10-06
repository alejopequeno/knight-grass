import { Vector3 } from 'three/webgpu'

// Cinematic three-quarter side shot used while a story beat plays at a
// waypoint: the camera stands off to the side of the paladin → prop axis
// (a little toward the paladin), so both read clearly — paladin on one side
// of the frame, the prop and its text on the other.
const SIDE_DISTANCE = 6
// Toward the paladin: films the prop's front face in three-quarter view.
const TOWARD_PLAYER = 5
const LENS_HEIGHT = 2.1
// High enough to leave headroom for the paladin's reply above his head.
const LOOK_HEIGHT = 2
// Long lens (vertical degrees): flattens depth so paladin and prop both read
// big, instead of the wide follow lens shrinking the prop into the distance.
const SHOT_FOV = 36
// Where along player → prop the camera looks (0 = player, 1 = prop).
const LOOK_ALONG = 0.5

type PointXZ = { x: number; z: number }
export type CameraShot = { position: Vector3; target: Vector3; fov: number }

export function composeShot(player: PointXZ, prop: PointXZ, groundAt: (x: number, z: number) => number): CameraShot {
  const dx = prop.x - player.x
  const dz = prop.z - player.z
  const length = Math.hypot(dx, dz) || 1
  const forwardX = dx / length
  const forwardZ = dz / length
  // Screen-right of the paladin's approach (same convention as the character).
  const rightX = -forwardZ
  const rightZ = forwardX
  const lookX = player.x + dx * LOOK_ALONG
  const lookZ = player.z + dz * LOOK_ALONG
  const camX = lookX + rightX * SIDE_DISTANCE - forwardX * TOWARD_PLAYER
  const camZ = lookZ + rightZ * SIDE_DISTANCE - forwardZ * TOWARD_PLAYER
  return {
    position: new Vector3(camX, groundAt(camX, camZ) + LENS_HEIGHT, camZ),
    target: new Vector3(lookX, groundAt(lookX, lookZ) + LOOK_HEIGHT, lookZ),
    fov: SHOT_FOV,
  }
}

/** Vertical field of view (degrees) of the follow camera. */
export const FOLLOW_FOV = 75

const halfTan = (fovDegrees: number) => Math.tan((fovDegrees * Math.PI) / 360)

// How much to scale a world-space size under `fov` so it covers the same
// share of the screen as under the follow lens at the same distance.
export function lensScale(fov: number): number {
  return halfTan(fov) / halfTan(FOLLOW_FOV)
}

// Active shot, written by the story director, read by the follow camera.
let activeShot: CameraShot | null = null

export function setCameraShot(shot: CameraShot | null): void {
  activeShot = shot
}

export function getCameraShot(): CameraShot | null {
  return activeShot
}
