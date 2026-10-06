import { useControls } from 'leva'
import { useEffect } from 'react'
import { atmosphere, directionFromAngles } from './atmosphere'

// The moon sits opposite the sun's azimuth.
const MOON_AZIMUTH_OFFSET = 180

export function AtmosphereControls() {
  const c = useControls('atmosphere', {
    sunElevation: { value: 2, min: -10, max: 90, step: 0.5 },
    sunAzimuth: { value: 194, min: 0, max: 360, step: 1 },
    moonElevation: { value: 35, min: 5, max: 90, step: 1 },
    exposure: { value: 0.7, min: 0, max: 1.5, step: 0.01 },
    environmentIntensity: { value: 0.35, min: 0, max: 2, step: 0.05 },
    sunIntensity: { value: 1.5, min: 0, max: 8, step: 0.05 },
    moonIntensity: { value: 2, min: 0, max: 8, step: 0.05 },
    rimIntensity: { value: 0.15, min: 0, max: 4, step: 0.05 },
    backlightIntensity: { value: 1, min: 0, max: 8, step: 0.05 },
    fogColor: '#18202f',
    horizonColor: '#6b4a52',
    fogNear: { value: 25, min: 0, max: 100, step: 1 },
    fogFar: { value: 70, min: 5, max: 200, step: 1 },
    groundFogTop: { value: 1.4, min: 0, max: 5, step: 0.05 },
    groundFogBottom: { value: -0.5, min: -3, max: 3, step: 0.05 },
    groundFogDensity: { value: 0.55, min: 0, max: 1, step: 0.05 },
  })

  useEffect(() => {
    atmosphere.sunDirection.value.copy(directionFromAngles(c.sunElevation, c.sunAzimuth))
    atmosphere.moonDirection.value.copy(directionFromAngles(c.moonElevation, c.sunAzimuth + MOON_AZIMUTH_OFFSET))
    atmosphere.exposure.value = c.exposure
    atmosphere.environmentIntensity.value = c.environmentIntensity
    atmosphere.sunIntensity.value = c.sunIntensity
    atmosphere.moonIntensity.value = c.moonIntensity
    atmosphere.rimIntensity.value = c.rimIntensity
    atmosphere.backlightIntensity.value = c.backlightIntensity
    atmosphere.fogColor.value.set(c.fogColor)
    atmosphere.horizonColor.value.set(c.horizonColor)
    atmosphere.fogNear.value = c.fogNear
    atmosphere.fogFar.value = c.fogFar
    atmosphere.groundFogTop.value = c.groundFogTop
    atmosphere.groundFogBottom.value = c.groundFogBottom
    atmosphere.groundFogDensity.value = c.groundFogDensity
  }, [c])

  return null
}
