import {
  abs,
  cameraPosition,
  dot,
  float,
  max,
  mix,
  normalize,
  normalView,
  transformedNormalWorld,
  oneMinus,
  positionView,
  positionWorld,
  pow,
  smoothstep,
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

const RIM_POWER = 2.2
// How tightly the rim hugs the moon-facing side. Low keeps it a broad wrap
// rather than a hot sliver.
const RIM_WRAP = 0.9
// Wider fresnel for the sun backlight so the whole silhouette edge glows.
const BACKLIGHT_RIM_POWER = 5
// How tightly the glow is focused on looking straight into the sun.
const BACKLIGHT_FOCUS = 3
// The FBX is a Phong asset: colour lives in the diffuse map and the specular
// map doubles as the metal mask — plate and mail are its bright areas, cloth
// and leather its dark ones. Glossy areas also become smoother.
const DEFAULT_ROUGHNESS = 0.7
const GLOSSY_ROUGHNESS = 0.3
const MATTE_ROUGHNESS = 0.9
// Specular values between these read as the cloth → metal ramp.
const METAL_MASK_LOW = 0.25
const METAL_MASK_HIGH = 0.75
// Metal needs the sky to reflect in: the scene environment is dialled down
// for the field, so the armour oversamples it to catch the blue hour.
const ARMOUR_ENV_INTENSITY = 3.5

const viewDirection = normalize(positionView.negate())
const edge = oneMinus(abs(dot(normalView, viewDirection)))

// How much a surface turns toward the moon, in world space (the moon's
// direction is a world vector; `normalView` is not comparable to it).
const facingMoon = pow(max(dot(normalize(transformedNormalWorld), atmosphere.moonDirection), 0), RIM_WRAP)

// Cool moon rim. Gated on facing the moon as well as on the silhouette edge:
// a fresnel alone glows evenly all the way round, which reads as an outline
// drawn on the paladin rather than light catching one side of him.
export const moonRimNode = atmosphere.moonColor
  .mul(pow(edge, RIM_POWER))
  .mul(facingMoon)
  .mul(atmosphere.rimIntensity)

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
    material.metalnessNode = smoothstep(METAL_MASK_LOW, METAL_MASK_HIGH, gloss)
    material.envMapIntensity = ARMOUR_ENV_INTENSITY
  }
  material.transparent = source.transparent
  material.side = source.side
  material.emissiveNode = moonRimNode.add(sunBacklightNode)
  return material
}
