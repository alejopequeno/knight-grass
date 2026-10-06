import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Mesh } from 'three/webgpu'
import { asWebGPURenderer } from '../renderer/as-webgpu-renderer'
import { createBladeGeometry } from './grass-blade-geometry'
import { GRASS_RING_LIST, type GrassRingConfig } from './grass-config'
import { createGrassMaterial } from './grass-material'
import { createRingSimulation } from './grass-simulation'
import { createRingState } from './grass-state'

function buildRing(ring: GrassRingConfig) {
  const state = createRingState(ring)
  const geometry = createBladeGeometry(ring.segments)
  const material = createGrassMaterial(state)
  const mesh = new Mesh(geometry, material)
  // Mesh.count instances the strip without an instanceMatrix buffer.
  mesh.count = state.count
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = false
  return { name: ring.name, mesh, geometry, material, simulation: createRingSimulation(state) }
}

const ACTIVE_RINGS: readonly GrassRingConfig[] = GRASS_RING_LIST

export function Grass() {
  const rings = useMemo(() => ACTIVE_RINGS.map(buildRing), [])

  useEffect(
    () => () => {
      for (const ring of rings) {
        ring.geometry.dispose()
        ring.material.dispose()
      }
    },
    [rings],
  )

  // Priority 0: runs after <PlayerUniformSync> and before the render pass (priority 1).
  useFrame((state) => {
    const renderer = asWebGPURenderer(state.gl)
    for (const ring of rings) renderer.compute(ring.simulation)
  })

  return (
    <>
      {rings.map((ring) => (
        <primitive key={ring.name} object={ring.mesh} />
      ))}
    </>
  )
}
