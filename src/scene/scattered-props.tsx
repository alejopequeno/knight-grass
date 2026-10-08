import { useLoader } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three/webgpu'
import { terrainHeight } from '../lib/terrain'

const UP = new Vector3(0, 1, 0)

/** One placed copy of a named mesh inside a scatter glb. */
export type ScatterInstance = {
  variant: string
  x: number
  z: number
  /** Rotation around y, radians. */
  yaw: number
  scale: number
}

/**
 * Stand-in solids, in unscaled model metres. The scanned meshes are far too
 * fine to hand to the physics engine, so each variant is stopped by a
 * primitive sitting inside it.
 */
export type PropCollider =
  | { shape: 'cylinder'; halfHeight: number; radius: number }
  | { shape: 'cuboid'; halfExtents: readonly [number, number, number] }

type Props = {
  /** glb whose top-level nodes are named after the variants. */
  url: string
  instances: readonly ScatterInstance[]
  /** Solid for a variant, or null to let the player walk through it. */
  colliderFor: (variant: string) => PropCollider | null
  /** How far each base is sunk into the ground, in metres. */
  embedDepth: number
  castShadow?: boolean
  receiveShadow?: boolean
}

type VariantGroup = { variant: string; mesh: Mesh; count: number }

function colliderHalfHeight(collider: PropCollider): number {
  return collider.shape === 'cylinder' ? collider.halfHeight : collider.halfExtents[1]
}

/**
 * Draws a scattered set of props as one instanced mesh per variant, each sat on
 * the terrain, with a primitive collider per instance.
 *
 * Shared by the horizon silhouettes and the ground props: the two differ only
 * in which glb they load and where their layouts put things.
 */
export function ScatteredProps({
  url,
  instances,
  colliderFor,
  embedDepth,
  castShadow = false,
  receiveShadow = false,
}: Props) {
  const gltf = useLoader(GLTFLoader, url)
  const meshRefs = useRef(new Map<string, InstancedMesh>())

  const groups = useMemo<VariantGroup[]>(() => {
    const counts = new Map<string, number>()
    for (const instance of instances) {
      counts.set(instance.variant, (counts.get(instance.variant) ?? 0) + 1)
    }
    return [...counts.entries()].flatMap(([variant, count]) => {
      const source = gltf.scene.getObjectByName(variant)
      return source instanceof Mesh ? [{ variant, mesh: source, count }] : []
    })
  }, [gltf, instances])

  useLayoutEffect(() => {
    const matrix = new Matrix4()
    const rotation = new Quaternion()
    const position = new Vector3()
    const scale = new Vector3()
    const nextIndex = new Map<string, number>()

    for (const instance of instances) {
      const mesh = meshRefs.current.get(instance.variant)
      if (!mesh) continue
      const index = nextIndex.get(instance.variant) ?? 0
      nextIndex.set(instance.variant, index + 1)
      position.set(instance.x, terrainHeight(instance.x, instance.z) - embedDepth, instance.z)
      rotation.setFromAxisAngle(UP, instance.yaw)
      scale.setScalar(instance.scale)
      mesh.setMatrixAt(index, matrix.compose(position, rotation, scale))
    }

    for (const mesh of meshRefs.current.values()) {
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [instances, groups, embedDepth])

  return (
    <>
      {groups.map(({ variant, mesh, count }) => (
        <instancedMesh
          key={variant}
          ref={(instanced) => {
            if (instanced) meshRefs.current.set(variant, instanced)
            else meshRefs.current.delete(variant)
          }}
          args={[mesh.geometry, mesh.material, count]}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        />
      ))}
      {instances.map((instance, index) => {
        const collider = colliderFor(instance.variant)
        if (!collider) return null
        return (
          <PropSolid
            key={`${instance.variant}-${index}`}
            instance={instance}
            collider={collider}
            embedDepth={embedDepth}
          />
        )
      })}
    </>
  )
}

type SolidProps = { instance: ScatterInstance; collider: PropCollider; embedDepth: number }

/** The simple solid that stops the player, sitting inside the prop. */
function PropSolid({ instance, collider, embedDepth }: SolidProps) {
  const ground = terrainHeight(instance.x, instance.z) - embedDepth
  const centre = ground + colliderHalfHeight(collider) * instance.scale

  return (
    <RigidBody
      type="fixed"
      colliders={false}
      position={[instance.x, centre, instance.z]}
      rotation={[0, instance.yaw, 0]}
    >
      {collider.shape === 'cylinder' ? (
        <CylinderCollider args={[collider.halfHeight * instance.scale, collider.radius * instance.scale]} />
      ) : (
        <CuboidCollider
          args={[
            collider.halfExtents[0] * instance.scale,
            collider.halfExtents[1] * instance.scale,
            collider.halfExtents[2] * instance.scale,
          ]}
        />
      )}
    </RigidBody>
  )
}
