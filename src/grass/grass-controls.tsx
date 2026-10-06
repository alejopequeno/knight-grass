import { useControls } from 'leva'
import { useEffect } from 'react'
import { GRASS_DEFAULTS } from './grass-config'
import { grassUniforms, windDirectionFromAngle } from './grass-uniforms'

const d = GRASS_DEFAULTS

export function GrassControls() {
  const c = useControls('grass', {
    bladeWidth: { value: d.bladeWidth, min: 0.01, max: 0.12, step: 0.005 },
    heightMin: { value: d.heightMin, min: 0.1, max: 2, step: 0.05 },
    heightMax: { value: d.heightMax, min: 0.1, max: 2, step: 0.05 },
    windAngleDeg: { value: d.windAngleDeg, min: 0, max: 360, step: 1 },
    windStrength: { value: d.windStrength, min: 0, max: 2, step: 0.05 },
    windScale: { value: d.windScale, min: 0.005, max: 0.2, step: 0.005 },
    windSpeed: { value: d.windSpeed, min: 0, max: 3, step: 0.05 },
    trampleStrength: { value: d.trampleStrength, min: 0, max: 3, step: 0.05 },
    baseColor: d.baseColor,
    tipColor: d.tipColor,
    dryColor: d.dryColor,
    lushColor: d.lushColor,
    ambientStrength: { value: d.ambientStrength, min: 0, max: 2, step: 0.05 },
    diffuseStrength: { value: d.diffuseStrength, min: 0, max: 2, step: 0.05 },
    aoNear: { value: d.aoNear, min: 0, max: 1, step: 0.05 },
    aoFar: { value: d.aoFar, min: 0, max: 1, step: 0.05 },
    translucency: { value: d.translucency, min: 0, max: 4, step: 0.05 },
    specStrength: { value: d.specStrength, min: 0, max: 1, step: 0.01 },
  })

  useEffect(() => {
    const u = grassUniforms
    u.bladeWidth.value = c.bladeWidth
    u.heightMin.value = c.heightMin
    u.heightMax.value = c.heightMax
    u.windDirection.value.copy(windDirectionFromAngle(c.windAngleDeg))
    u.windStrength.value = c.windStrength
    u.windScale.value = c.windScale
    u.windSpeed.value = c.windSpeed
    u.trampleStrength.value = c.trampleStrength
    u.baseColor.value.set(c.baseColor)
    u.tipColor.value.set(c.tipColor)
    u.dryColor.value.set(c.dryColor)
    u.lushColor.value.set(c.lushColor)
    u.ambientStrength.value = c.ambientStrength
    u.diffuseStrength.value = c.diffuseStrength
    u.aoNear.value = c.aoNear
    u.aoFar.value = c.aoFar
    u.translucency.value = c.translucency
    u.specStrength.value = c.specStrength
  }, [c])

  return null
}
