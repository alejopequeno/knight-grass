import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  PALADIN_STATES,
  PaladinAnimator,
  type PaladinClips,
  type PaladinState,
} from './paladin-animator'
import { mapPaladinStates } from './paladin-states'

const FRAME_S = 1 / 60
const FULL_WEIGHT_TOLERANCE = 1e-3

// Real clip lengths from public/models/*.fbx so the timing matches the game.
const CLIP_DURATIONS_S: Record<PaladinState, number> = {
  idle: 3.53,
  idle2: 7.47,
  walk: 1.1,
  run: 0.7,
  strafeLeft: 1.3,
  strafeRight: 1.13,
  jump: 0.83,
  attack: 1.3,
  block: 1.37,
}

function buildClips(): PaladinClips {
  return mapPaladinStates((state) => {
    const duration = CLIP_DURATIONS_S[state]
    const angle = (PALADIN_STATES.indexOf(state) + 1) * 0.1
    const start = new THREE.Quaternion()
    const end = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle)
    const track = new THREE.QuaternionKeyframeTrack(
      'bone.quaternion',
      [0, duration],
      [...start.toArray(), ...end.toArray()],
    )
    return new THREE.AnimationClip(state, duration, [track])
  })
}

function buildRig(): THREE.Object3D {
  const root = new THREE.Object3D()
  const bone = new THREE.Object3D()
  bone.name = 'bone'
  root.add(bone)
  return root
}

// Mirrors Character: a one-shot request pins the desired state until the
// animator reports it finished, then the consumer falls back to `rest`.
function simulateOneShot(
  oneShot: PaladinState,
  rest: PaladinState,
  seconds: number,
): number[] {
  let lock: PaladinState | null = null
  const animator = new PaladinAnimator(buildRig(), buildClips(), (finished) => {
    if (lock === finished) lock = null
  })
  const weights: number[] = []

  for (let t = 0; t < seconds; t += FRAME_S) {
    if (t >= 0.5 && t < 0.5 + FRAME_S) lock = oneShot
    animator.update(lock ?? rest, 1, FRAME_S)
    weights.push(animator.appliedWeight())
  }
  return weights
}

describe('PaladinAnimator', () => {
  it.each<[PaladinState, PaladinState]>([
    ['attack', 'idle'],
    ['jump', 'idle'],
    ['attack', 'walk'],
    ['jump', 'run'],
  ])('keeps full pose weight through %s → %s (no bind-pose flash)', (oneShot, rest) => {
    const weights = simulateOneShot(oneShot, rest, 4)
    const minWeight = Math.min(...weights)
    expect(minWeight).toBeGreaterThan(1 - FULL_WEIGHT_TOLERANCE)
  })

  it('reports the one-shot as finished exactly once', () => {
    const finished: PaladinState[] = []
    let lock: PaladinState | null = 'attack'
    const animator = new PaladinAnimator(buildRig(), buildClips(), (state) => {
      finished.push(state)
      if (lock === state) lock = null
    })
    for (let t = 0; t < 3; t += FRAME_S) animator.update(lock ?? 'idle', 1, FRAME_S)
    expect(finished).toEqual(['attack'])
    expect(animator.state).toBe('idle')
  })
})
