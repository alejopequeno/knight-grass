import { cameraPosition, dot, fog, max, mix, normalize, oneMinus, positionView, positionWorld, pow, smoothstep, vec3 } from 'three/tsl'
import { heightAboveTerrainNode } from '../lib/terrain'
import { atmosphere } from './atmosphere'

const HORIZON_TINT_POWER = 4

// Distance fog combined with a low-lying ground fog band (Beer's-law style:
// independent attenuations). The band follows the terrain so valleys are not
// swallowed whole. Colour warms toward the sun's azimuth.
const distanceFog = smoothstep(atmosphere.fogNear, atmosphere.fogFar, positionView.z.negate())
const groundFog = oneMinus(
  smoothstep(atmosphere.groundFogBottom, atmosphere.groundFogTop, heightAboveTerrainNode(positionWorld)),
).mul(atmosphere.groundFogDensity)
const fogFactor = oneMinus(oneMinus(distanceFog).mul(oneMinus(groundFog)))

const viewFlat = normalize(vec3(positionWorld.x.sub(cameraPosition.x), 0, positionWorld.z.sub(cameraPosition.z)))
const sunFlat = normalize(vec3(atmosphere.sunDirection.x, 0, atmosphere.sunDirection.z))
const towardSun = pow(max(dot(viewFlat, sunFlat), 0), HORIZON_TINT_POWER)

export const heightFogNode = fog(mix(atmosphere.fogColor, atmosphere.horizonColor, towardSun), fogFactor)
