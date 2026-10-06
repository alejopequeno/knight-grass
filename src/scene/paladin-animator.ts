import * as THREE from 'three'
import { mapPaladinStates } from './paladin-states'

export const PALADIN_STATES = [
  'idle',
  'idle2',
  'walk',
  'run',
  'strafeLeft',
  'strafeRight',
  'jump',
  'attack',
  'block',
] as const

export type PaladinState = (typeof PALADIN_STATES)[number]

export type PaladinClips = Record<PaladinState, THREE.AnimationClip>

const ONE_SHOT_STATES: ReadonlySet<PaladinState> = new Set(['jump', 'attack'])
const SPEED_DRIVEN_STATES: ReadonlySet<PaladinState> = new Set([
  'walk',
  'run',
  'strafeLeft',
  'strafeRight',
])

// Fade durations tuned per transition type. Movement↔movement uses a longer
// crossfade (the eye is more sensitive to gait blending) while one-shots
// snap in/out a bit faster so attacks/jumps feel responsive.
export const FADE_MOVEMENT_S = 0.4
export const FADE_ONE_SHOT_S = 0.18
const NOTIFY_LEAD_S = 0.1
const MIN_NOTIFY_AT_S = 0.1
// Hard safety: if a one-shot somehow runs longer than this multiple of its
// clip duration without notifying, we force-fire the callback so the
// consumer's action lock can never get stuck.
const ONE_SHOT_SAFETY_MULT = 1.5

type OneShotTimer = {
  state: PaladinState
  elapsed: number
  duration: number
  notified: boolean
}

export function isOneShot(state: PaladinState): boolean {
  return ONE_SHOT_STATES.has(state)
}

// Owns the AnimationMixer and every crossfade decision for the paladin.
// Framework-agnostic: the React component only feeds it the desired state,
// the playback speed and the frame delta.
export class PaladinAnimator {
  readonly mixer: THREE.AnimationMixer
  private readonly actions: Record<PaladinState, THREE.AnimationAction>
  private current: PaladinState = 'idle'
  private oneShot: OneShotTimer | null = null
  private readonly onActionFinished: (state: PaladinState) => void

  constructor(
    root: THREE.Object3D,
    clips: PaladinClips,
    onActionFinished: (state: PaladinState) => void,
  ) {
    this.mixer = new THREE.AnimationMixer(root)
    this.onActionFinished = onActionFinished
    this.actions = mapPaladinStates((state) => {
      const action = this.mixer.clipAction(clips[state])
      if (isOneShot(state)) {
        action.setLoop(THREE.LoopOnce, 1)
        // Hold the last frame instead of disabling the action. Without the
        // clamp, three sets `enabled = false` the instant the clip ends —
        // usually mid fade-out — and PropertyMixer fills the missing weight
        // with the bind pose, which reads as a T-pose flash.
        action.clampWhenFinished = true
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity)
      }
      return action
    })
    this.actions.idle.play()
  }

  get state(): PaladinState {
    return this.current
  }

  // Sum of the weights the mixer actually applied last frame. Anything below
  // 1 is filled with the bind pose (T-pose) by THREE.PropertyMixer.
  appliedWeight(): number {
    let total = 0
    for (const state of PALADIN_STATES) {
      const action = this.actions[state]
      if (action.isScheduled()) total += action.getEffectiveWeight()
    }
    return total
  }

  update(desired: PaladinState, speed: number, delta: number): void {
    for (const state of SPEED_DRIVEN_STATES) {
      this.actions[state].setEffectiveTimeScale(speed)
    }

    if (desired !== this.current) this.transitionTo(desired, speed)
    this.tickOneShot(delta)
    this.mixer.update(delta)
  }

  dispose(): void {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.mixer.getRoot())
  }

  private transitionTo(next: PaladinState, speed: number): void {
    const from = this.actions[this.current]
    const to = this.actions[next]
    const enteringOneShot = isOneShot(next)
    const leavingOneShot = isOneShot(this.current)
    const timeScale = SPEED_DRIVEN_STATES.has(next) ? speed : 1

    if (!enteringOneShot && !leavingOneShot) {
      // Smooth gait blend. Don't reset `to.time` so walk/run/strafe stay in
      // phase; warp=true morphs the cycle period instead of snapping it.
      to.enabled = true
      to.setEffectiveTimeScale(timeScale)
      to.setEffectiveWeight(1)
      to.play()
      from.crossFadeTo(to, FADE_MOVEMENT_S, true)
    } else {
      // One-shots start from t=0, and the state after a one-shot starts
      // fresh too so the previous pose doesn't bleed through.
      const fade = enteringOneShot ? FADE_ONE_SHOT_S : FADE_MOVEMENT_S
      from.fadeOut(fade)
      to.reset()
      to.setEffectiveTimeScale(timeScale)
      to.setEffectiveWeight(1)
      to.fadeIn(fade)
      to.play()
    }

    this.current = next
    this.oneShot = enteringOneShot
      ? { state: next, elapsed: 0, duration: to.getClip().duration, notified: false }
      : null
  }

  private tickOneShot(delta: number): void {
    const timer = this.oneShot
    if (!timer || timer.notified) return

    timer.elapsed += delta
    const notifyAt = Math.max(MIN_NOTIFY_AT_S, timer.duration - NOTIFY_LEAD_S)
    const safetyAt = timer.duration * ONE_SHOT_SAFETY_MULT
    if (timer.elapsed >= notifyAt || timer.elapsed >= safetyAt) {
      timer.notified = true
      this.onActionFinished(timer.state)
    }
  }
}
