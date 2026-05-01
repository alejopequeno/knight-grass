import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

const MODEL_URL = '/models/paladin.fbx'
const ANIM_URLS = {
  idle: '/models/anim-idle.fbx',
  idle2: '/models/anim-idle2.fbx',
  walk: '/models/anim-walk.fbx',
  run: '/models/anim-run.fbx',
  strafeLeft: '/models/anim-strafe-left.fbx',
  strafeRight: '/models/anim-strafe-right.fbx',
  jump: '/models/anim-jump.fbx',
  attack: '/models/anim-attack.fbx',
  block: '/models/anim-block.fbx',
} as const

export type PaladinState = keyof typeof ANIM_URLS

const ONE_SHOT_STATES: ReadonlySet<PaladinState> = new Set(['jump', 'attack'])

type Props = {
  // Polled each frame. Avoids React-render race when transitions happen
  // mid-frame (the previous attempt with a state prop + setState had subtle
  // batching issues that left the action lock stuck).
  stateRef: React.RefObject<PaladinState>
  speedRef?: React.RefObject<number>
  // Fires when a one-shot action (jump/attack) finishes playing — the
  // consumer should clear whatever lock kept the stateRef pinned to it.
  onActionFinished?: (state: PaladinState) => void
}

// Fade durations tuned per transition type. Movement↔movement uses a longer
// crossfade (the eye is more sensitive to gait blending) while one-shots
// snap in/out a bit faster so attacks/jumps feel responsive.
const FADE_MOVEMENT = 0.4
const FADE_ONESHOT = 0.18
const SPEED_LERP = 0.15
// Hard safety: if a one-shot somehow runs longer than this multiple of its
// clip duration without notifying, we force-fire the callback. Prevents the
// "everything frozen" failure mode if anything in the animation pipeline
// goes sideways.
const ONE_SHOT_SAFETY_MULT = 1.5

type ClipBundle = Record<PaladinState, THREE.AnimationClip>
type ActionBundle = Record<PaladinState, THREE.AnimationAction>

type LoadedAssets = {
  model: THREE.Group
  mixer: THREE.AnimationMixer
  actions: ActionBundle
}

function loadFbx(url: string): Promise<THREE.Group> {
  const loader = new FBXLoader()
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (obj) => resolve(obj),
      undefined,
      (err) => reject(err),
    )
  })
}

function stripRootMotion(clip: THREE.AnimationClip): THREE.AnimationClip {
  clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.position'))
  return clip
}

const STATE_KEYS = Object.keys(ANIM_URLS) as PaladinState[]
const SPEED_DRIVEN: ReadonlySet<PaladinState> = new Set([
  'walk',
  'run',
  'strafeLeft',
  'strafeRight',
])

export function Paladin({ stateRef, speedRef, onActionFinished }: Props) {
  const [assets, setAssets] = useState<LoadedAssets | null>(null)
  const currentActionKey = useRef<PaladinState>('idle')
  const smoothedSpeed = useRef(1)
  const onFinishedRef = useRef(onActionFinished)
  onFinishedRef.current = onActionFinished

  const oneShot = useRef<{
    key: PaladinState
    elapsed: number
    duration: number
    notified: boolean
  } | null>(null)

  useEffect(() => {
    let cancelled = false

    const safeLoad = (url: string) =>
      loadFbx(url).then(
        (g) => g,
        (err) => {
          console.error(`[paladin] failed to load ${url}:`, err)
          return null
        },
      )

    Promise.all([
      loadFbx(MODEL_URL),
      ...STATE_KEYS.map((key) => safeLoad(ANIM_URLS[key])),
    ])
      .then(([modelRaw, ...animRaws]) => {
        if (cancelled) return

        const skinnedMeshes: THREE.SkinnedMesh[] = []
        modelRaw.traverse((obj) => {
          const sm = obj as THREE.SkinnedMesh
          if (sm.isSkinnedMesh) {
            sm.castShadow = true
            sm.receiveShadow = false
            sm.frustumCulled = false
            skinnedMeshes.push(sm)
          }
        })

        const idleRaw = animRaws[STATE_KEYS.indexOf('idle')]
        const idleClipFallback = idleRaw?.animations[0]
        if (!idleClipFallback) {
          console.error('[paladin] idle clip missing — cannot continue')
          return
        }

        const clips = {} as ClipBundle
        for (let i = 0; i < STATE_KEYS.length; i++) {
          const key = STATE_KEYS[i]
          const raw = animRaws[i]
          const clip = raw?.animations[0]
          if (!clip) {
            console.warn(`[paladin] no clip for "${key}" — falling back to idle`)
            clips[key] = stripRootMotion(idleClipFallback.clone())
          } else {
            clips[key] = stripRootMotion(clip)
          }
        }

        const sharedSkeleton = skinnedMeshes
          .slice()
          .sort((a, b) => b.skeleton.bones.length - a.skeleton.bones.length)[0].skeleton
        const sharedBoneNames = sharedSkeleton.bones.map((b) => b.name).join(',')
        for (const mesh of skinnedMeshes) {
          const meshNames = mesh.skeleton.bones.map((b) => b.name).join(',')
          if (meshNames === sharedBoneNames) {
            mesh.bind(sharedSkeleton, mesh.bindMatrix ?? new THREE.Matrix4())
          } else {
            console.warn(
              `[paladin] skeleton mismatch on "${mesh.name}" — keeping its own skeleton`,
            )
          }
        }

        const mixer = new THREE.AnimationMixer(modelRaw)
        const actions = {} as ActionBundle
        for (const key of STATE_KEYS) {
          const a = mixer.clipAction(clips[key])
          if (ONE_SHOT_STATES.has(key)) {
            a.setLoop(THREE.LoopOnce, 1)
            a.clampWhenFinished = false
          } else {
            a.setLoop(THREE.LoopRepeat, Infinity)
            a.clampWhenFinished = false
          }
          a.enabled = true
          actions[key] = a
        }

        actions.idle.play()
        actions.idle.setEffectiveWeight(1)

        setAssets({ model: modelRaw, mixer, actions })
      })
      .catch((err) => {
        console.error('[paladin] FBX load failed:', err)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Performs the crossfade. Pulled out so we can call it from useFrame
  // without needing useEffect timing semantics.
  const transitionTo = (next: PaladinState, loaded: LoadedAssets) => {
    const prev = currentActionKey.current
    const from = loaded.actions[prev]
    const to = loaded.actions[next]

    const enteringOneShot = ONE_SHOT_STATES.has(next)
    const leavingOneShot = ONE_SHOT_STATES.has(prev)
    const movementToMovement = !enteringOneShot && !leavingOneShot

    if (movementToMovement) {
      // Smooth gait blend. Don't reset `to.time` so walk/run/strafe stay in
      // phase across transitions (the foot already mid-step keeps stepping).
      // crossFadeTo with warp=true also matches tempo during the blend so
      // the cycle period morphs from one to the other instead of snapping.
      to.enabled = true
      to.setEffectiveTimeScale(SPEED_DRIVEN.has(next) ? smoothedSpeed.current : 1)
      to.setEffectiveWeight(1)
      to.play()
      from.crossFadeTo(to, FADE_MOVEMENT, true)
    } else {
      // One-shots need to start from t=0; and when leaving a one-shot we
      // want the next movement state to start fresh as well to avoid the
      // clamped pose bleeding through.
      const fade = enteringOneShot ? FADE_ONESHOT : FADE_MOVEMENT
      from.fadeOut(fade)
      to.reset()
      to.setEffectiveTimeScale(SPEED_DRIVEN.has(next) ? smoothedSpeed.current : 1)
      to.setEffectiveWeight(1)
      to.fadeIn(fade)
      to.play()
    }

    currentActionKey.current = next

    if (enteringOneShot) {
      oneShot.current = {
        key: next,
        elapsed: 0,
        duration: to.getClip().duration,
        notified: false,
      }
    } else {
      oneShot.current = null
    }
  }

  useFrame((_, delta) => {
    if (!assets) return

    const targetSpeed = speedRef?.current ?? 1
    smoothedSpeed.current += (targetSpeed - smoothedSpeed.current) * SPEED_LERP

    assets.actions.walk.setEffectiveTimeScale(smoothedSpeed.current)
    assets.actions.run.setEffectiveTimeScale(smoothedSpeed.current)
    assets.actions.strafeLeft.setEffectiveTimeScale(smoothedSpeed.current)
    assets.actions.strafeRight.setEffectiveTimeScale(smoothedSpeed.current)

    // Poll the parent's stateRef. If it changed since last frame, do a
    // transition. No React render involved — eliminates the timing race
    // that was causing the lock to stick after attacks.
    const desired = stateRef.current
    if (desired !== currentActionKey.current) {
      transitionTo(desired, assets)
    }

    // One-shot completion timer. Notify slightly before the actual end so
    // the next transition can fade in cleanly. The safety branch covers the
    // case where the timer somehow misses its window — without it the parent
    // lock could stick and freeze every animation.
    const os = oneShot.current
    if (os && !os.notified) {
      os.elapsed += delta
      const notifyAt = Math.max(0.1, os.duration - 0.1)
      const safetyAt = os.duration * ONE_SHOT_SAFETY_MULT
      if (os.elapsed >= notifyAt || os.elapsed >= safetyAt) {
        os.notified = true
        onFinishedRef.current?.(os.key)
      }
    }

    assets.mixer.update(delta)
  })

  if (!assets) return null

  return (
    <group scale={0.018}>
      <primitive object={assets.model} />
    </group>
  )
}
