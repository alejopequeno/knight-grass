import { HeightfieldCollider, RigidBody } from '@react-three/rapier'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { dot, float, mix, positionWorld, texture, uv, vec3 } from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { groundAlbedoNode } from '../grass/grass-color'
import { createSeededRandom, type RandomSource } from '../lib/seeded-random'
import { terrainHeight } from '../lib/terrain'
import { GROUND_SIZE } from '../lib/world'

const MESH_SUBDIVISIONS = 192 // PlaneGeometry cell count → 193 vertices per side
const COLLIDER_RES = MESH_SUBDIVISIONS + 1 // match the mesh sampling exactly

// Procedural thatch-texture knobs.
const THATCH_TEXTURE_SIZE = 512
const THATCH_STRAND_COUNT = 8000
const THATCH_SHADOW_BLOB_COUNT = 30
const THATCH_SEED = 99

function buildThatchTexture(random: RandomSource): THREE.Texture {
  const size = THATCH_TEXTURE_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')

  ctx.fillStyle = '#0c1420'
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < THATCH_STRAND_COUNT; i++) {
    const x = random() * size
    const y = random() * size
    const len = 4 + random() * 10
    const angle = random() * Math.PI * 2
    const tone = 25 + Math.floor(random() * 35)
    const r = Math.floor(tone * 0.6)
    const g = tone + Math.floor(random() * 12)
    const b = tone + Math.floor(random() * 25)
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.4 + random() * 0.4})`
    ctx.lineWidth = 0.8 + random() * 1.2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len)
    ctx.stroke()
  }

  for (let i = 0; i < THATCH_SHADOW_BLOB_COUNT; i++) {
    const x = random() * size
    const y = random() * size
    const r = 30 + random() * 80
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

const THATCH_DETAIL_MIN = 0.8
const THATCH_DETAIL_MAX = 1.2
const LUMA = vec3(0.299, 0.587, 0.114)

function createGroundMaterial(thatch: THREE.Texture): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 })
  // Same albedo as the grass field; the thatch texture only adds detail.
  const detail = mix(float(THATCH_DETAIL_MIN), float(THATCH_DETAIL_MAX), dot(texture(thatch, uv()).rgb, LUMA))
  material.colorNode = groundAlbedoNode(positionWorld.xz).mul(detail)
  material.envMapIntensity = 0
  return material
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
  const thatch = useMemo(() => buildThatchTexture(createSeededRandom(THATCH_SEED)), [])
  const geometry = useMemo(() => buildGroundGeometry(), [])
  const heights = useMemo(() => buildHeightfield(), [])
  const material = useMemo(() => createGroundMaterial(thatch), [thatch])

  useEffect(
    () => () => {
      thatch.dispose()
      geometry.dispose()
      material.dispose()
    },
    [thatch, geometry, material],
  )

  return (
    <RigidBody type="fixed" friction={1} colliders={false}>
      <mesh geometry={geometry} material={material} receiveShadow castShadow={false} />
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
