import { HeightfieldCollider, RigidBody } from '@react-three/rapier'
import { useMemo } from 'react'
import * as THREE from 'three'
import { terrainHeight } from '../lib/terrain'

const GROUND_SIZE = 400
const MESH_SUBDIVISIONS = 192 // PlaneGeometry cell count → 193 vertices per side
const COLLIDER_RES = MESH_SUBDIVISIONS + 1 // match the mesh sampling exactly

function buildThatchTexture(): THREE.Texture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#0c1420'
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < 8000; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const len = 4 + Math.random() * 10
    const angle = Math.random() * Math.PI * 2
    const tone = 25 + Math.floor(Math.random() * 35)
    const r = Math.floor(tone * 0.6)
    const g = tone + Math.floor(Math.random() * 12)
    const b = tone + Math.floor(Math.random() * 25)
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.4 + Math.random() * 0.4})`
    ctx.lineWidth = 0.8 + Math.random() * 1.2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len)
    ctx.stroke()
  }

  for (let i = 0; i < 30; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = 30 + Math.random() * 80
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(0,0,0,0.45)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(80, 80)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function buildGroundGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(
    GROUND_SIZE,
    GROUND_SIZE,
    MESH_SUBDIVISIONS,
    MESH_SUBDIVISIONS,
  )
  geometry.rotateX(-Math.PI / 2)

  const positions = geometry.attributes.position
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i)
    const z = positions.getZ(i)
    positions.setY(i, terrainHeight(x, z))
  }
  positions.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

function buildHeightfield(): number[] {
  // Rapier internally builds an nalgebra DMatrix from this array, and DMatrix is
  // COLUMN-MAJOR. So we need heights[col * (nrows + 1) + row], where nrows / ncols
  // are the cell counts passed to ColliderDesc.heightfield (we pass COLLIDER_RES - 1).
  // It also expects (nrows + 1) * (ncols + 1) entries.
  const dim = COLLIDER_RES // = nrows + 1 = ncols + 1
  const heights: number[] = new Array(dim * dim)
  for (let row = 0; row < dim; row++) {
    for (let col = 0; col < dim; col++) {
      const u = col / (dim - 1) - 0.5
      const v = row / (dim - 1) - 0.5
      const x = u * GROUND_SIZE
      const z = v * GROUND_SIZE
      heights[col * dim + row] = terrainHeight(x, z)
    }
  }
  return heights
}

export function Ground() {
  const thatch = useMemo(() => buildThatchTexture(), [])
  const geometry = useMemo(() => buildGroundGeometry(), [])
  const heights = useMemo(() => buildHeightfield(), [])

  return (
    <RigidBody type="fixed" friction={1} colliders={false}>
      <mesh geometry={geometry} receiveShadow castShadow={false}>
        {/* envMapIntensity=0 + low color so the ground doesn't read as a bright
            wash through sparse grass when the night HDR lifts it. */}
        <meshStandardMaterial
          map={thatch}
          color="#0a1220"
          roughness={1}
          metalness={0}
          envMapIntensity={0}
        />
      </mesh>
      <HeightfieldCollider
        args={[
          COLLIDER_RES - 1,
          COLLIDER_RES - 1,
          heights,
          { x: GROUND_SIZE, y: 1, z: GROUND_SIZE },
        ]}
      />
    </RigidBody>
  )
}
