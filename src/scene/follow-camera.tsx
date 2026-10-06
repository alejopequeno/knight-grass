import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { createMovementState, type MovementState } from '../controls/use-keyboard'
import { getCameraShot, type CameraShot } from '../lib/camera-shot'
import { clampCameraHeight } from './camera-clearance'
import type { CharacterHandle } from './character'

// Cinematic shot transitions: blend rate (1/s), slow dolly in while talking.
const IDLE_INPUT: Readonly<MovementState> = createMovementState()
const SHOT_BLEND_RATE = 2.2
const SHOT_BLEND_EPSILON = 0.001
const SHOT_PUSH_IN_M = 0.6
const SHOT_PUSH_IN_S = 12
const CAMERA_DISTANCE = 4.5
const CAMERA_HEIGHT = 1.8
const LOOK_AT_HEIGHT = 1.4
// Time constants (seconds): smaller = snappier follow. Using `1 - exp(-dt/τ)`
// makes it framerate-independent and keeps camera lag < ~0.3m when running.
const POSITION_TAU = 0.08
const TARGET_TAU = 0.05
const MOUSE_SENSITIVITY = 0.0035
// Keyboard orbit speeds (radians per second) for J/L and I/K.
const KEY_YAW_SPEED = 2.2
const KEY_PITCH_SPEED = 1.4
const INITIAL_PITCH = 0.25
const PITCH_MIN = -0.4
const PITCH_MAX = 0.9

type FollowCameraProps = {
  targetRef: RefObject<CharacterHandle | null>
  yawRef: RefObject<number>
  movementRef: RefObject<MovementState>
}

// Narrows or widens the lens, rebuilding the projection only when it changed.
function applyFov(camera: THREE.PerspectiveCamera, fov: number): void {
  if (Math.abs(camera.fov - fov) <= SHOT_BLEND_EPSILON) return
  camera.fov = fov
  camera.updateProjectionMatrix()
}

function axis(positive: boolean, negative: boolean): number {
  return (positive ? 1 : 0) - (negative ? 1 : 0)
}

export function FollowCamera({ targetRef, yawRef, movementRef }: FollowCameraProps) {
  const camera = useThree((state) => state.camera)
  const canvas = useThree((state) => state.gl.domElement)
  const pitchRef = useRef(INITIAL_PITCH)
  const desiredPos = useRef(new THREE.Vector3())
  const currentPos = useRef(new THREE.Vector3(0, 5, 10))
  const lookTarget = useRef(new THREE.Vector3())
  const currentLook = useRef(new THREE.Vector3())
  const heldShotRef = useRef<CameraShot | null>(null)
  const shotBlendRef = useRef(0)
  const shotTimeRef = useRef(0)
  const shotPos = useRef(new THREE.Vector3())
  const shotLook = useRef(new THREE.Vector3())
  const shotDir = useRef(new THREE.Vector3())
  const baseFovRef = useRef<number | null>(null)

  useEffect(() => {
    const isLocked = () => document.pointerLockElement === canvas

    const handleClick = () => {
      if (!isLocked()) void canvas.requestPointerLock()
    }

    const handleMouseMove = (event: MouseEvent) => {
      // A cinematic shot at a story place holds the camera still.
      if (!isLocked() || getCameraShot()) return
      yawRef.current -= event.movementX * MOUSE_SENSITIVITY
      pitchRef.current = THREE.MathUtils.clamp(
        pitchRef.current + event.movementY * MOUSE_SENSITIVITY,
        PITCH_MIN,
        PITCH_MAX,
      )
    }

    canvas.addEventListener('click', handleClick)
    document.addEventListener('mousemove', handleMouseMove)

    return () => {
      canvas.removeEventListener('click', handleClick)
      document.removeEventListener('mousemove', handleMouseMove)
    }
  }, [canvas, yawRef])

  useFrame((_, delta) => {
    const target = targetRef.current
    if (!target) return

    const shot = getCameraShot()
    // Free look everywhere except while a story place is framed.
    const input = shot ? IDLE_INPUT : movementRef.current
    const yawInput = axis(input.lookLeft, input.lookRight)
    const pitchInput = axis(input.lookDown, input.lookUp)
    yawRef.current += yawInput * KEY_YAW_SPEED * delta
    pitchRef.current = THREE.MathUtils.clamp(
      // Looking up lowers the camera (smaller pitch), like moving the mouse up.
      pitchRef.current + pitchInput * KEY_PITCH_SPEED * delta,
      PITCH_MIN,
      PITCH_MAX,
    )

    const pos = target.getPosition()
    const yaw = yawRef.current
    const pitch = pitchRef.current
    const horizontalDistance = CAMERA_DISTANCE * Math.cos(pitch)
    const verticalOffset = CAMERA_DISTANCE * Math.sin(pitch)

    desiredPos.current.set(
      pos.x - Math.sin(yaw) * horizontalDistance,
      pos.y + CAMERA_HEIGHT + verticalOffset,
      pos.z - Math.cos(yaw) * horizontalDistance,
    )

    const posAlpha = 1 - Math.exp(-delta / POSITION_TAU)
    const lookAlpha = 1 - Math.exp(-delta / TARGET_TAU)

    currentPos.current.lerp(desiredPos.current, posAlpha)
    currentPos.current.y = clampCameraHeight(currentPos.current.y, currentPos.current.x, currentPos.current.z)
    lookTarget.current.set(pos.x, pos.y + LOOK_AT_HEIGHT, pos.z)
    currentLook.current.lerp(lookTarget.current, lookAlpha)

    // Cinematic shot: glide into the framed angle, push in slowly while the
    // story talks, then hand back to the follow camera.
    if (shot && shot !== heldShotRef.current) {
      heldShotRef.current = shot
      shotTimeRef.current = 0
    }
    shotTimeRef.current += delta
    shotBlendRef.current = THREE.MathUtils.damp(shotBlendRef.current, shot ? 1 : 0, SHOT_BLEND_RATE, delta)
    const held = heldShotRef.current
    const blend = THREE.MathUtils.smoothstep(shotBlendRef.current, 0, 1)
    if (camera instanceof THREE.PerspectiveCamera) {
      baseFovRef.current ??= camera.fov
      applyFov(camera, held ? THREE.MathUtils.lerp(baseFovRef.current, held.fov, blend) : baseFovRef.current)
    }
    if (held && blend > SHOT_BLEND_EPSILON) {
      const pushIn = Math.min(shotTimeRef.current / SHOT_PUSH_IN_S, 1) * SHOT_PUSH_IN_M
      shotPos.current.copy(held.position).addScaledVector(shotDir.current.subVectors(held.target, held.position).normalize(), pushIn)
      camera.position.lerpVectors(currentPos.current, shotPos.current, blend)
      shotLook.current.lerpVectors(currentLook.current, held.target, blend)
      camera.lookAt(shotLook.current)
      return
    }
    camera.position.copy(currentPos.current)
    camera.lookAt(currentLook.current)
  })

  return null
}
