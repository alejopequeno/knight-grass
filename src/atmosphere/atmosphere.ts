import { uniform } from 'three/tsl'
import { Color, MathUtils, Vector3 } from 'three/webgpu'

export function directionFromAngles(elevationDeg: number, azimuthDeg: number): Vector3 {
  const phi = MathUtils.degToRad(90 - elevationDeg)
  const theta = MathUtils.degToRad(azimuthDeg)
  return new Vector3().setFromSphericalCoords(1, phi, theta)
}

// Single source of truth for everything atmospheric. Shaders read these
// nodes directly; <AtmosphereControls> writes them from leva; lights and
// the sky read `.value` each frame.
export const atmosphere = {
  sunDirection: uniform(directionFromAngles(2, 194)),
  moonDirection: uniform(directionFromAngles(35, 14)),
  fogColor: uniform(new Color('#18202f')),
  horizonColor: uniform(new Color('#6b4a52')),
  // Far enough that the landform crests stay readable and separate from each
  // other by haze instead of being swallowed by a fog wall at mid-distance.
  fogNear: uniform(35),
  fogFar: uniform(145),
  groundFogTop: uniform(1.4),
  groundFogBottom: uniform(-0.5),
  groundFogDensity: uniform(0.55),
  moonColor: uniform(new Color('#b9cfe8')),
  sunColor: uniform(new Color('#ff9a5c')),
  backlightIntensity: uniform(1),
  moonIntensity: uniform(2),
  sunIntensity: uniform(1.5),
  // The rim is now gated on facing the moon, so it needs real strength to
  // carve the paladin's silhouette out of a field this dark.
  rimIntensity: uniform(3.4),
  exposure: uniform(0.7),
  environmentIntensity: uniform(0.35),
}
