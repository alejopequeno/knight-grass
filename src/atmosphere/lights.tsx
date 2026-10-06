import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { DirectionalLight } from 'three'
import { atmosphere } from './atmosphere'

const SUN_DISTANCE = 120
const MOON_DISTANCE = 100
const SHADOW_MAP_SIZE = 2048
const SHADOW_HALF_EXTENT = 40
const SHADOW_FAR = 250

// Moon is the key light (casts shadows); the low sun is a warm fill.
// Both follow the camera so the shadow frustum stays around the player.
export function Lights() {
  const moonRef = useRef<DirectionalLight>(null)
  const sunRef = useRef<DirectionalLight>(null)

  useFrame(({ camera }) => {
    const moon = moonRef.current
    const sun = sunRef.current
    if (!moon || !sun) return
    moon.position.copy(atmosphere.moonDirection.value).multiplyScalar(MOON_DISTANCE).add(camera.position)
    sun.position.copy(atmosphere.sunDirection.value).multiplyScalar(SUN_DISTANCE).add(camera.position)
    moon.intensity = atmosphere.moonIntensity.value
    sun.intensity = atmosphere.sunIntensity.value
    for (const light of [moon, sun]) {
      light.target.position.set(camera.position.x, 0, camera.position.z)
      light.target.updateMatrixWorld()
    }
  })

  return (
    <>
      <hemisphereLight args={['#2c3a5c', '#0b0f18', 1]} />
      <directionalLight
        ref={moonRef}
        color="#b9cfe8"
        castShadow
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
        shadow-camera-far={SHADOW_FAR}
        shadow-camera-left={-SHADOW_HALF_EXTENT}
        shadow-camera-right={SHADOW_HALF_EXTENT}
        shadow-camera-top={SHADOW_HALF_EXTENT}
        shadow-camera-bottom={-SHADOW_HALF_EXTENT}
      />
      <directionalLight ref={sunRef} color={atmosphere.sunColor.value} />
    </>
  )
}
