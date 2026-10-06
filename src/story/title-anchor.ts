import { Quaternion, Vector3, type Matrix4 } from 'three/webgpu'

/** Metres ahead of the viewer, and above its eye, where a zone title hangs. */
export const TITLE_DISTANCE = 45
export const TITLE_HEIGHT = 9

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
  position.y = eye.y + TITLE_HEIGHT
  toViewer.copy(flat).negate()
  facing.setFromUnitVectors(FACING_AXIS, toViewer)
  matrix.compose(position, facing, size.setScalar(scale))
}
