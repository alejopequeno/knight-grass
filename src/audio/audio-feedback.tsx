import { useFrame } from '@react-three/fiber'
import { useSuno } from '@joycostudio/suno/react'
import { useRef, type RefObject } from 'react'
import { characterFeet } from '../lib/character-capsules'
import { terrainHeight } from '../lib/terrain'
import type { CharacterHandle } from '../scene/character'
import { FOOTSTEP_KEYS, type FootstepKey } from './audio-manifest'
import { createFootTracker, createStepGate, type FootThresholds } from './footstep-detector'
import { footstepGait } from './footstep-gait'
import { createSpeedMeter } from './speed-meter'

const FOOT_THRESHOLDS: FootThresholds = { plantAbove: 0.04, liftAbove: 0.1, baselineRisePerSecond: 0.15 }
const WALK_VOLUME = 0.55
const RUN_VOLUME = 0.9
const VOLUME_JITTER = 0.15
const RATE_JITTER = 0.08
const RUN_RATE = 1.08
const MIN_STEP_INTERVAL_S = 0.25

type Props = {
  characterRef: RefObject<CharacterHandle | null>
}

function pickFootstep(previous: FootstepKey | null): FootstepKey {
  const candidates = FOOTSTEP_KEYS.filter((key) => key !== previous)
  return candidates[Math.floor(Math.random() * candidates.length)]
}

function jitter(amount: number): number {
  return 1 + (Math.random() * 2 - 1) * amount
}

// One footstep sample per foot plant, detected from the animated ankle
// heights — so every sound lands exactly when a foot touches the ground.
export function AudioFeedback({ characterRef }: Props) {
  const suno = useSuno()
  const speedMeter = useRef(createSpeedMeter())
  const leftFoot = useRef(createFootTracker(FOOT_THRESHOLDS))
  const rightFoot = useRef(createFootTracker(FOOT_THRESHOLDS))
  const lastSample = useRef<FootstepKey | null>(null)
  const stepGate = useRef(createStepGate(MIN_STEP_INTERVAL_S))

  useFrame(({ clock }, delta) => {
    const character = characterRef.current
    if (!character || !characterFeet.ready) return

    const position = character.getPosition()
    const speed = speedMeter.current.update(position.x, position.z, delta)
    const gait = footstepGait(speed)

    const { left, right } = characterFeet
    const leftLanded = leftFoot.current.update(left.y - terrainHeight(left.x, left.z), delta)
    const rightLanded = rightFoot.current.update(right.y - terrainHeight(right.x, right.z), delta)
    if (gait === 'still' || !(leftLanded || rightLanded)) return
    if (!suno.isUnlocked || !stepGate.current.tryStep(clock.elapsedTime)) return

    const key = pickFootstep(lastSample.current)
    if (!suno.has(key)) return
    lastSample.current = key
    const running = gait === 'run'
    suno.get(key).play({
      volume: (running ? RUN_VOLUME : WALK_VOLUME) * jitter(VOLUME_JITTER),
      playbackRate: (running ? RUN_RATE : 1) * jitter(RATE_JITTER),
    })
  })

  return null
}
