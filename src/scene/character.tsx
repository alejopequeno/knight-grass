import { useFrame } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { forwardRef, Suspense, useCallback, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import type { MovementState } from '../controls/use-keyboard'
import { Paladin, type PaladinState } from './paladin'

const WALK_SPEED = 3.0
const RUN_SPEED = 5.5
const BLOCK_SPEED_MULT = 0
const ROTATION_LERP = 0.18
const VELOCITY_LERP = 0.2
const MOVING_THRESHOLD = 0.4
const RUNNING_THRESHOLD = 4
const REF_WALK_SPEED = 2.1
const REF_RUN_SPEED = 7.0
const REF_STRAFE_SPEED = 2.1

const JUMP_IMPULSE = 9
const IDLE_VARIANT_MIN_S = 7
const IDLE_VARIANT_MAX_S = 14

export type CharacterHandle = {
  getPosition: () => THREE.Vector3
  getRotation: () => number
}

type CharacterProps = {
  movement: React.RefObject<MovementState>
  cameraYawRef: React.RefObject<number>
}

export const Character = forwardRef<CharacterHandle, CharacterProps>(function Character(
  { movement, cameraYawRef },
  ref,
) {
  const bodyRef = useRef<RapierRigidBody>(null)
  const meshRef = useRef<THREE.Group>(null)
  const currentVelocity = useRef(new THREE.Vector3())
  const targetRotation = useRef(0)
  const currentRotation = useRef(0)
  const positionVec = useRef(new THREE.Vector3())

  // Anim state lives in a ref polled by Paladin every frame — no React
  // renders for state changes.
  const animStateRef = useRef<PaladinState>('idle')
  const animSpeedRef = useRef(1)

  // One-shot lock: while non-null, animStateRef stays pinned to this value.
  // Cleared by the Paladin's onActionFinished callback (called on the
  // last-frame timer in Paladin's useFrame).
  const actionLock = useRef<PaladinState | null>(null)

  const idlePose = useRef<'idle' | 'idle2'>('idle')
  const idleDwell = useRef(0)
  const idleSwapAt = useRef(
    IDLE_VARIANT_MIN_S + Math.random() * (IDLE_VARIANT_MAX_S - IDLE_VARIANT_MIN_S),
  )

  const handleActionFinished = useCallback((finished: PaladinState) => {
    if (actionLock.current === finished) actionLock.current = null
  }, [])

  useImperativeHandle(ref, () => ({
    getPosition: () => {
      if (bodyRef.current) {
        const t = bodyRef.current.translation()
        positionVec.current.set(t.x, t.y, t.z)
      }
      return positionVec.current
    },
    getRotation: () => currentRotation.current,
  }))

  useFrame((_, delta) => {
    const body = bodyRef.current
    const mesh = meshRef.current
    const m = movement.current
    if (!body || !mesh || !m) return

    const inputX = (m.right ? 1 : 0) - (m.left ? 1 : 0)
    const inputZ = (m.backward ? 1 : 0) - (m.forward ? 1 : 0)
    const hasInput = inputX !== 0 || inputZ !== 0
    const isPureLateral = inputX !== 0 && inputZ === 0

    // Consume edge-triggered inputs.
    if (m.jumpPressed) {
      m.jumpPressed = false
      if (actionLock.current !== 'attack') {
        const linvel = body.linvel()
        body.setLinvel({ x: linvel.x, y: JUMP_IMPULSE, z: linvel.z }, true)
        actionLock.current = 'jump'
      }
    }
    if (m.attackPressed) {
      m.attackPressed = false
      if (actionLock.current === null) {
        actionLock.current = 'attack'
      }
    }

    const isBlocking = m.block && actionLock.current === null
    const baseSpeed = m.run ? RUN_SPEED : WALK_SPEED
    const speed = isBlocking ? baseSpeed * BLOCK_SPEED_MULT : baseSpeed

    let targetX = 0
    let targetZ = 0

    if (hasInput) {
      const yaw = cameraYawRef.current ?? 0
      const length = Math.hypot(inputX, inputZ)
      const normX = inputX / length
      const normZ = inputZ / length

      const forwardX = Math.sin(yaw)
      const forwardZ = Math.cos(yaw)
      // Right vector = forward rotated 90° for screen-right relative to the
      // camera. The previous formula (rightX=forwardZ, rightZ=-forwardX)
      // pointed in the opposite direction, which made D move you to
      // screen-left and A to screen-right.
      const rightX = -forwardZ
      const rightZ = forwardX

      const worldX = -normZ * forwardX + normX * rightX
      const worldZ = -normZ * forwardZ + normX * rightZ

      targetX = worldX * speed
      targetZ = worldZ * speed

      if (isPureLateral) {
        targetRotation.current = yaw
      } else {
        targetRotation.current = Math.atan2(worldX, worldZ)
      }
    }

    currentVelocity.current.x = THREE.MathUtils.lerp(
      currentVelocity.current.x,
      targetX,
      VELOCITY_LERP,
    )
    currentVelocity.current.z = THREE.MathUtils.lerp(
      currentVelocity.current.z,
      targetZ,
      VELOCITY_LERP,
    )

    const linvel = body.linvel()
    body.setLinvel(
      { x: currentVelocity.current.x, y: linvel.y, z: currentVelocity.current.z },
      true,
    )

    if (hasInput) {
      let diff = targetRotation.current - currentRotation.current
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      currentRotation.current += diff * ROTATION_LERP
      mesh.rotation.y = currentRotation.current
    }

    const t = body.translation()
    mesh.position.set(t.x, t.y - 0.9, t.z)

    // Compute next anim state — priority: lock > block > strafe > run > walk > idle.
    const horizSpeed = Math.hypot(currentVelocity.current.x, currentVelocity.current.z)
    let nextState: PaladinState = idlePose.current
    let nextSpeed = 1

    if (actionLock.current) {
      nextState = actionLock.current
    } else if (isBlocking) {
      nextState = 'block'
    } else if (isPureLateral && horizSpeed > MOVING_THRESHOLD) {
      nextState = m.right ? 'strafeRight' : 'strafeLeft'
      nextSpeed = horizSpeed / REF_STRAFE_SPEED
    } else if (horizSpeed > RUNNING_THRESHOLD) {
      nextState = 'run'
      nextSpeed = horizSpeed / REF_RUN_SPEED
    } else if (horizSpeed > MOVING_THRESHOLD) {
      nextState = 'walk'
      nextSpeed = horizSpeed / REF_WALK_SPEED
    }

    if (nextState === 'idle' || nextState === 'idle2') {
      idleDwell.current += delta
      if (idleDwell.current >= idleSwapAt.current) {
        idlePose.current = idlePose.current === 'idle' ? 'idle2' : 'idle'
        idleDwell.current = 0
        idleSwapAt.current =
          IDLE_VARIANT_MIN_S +
          Math.random() * (IDLE_VARIANT_MAX_S - IDLE_VARIANT_MIN_S)
        nextState = idlePose.current
      }
    } else {
      idleDwell.current = 0
    }

    animStateRef.current = nextState
    animSpeedRef.current = nextSpeed

    ;(window as unknown as { __debugChar?: { x: number; y: number; z: number } }).__debugChar = {
      x: t.x,
      y: t.y,
      z: t.z,
    }
  })

  return (
    <>
      <RigidBody
        ref={bodyRef}
        colliders={false}
        position={[0, 5, 0]}
        enabledRotations={[false, false, false]}
        linearDamping={0.5}
        mass={1}
      >
        <CapsuleCollider args={[0.5, 0.4]} />
      </RigidBody>

      <group ref={meshRef}>
        <Suspense fallback={null}>
          <Paladin
            stateRef={animStateRef}
            speedRef={animSpeedRef}
            onActionFinished={handleActionFinished}
          />
        </Suspense>
      </group>
    </>
  )
})
