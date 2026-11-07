import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import { use, useEffect } from 'react'
import { SkyMesh } from 'three/addons/objects/SkyMesh.js'
import { NIGHT_HDRI_URL } from '../loading/asset-manifest'
import { loadAsset } from '../loading/assets'
import { atmosphere } from './atmosphere'
import { heightFogNode } from './height-fog'
import { Fireflies } from './fireflies'
import { Stars } from './stars'

const SKY_SCALE = 450000
const SKY_CLOUD_COVERAGE = 0.3
const SKY_CLOUD_DENSITY = 0.3

// Module-level singletons: one sky per page. Mutating their uniforms from
// effects is allowed (they are not hook return values).
const sky = new SkyMesh()
sky.scale.setScalar(SKY_SCALE)
sky.material.fog = false
// Blue hour: the sun is just below the horizon, so no disc; thin clouds.
sky.showSunDisc.value = 0
sky.cloudCoverage.value = SKY_CLOUD_COVERAGE
sky.cloudDensity.value = SKY_CLOUD_DENSITY

export function Sky() {
  const environment = use(loadAsset(NIGHT_HDRI_URL, 'environment'))
  const c = useControls('sky', {
    turbidity: { value: 5, min: 0, max: 20, step: 0.1 },
    rayleigh: { value: 2.6, min: 0, max: 4, step: 0.05 },
    mieCoefficient: { value: 0.004, min: 0, max: 0.1, step: 0.0005 },
    mieDirectionalG: { value: 0.85, min: 0, max: 1, step: 0.01 },
  })

  useEffect(() => {
    sky.turbidity.value = c.turbidity
    sky.rayleigh.value = c.rayleigh
    sky.mieCoefficient.value = c.mieCoefficient
    sky.mieDirectionalG.value = c.mieDirectionalG
  }, [c])

  useFrame(({ gl, scene }) => {
    sky.sunPosition.value.copy(atmosphere.sunDirection.value)
    gl.toneMappingExposure = atmosphere.exposure.value
    scene.environmentIntensity = atmosphere.environmentIntensity.value
  })

  return (
    <>
      <primitive object={sky} />
      <primitive object={environment} attach="environment" />
      <primitive object={heightFogNode} attach="fogNode" />
      <Stars />
      <Fireflies />
    </>
  )
}
