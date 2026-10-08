import { Quaternion, Vector3, type Matrix4 } from 'three/webgpu'

/** Metres ahead of the viewer where a zone title hangs. */
export const TITLE_DISTANCE = 45
/**
 * Degrees above the viewer's horizontal, not metres.
 *
 * What decides where the title lands on screen is the angle it subtends, and
 * the follow camera already looks ~19° down at the paladin. A fixed height is
 * the same angle only on flat ground: walking a slope tips the camera further
 * down and pushes a title pinned in metres off the top of the frame.
 */
export const TITLE_ELEVATION_DEG = 6

/** How far above the viewer's eye a title hangs, at a given distance. */
export function titleRise(distance: number): number {
  return distance * Math.tan((TITLE_ELEVATION_DEG * Math.PI) / 180)
}

const FACING_AXIS = new Vector3(0, 0, 1)
const scratch = { flat: new Vector3(), position: new Vector3(), toViewer: new Vector3(), facing: new Quaternion(), size: new Vector3() }

// Pins a zone title on the horizon along the viewer's (yaw-only) look
// direction, turned to face the viewer. Placed once per beat, so the title
// stays put in the world while the camera moves. `scale` compensates the
// lens (see lensScale) so titles read the same size in every shot.
export function placeTitle(matrix: Matrix4, eye: Vector3, look: Vector3, scale = 1): void {
  const { flat, position, toViewer, facing, size } = scratch
  flat.set(look.x, 0, look.z).normalize()
  position.copy(eye).addScaledVector(flat, TITLE_DISTANCE)
  position.y = eye.y + titleRise(TITLE_DISTANCE)
  toViewer.copy(flat).negate()
  facing.setFromUnitVectors(FACING_AXIS, toViewer)
  matrix.compose(position, facing, size.setScalar(scale))
}
