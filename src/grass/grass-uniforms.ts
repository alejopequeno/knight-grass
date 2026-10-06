import { uniform } from 'three/tsl'
import { Color, MathUtils, Vector2 } from 'three/webgpu'
import { GRASS_DEFAULTS } from './grass-config'

export function windDirectionFromAngle(angleDeg: number): Vector2 {
  const radians = MathUtils.degToRad(angleDeg)
  return new Vector2(Math.cos(radians), Math.sin(radians))
}

const d = GRASS_DEFAULTS

// Module-level so <GrassControls> can write `.value` without mutating hook
// return values. Built from GRASS_DEFAULTS — the single source of defaults.
export const grassUniforms = {
  bladeWidth: uniform(d.bladeWidth),
  heightMin: uniform(d.heightMin),
  heightMax: uniform(d.heightMax),
  clumpHeightMin: uniform(d.clumpHeightMin),
  clumpHeightMax: uniform(d.clumpHeightMax),
  leanMin: uniform(d.leanMin),
  leanMax: uniform(d.leanMax),
  stiffnessMin: uniform(d.stiffnessMin),
  stiffnessMax: uniform(d.stiffnessMax),
  clumpSize: uniform(d.clumpSize),
  windDirection: uniform(windDirectionFromAngle(d.windAngleDeg)),
  windStrength: uniform(d.windStrength),
  windScale: uniform(d.windScale),
  windSpeed: uniform(d.windSpeed),
  trampleStrength: uniform(d.trampleStrength),
  baseColor: uniform(new Color(d.baseColor)),
  tipColor: uniform(new Color(d.tipColor)),
  dryColor: uniform(new Color(d.dryColor)),
  lushColor: uniform(new Color(d.lushColor)),
  skyAmbient: uniform(new Color(d.skyAmbient)),
  groundAmbient: uniform(new Color(d.groundAmbient)),
  ambientStrength: uniform(d.ambientStrength),
  diffuseStrength: uniform(d.diffuseStrength),
  aoNear: uniform(d.aoNear),
  aoFar: uniform(d.aoFar),
  translucency: uniform(d.translucency),
  specStrength: uniform(d.specStrength),
  specShininess: uniform(d.specShininess),
}
