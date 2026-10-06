import {
  abs,
  cameraPosition,
  dot,
  float,
  max,
  mix,
  normalize,
  normalView,
  oneMinus,
  positionView,
  positionWorld,
  pow,
  texture,
  uv,
} from 'three/tsl'
import {
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  MeshStandardNodeMaterial,
  type Material,
} from 'three/webgpu'
import { atmosphere } from './atmosphere'

const RIM_POWER = 4
// Wider fresnel for the sun backlight so the whole silhouette edge glows.
const BACKLIGHT_RIM_POWER = 5
// How tightly the glow is focused on looking straight into the sun.
const BACKLIGHT_FOCUS = 3
// The FBX is a Phong asset: colour lives in the diffuse map, so stay
// dielectric. Glossy areas of the specular map become smoother.
const DEFAULT_ROUGHNESS = 0.7
const GLOSSY_ROUGHNESS = 0.35
const MATTE_ROUGHNESS = 0.9

const viewDirection = normalize(positionView.negate())
const edge = oneMinus(abs(dot(normalView, viewDirection)))

// Cool moon rim, always on.
export const moonRimNode = atmosphere.moonColor.mul(pow(edge, RIM_POWER)).mul(atmosphere.rimIntensity)

// Warm sun backlight: only when the camera looks toward the sun, so a
// backlit paladin reads as a glowing outline instead of a black cut-out.
const cameraToSurface = normalize(positionWorld.sub(cameraPosition))
const facingSun = pow(max(dot(cameraToSurface, atmosphere.sunDirection), 0), BACKLIGHT_FOCUS)
export const sunBacklightNode = atmosphere.sunColor
  .mul(pow(edge, BACKLIGHT_RIM_POWER))
  .mul(facingSun)
  .mul(atmosphere.backlightIntensity)

type MappedMaterial = MeshPhongMaterial | MeshLambertMaterial | MeshStandardMaterial

function isMappedMaterial(material: Material): material is MappedMaterial {
  return (
    material instanceof MeshPhongMaterial ||
    material instanceof MeshLambertMaterial ||
    material instanceof MeshStandardMaterial
  )
}

// FBX meshes arrive as Phong. Rebuild them as PBR node materials so the moon
// rim can be added as an emissive node; skinning keeps working automatically.
export function toRimLitMaterial(source: Material): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ roughness: DEFAULT_ROUGHNESS, metalness: 0 })
  if (isMappedMaterial(source)) {
    material.color.copy(source.color)
    material.map = source.map
    material.normalMap = source.normalMap
  }
  if (source instanceof MeshPhongMaterial && source.specularMap) {
    const gloss = texture(source.specularMap, uv()).r
    material.roughnessNode = mix(float(MATTE_ROUGHNESS), float(GLOSSY_ROUGHNESS), gloss)
  }
  material.transparent = source.transparent
  material.side = source.side
  material.emissiveNode = moonRimNode.add(sunBacklightNode)
  return material
}
