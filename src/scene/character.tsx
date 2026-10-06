import { useFrame } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { Suspense, useCallback, useImperativeHandle, useRef, type Ref, type RefObject } from 'react'
import * as THREE from 'three'
import { createMovementState, type MovementState } from '../controls/use-keyboard'
import { isControlLocked } from '../lib/control-lock'
import { MOVING_THRESHOLD, RUN_SPEED, RUNNING_THRESHOLD, WALK_SPEED } from '../lib/movement'
import { terrainHeight } from '../lib/terrain'
import { clampToWorld } from '../lib/world'
import { Paladin, type PaladinState } from './paladin'

const BLOCK_SPEED_MULT = 0
// Exponential damping rates (1/s) — framerate-independent smoothing via
// THREE.MathUtils.damp. Tuned to match the old 60fps per-frame lerps.
const VELOCITY_DAMPING = 13.4
const ROTATION_DAMPING = 11.9
const REF_WALK_SPEED = 2.1
const REF_RUN_SPEED = 7.0
const REF_STRAFE_SPEED = 2.1

const JUMP_VELOCITY = 9
// Capsule: half-height of the cylinder + radius = distance from the body
// centre to the feet.
const CAPSULE_HALF_HEIGHT = 0.5
const CAPSULE_RADIUS = 0.4
const FEET_OFFSET = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS
const GROUNDED_TOLERANCE = 0.15
const MAX_GROUNDED_VERTICAL_SPEED = 1
const SPAWN_HEIGHT = 5

// Runs before the paladin (priority 0) so bones are read after the body moves.
const CHARACTER_FRAME_PRIORITY = -1

// Input used while controls are locked: nothing held, nothing pressed.
const IDLE_INPUT: Readonly<MovementState> = createMovementState()

const IDLE_VARIANT_MIN_S = 7
const IDLE_VARIANT_MAX_S = 14

export type CharacterHandle = {
  getPosition: () => THREE.Vector3
  getRotation: () => number
}

type CharacterProps = {
  ref: Ref<CharacterHandle>
  movementRef: RefObject<MovementState>
  cameraYawRef: RefObject<number>
}

function randomIdleSwapDelay(): number {
  return IDLE_VARIANT_MIN_S + Math.random() * (IDLE_VARIANT_MAX_S - IDLE_VARIANT_MIN_S)
}

function shortestAngle(from: number, to: number): number {
  let diff = to - from
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  return diff
}

function isGrounded(position: THREE.Vector3Like, verticalSpeed: number): boolean {
  const feetY = position.y - FEET_OFFSET
  const gap = feetY - terrainHeight(position.x, position.z)
  return gap < GROUNDED_TOLERANCE && Math.abs(verticalSpeed) < MAX_GROUNDED_VERTICAL_SPEED
}

export function Character({ ref, movementRef, cameraYawRef }: CharacterProps) {
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
  // Cleared when the animator reports the one-shot finished.
  const actionLock = useRef<PaladinState | null>(null)

  const idlePose = useRef<'idle' | 'idle2'>('idle')
  const idleDwell = useRef(0)
  const idleSwapAt = useRef(0)

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
    const raw = movementRef.current
    // While the story talks the paladin holds still: presses are dropped,
    // not queued, so nothing fires the moment control returns.
    const locked = isControlLocked()
    if (locked) {
      raw.jumpPressed = false
      raw.attackPressed = false
    }
    const m = locked ? IDLE_INPUT : raw
    if (!body || !mesh) return

    const position = body.translation()
    const linvel = body.linvel()
    const grounded = isGrounded(position, linvel.y)

    const inputX = (m.right ? 1 : 0) - (m.left ? 1 : 0)
    const inputZ = (m.backward ? 1 : 0) - (m.forward ? 1 : 0)
    const hasInput = inputX !== 0 || inputZ !== 0
    const isPureLateral = inputX !== 0 && inputZ === 0

    // Consume edge-triggered inputs.
    let verticalVelocity = linvel.y
    if (m.jumpPressed) {
      raw.jumpPressed = false
      if (grounded && actionLock.current !== 'attack') {
        verticalVelocity = JUMP_VELOCITY
        actionLock.current = 'jump'
      }
    }
    if (m.attackPressed) {
      raw.attackPressed = false
      if (actionLock.current === null) actionLock.current = 'attack'
    }

    const isBlocking = m.block && actionLock.current === null
    const baseSpeed = m.run ? RUN_SPEED : WALK_SPEED
    const speed = isBlocking ? baseSpeed * BLOCK_SPEED_MULT : baseSpeed

    let targetX = 0
    let targetZ = 0

    if (hasInput) {
      const yaw = cameraYawRef.current
      const length = Math.hypot(inputX, inputZ)
      const normX = inputX / length
      const normZ = inputZ / length

      const forwardX = Math.sin(yaw)
      const forwardZ = Math.cos(yaw)
      // Screen-right relative to the camera.
      const rightX = -forwardZ
      const rightZ = forwardX

      const worldX = -normZ * forwardX + normX * rightX
      const worldZ = -normZ * forwardZ + normX * rightZ

      targetX = worldX * speed
      targetZ = worldZ * speed
      targetRotation.current = isPureLateral ? yaw : Math.atan2(worldX, worldZ)
    }

    const velocity = currentVelocity.current
    velocity.x = THREE.MathUtils.damp(velocity.x, targetX, VELOCITY_DAMPING, delta)
    velocity.z = THREE.MathUtils.damp(velocity.z, targetZ, VELOCITY_DAMPING, delta)

    // World bounds: stop at the edge instead of walking off the ground mesh.
    const clampedX = clampToWorld(position.x)
    const clampedZ = clampToWorld(position.z)
    if (clampedX !== position.x) velocity.x = 0
    if (clampedZ !== position.z) velocity.z = 0
    if (clampedX !== position.x || clampedZ !== position.z) {
      body.setTranslation({ x: clampedX, y: position.y, z: clampedZ }, true)
    }

    body.setLinvel({ x: velocity.x, y: verticalVelocity, z: velocity.z }, true)

    if (hasInput) {
      const diff = shortestAngle(currentRotation.current, targetRotation.current)
      currentRotation.current += diff * (1 - Math.exp(-ROTATION_DAMPING * delta))
      mesh.rotation.y = currentRotation.current
    }

    mesh.position.set(clampedX, position.y - FEET_OFFSET, clampedZ)

    // Next anim state — priority: lock > block > strafe > run > walk > idle.
    const horizSpeed = Math.hypot(velocity.x, velocity.z)
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
      if (idleSwapAt.current === 0) idleSwapAt.current = randomIdleSwapDelay()
      idleDwell.current += delta
      if (idleDwell.current >= idleSwapAt.current) {
        idlePose.current = idlePose.current === 'idle' ? 'idle2' : 'idle'
        idleDwell.current = 0
        idleSwapAt.current = randomIdleSwapDelay()
        nextState = idlePose.current
      }
    } else {
      idleDwell.current = 0
    }

    animStateRef.current = nextState
    animSpeedRef.current = nextSpeed
  }, CHARACTER_FRAME_PRIORITY)

  return (
    <>
      <RigidBody
        ref={bodyRef}
        colliders={false}
        position={[0, SPAWN_HEIGHT, 0]}
        enabledRotations={[false, false, false]}
        linearDamping={0.5}
        // Continuous collision detection: never fall through the heightfield.
        ccd
        mass={1}
      >
        <CapsuleCollider args={[CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS]} />
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
}
