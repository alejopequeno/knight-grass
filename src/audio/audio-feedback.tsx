import { useFrame } from '@react-three/fiber'
import { useSuno } from '@joycostudio/suno/react'
import { useEffect, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import type { Voice } from '@joycostudio/suno'
import type { CharacterHandle } from '../scene/character'
import { AUDIO_KEYS } from './audio-controller'

const RUN_SPEED_THRESHOLD = 6
const MOVE_SPEED_THRESHOLD = 0.4
const WALK_RATE = 0.55
const RUN_RATE = 1.1
const STOP_GRACE_MS = 120
const FADE_MS = 80

type Props = {
  characterRef: RefObject<CharacterHandle | null>
}

// One looping voice of the grass-steps clip. We control:
//  - playbackRate: WALK (slow → more time between footsteps in the clip)
//                  RUN  (full speed)
//  - volume: ramps up while moving, ramps down on stop
// The clip already contains a sequence of footsteps, so per-step triggering
// isn't needed — we just modulate the loop.
export function AudioFeedback({ characterRef }: Props) {
  const suno = useSuno()
  const lastPos = useRef(new THREE.Vector3())
  const initialized = useRef(false)
  const stepsVoice = useRef<Voice | null>(null)
  const lastMoveTime = useRef(0)

  // dispose voice on unmount
  useEffect(() => {
    return () => {
      stepsVoice.current?.stop()
      stepsVoice.current?.dispose()
      stepsVoice.current = null
    }
  }, [])

  useFrame((_, delta) => {
    const char = characterRef.current
    if (!char) return
    if (!suno.isUnlocked) return
    if (!suno.has(AUDIO_KEYS.steps)) return

    const pos = char.getPosition()

    if (!initialized.current) {
      lastPos.current.copy(pos)
      initialized.current = true
      return
    }

    const dx = pos.x - lastPos.current.x
    const dz = pos.z - lastPos.current.z
    const moved = Math.hypot(dx, dz)
    lastPos.current.copy(pos)

    const speed = moved / Math.max(delta, 0.0001)
    const isMoving = speed > MOVE_SPEED_THRESHOLD
    const isRunning = speed > RUN_SPEED_THRESHOLD
    const now = performance.now()
    if (isMoving) lastMoveTime.current = now
    const movedRecently = now - lastMoveTime.current < STOP_GRACE_MS

    // start the loop once when first needed
    if (movedRecently && !stepsVoice.current) {
      const v = suno.get(AUDIO_KEYS.steps).play({
        volume: 0,
        loop: true,
        playbackRate: WALK_RATE,
      })
      stepsVoice.current = v
    }

    const voice = stepsVoice.current
    if (!voice) return

    // target rate / volume
    const targetRate = isRunning ? RUN_RATE : WALK_RATE
    const targetVol = movedRecently ? (isRunning ? 0.85 : 0.55) : 0

    // smooth changes
    voice.setPlaybackRate(targetRate)
    voice.rampVolume(targetVol, FADE_MS / 1000)
  })

  return null
}
