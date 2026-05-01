import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Stars } from '@react-three/drei'
import { useControls } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Sky as ThreeSky } from 'three/examples/jsm/objects/Sky.js'
import { sceneState } from '../lib/scene-state'

export function Sky() {
  const sky = useMemo(() => {
    const s = new ThreeSky()
    s.scale.setScalar(450000)
    return s
  }, [])

  const sunDirection = useMemo(() => new THREE.Vector3(), [])
  const sunLightRef = useRef<THREE.DirectionalLight>(null)
  const moonLightRef = useRef<THREE.DirectionalLight>(null)
  const { gl } = useThree()

  const {
    turbidity,
    rayleigh,
    mieCoefficient,
    mieDirectionalG,
    elevation,
    azimuth,
    exposure,
    moonIntensity,
    sunIntensity,
    envPreset,
    envIntensity,
    showStars,
  } = useControls('sky', {
    turbidity: { value: 3.4, min: 0, max: 20, step: 0.1 },
    rayleigh: { value: 2.2, min: 0, max: 4, step: 0.05 },
    mieCoefficient: { value: 0.003, min: 0, max: 0.1, step: 0.0005 },
    mieDirectionalG: { value: 0.9, min: 0, max: 1, step: 0.01 },
    elevation: { value: 3.5, min: -10, max: 90, step: 0.5 },
    azimuth: { value: 194, min: 0, max: 360, step: 1 },
    exposure: { value: 0.56, min: 0, max: 1.5, step: 0.01 },
    moonIntensity: { value: 0.55, min: 0, max: 8, step: 0.05 },
    sunIntensity: { value: 2.75, min: 0, max: 8, step: 0.05 },
    envPreset: {
      value: 'night',
      options: ['night', 'sunset', 'dawn', 'park', 'forest', 'city', 'apartment', 'studio'],
    },
    envIntensity: { value: 0.55, min: 0, max: 2, step: 0.05 },
    showStars: true,
  })

  // Push leva controls into the sky material, lights, and tone mapping. All
  // side effects, no derived value — useEffect is the right hook.
  useEffect(() => {
    const u = sky.material.uniforms
    u.turbidity.value = turbidity
    u.rayleigh.value = rayleigh
    u.mieCoefficient.value = mieCoefficient
    u.mieDirectionalG.value = mieDirectionalG

    const phi = THREE.MathUtils.degToRad(90 - elevation)
    const theta = THREE.MathUtils.degToRad(azimuth)
    sunDirection.setFromSphericalCoords(1, phi, theta)
    u.sunPosition.value.copy(sunDirection)
    sceneState.sunDirection.copy(sunDirection)

    const sunLight = sunLightRef.current
    if (sunLight) {
      sunLight.position.copy(sunDirection).multiplyScalar(120)
      sunLight.intensity = sunIntensity
    }
    const moonLight = moonLightRef.current
    if (moonLight) {
      moonLight.position.copy(sunDirection).multiplyScalar(-100)
      moonLight.position.y = Math.max(50, Math.abs(moonLight.position.y))
      moonLight.intensity = moonIntensity
    }

    gl.toneMappingExposure = exposure
  }, [
    sky,
    sunDirection,
    turbidity,
    rayleigh,
    mieCoefficient,
    mieDirectionalG,
    elevation,
    azimuth,
    exposure,
    moonIntensity,
    sunIntensity,
    gl,
  ])

  useFrame(({ camera }) => {
    // both lights aim at where the camera is looking on the ground plane
    for (const ref of [sunLightRef, moonLightRef]) {
      const light = ref.current
      if (!light) continue
      light.target.position.set(camera.position.x, 0, camera.position.z)
      light.target.updateMatrixWorld()
    }
  })

  return (
    <>
      <primitive object={sky} />
      {showStars && (
        <Stars
          radius={300}
          depth={80}
          count={6000}
          factor={4}
          saturation={0}
          fade
          speed={0.5}
        />
      )}
      <Environment
        preset={envPreset as 'night'}
        background={false}
        environmentIntensity={envIntensity}
      />
      {/* warmer + stronger hemisphere fill so character sides aren't crushed
          to black on the unlit hemisphere. Sky tone matches sunset palette. */}
      <hemisphereLight args={['#5a6478', '#1a1a22', 0.7]} />
      {/* Sun: warm, casts shadows, follows actual sun direction */}
      <directionalLight
        ref={sunLightRef}
        intensity={sunIntensity}
        color="#ffb878"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={200}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />
      {/* Moon/back fill: cool, opposite hemisphere, no shadows */}
      <directionalLight
        ref={moonLightRef}
        intensity={moonIntensity}
        color="#b9cfe8"
      />
    </>
  )
}
