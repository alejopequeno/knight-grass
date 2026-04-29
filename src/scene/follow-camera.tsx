import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { CharacterHandle } from './character'

const CAMERA_DISTANCE = 4.5
const CAMERA_HEIGHT = 1.8
// Time constants (seconds): smaller = snappier follow. With the character
// running at 9 m/s, a fixed per-frame lerp got outrun. Using `1 - exp(-dt/τ)`
// makes it framerate-independent and these values keep camera lag < ~0.3m.
const POSITION_TAU = 0.08
const TARGET_TAU = 0.05
const MOUSE_SENSITIVITY = 0.0035
const PITCH_MIN = -0.4
const PITCH_MAX = 0.9

type FollowCameraProps = {
  targetRef: React.RefObject<CharacterHandle | null>
  yawRef: React.RefObject<number>
}

export function FollowCamera({ targetRef, yawRef }: FollowCameraProps) {
  const { camera, gl } = useThree()
  const pitchRef = useRef(0.25)
  const desiredPos = useRef(new THREE.Vector3())
  const currentPos = useRef(new THREE.Vector3(0, 5, 10))
  const lookTarget = useRef(new THREE.Vector3())
  const currentLook = useRef(new THREE.Vector3())
  const isPointerLocked = useRef(false)

  useEffect(() => {
    const canvas = gl.domElement

    const handleClick = () => {
      if (!isPointerLocked.current) {
        canvas.requestPointerLock()
      }
    }

    const handlePointerLockChange = () => {
      isPointerLocked.current = document.pointerLockElement === canvas
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!isPointerLocked.current) return
      yawRef.current -= event.movementX * MOUSE_SENSITIVITY
      pitchRef.current = THREE.MathUtils.clamp(
        pitchRef.current + event.movementY * MOUSE_SENSITIVITY,
        PITCH_MIN,
        PITCH_MAX,
      )
    }

    canvas.addEventListener('click', handleClick)
    document.addEventListener('pointerlockchange', handlePointerLockChange)
    document.addEventListener('mousemove', handleMouseMove)

    return () => {
      canvas.removeEventListener('click', handleClick)
      document.removeEventListener('pointerlockchange', handlePointerLockChange)
      document.removeEventListener('mousemove', handleMouseMove)
    }
  }, [gl, yawRef])

  useFrame((_, delta) => {
    const target = targetRef.current
    if (!target) return

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
    camera.position.copy(currentPos.current)

    lookTarget.current.set(pos.x, pos.y + 1.4, pos.z)
    currentLook.current.lerp(lookTarget.current, lookAlpha)
    camera.lookAt(currentLook.current)
  })

  return null
}
