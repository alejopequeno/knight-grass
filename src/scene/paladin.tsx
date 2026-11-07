import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { toRimLitMaterial } from '../atmosphere/moon-rim'
import { findCapsuleBones, updateCharacterCapsules, type CapsuleBones } from '../lib/character-capsules'
import { setCharacterStatus } from '../lib/load-state'
import { PALADIN_ANIMATION_URLS, PALADIN_MODEL_URL } from '../loading/asset-manifest'
import { loadAsset } from '../loading/assets'
import {
  PALADIN_STATES,
  PaladinAnimator,
  type PaladinClips,
  type PaladinState,
} from './paladin-animator'
import { mapPaladinStates } from './paladin-states'

export type { PaladinState } from './paladin-animator'

const MODEL_SCALE = 0.018
const SPEED_DAMPING = 9.75

type Props = {
  // Polled each frame — no React renders on state changes.
  stateRef: RefObject<PaladinState>
  speedRef?: RefObject<number>
  // Fires when a one-shot action (jump/attack) finishes playing; the
  // consumer should clear whatever lock kept stateRef pinned to it.
  onActionFinished: (state: PaladinState) => void
}

type LoadedPaladin = {
  model: THREE.Group
  animator: PaladinAnimator
  capsuleBones: CapsuleBones | null
}

function loadFbx(url: string): Promise<THREE.Group> {
  return loadAsset(url, 'fbx')
}

async function loadOptionalClip(url: string): Promise<THREE.AnimationClip | null> {
  try {
    const group = await loadFbx(url)
    return group.animations[0] ?? null
  } catch (error) {
    console.error(`[paladin] failed to load ${url}:`, error)
    return null
  }
}

function stripRootMotion(clip: THREE.AnimationClip): THREE.AnimationClip {
  clip.tracks = clip.tracks.filter((track) => !track.name.endsWith('.position'))
  return clip
}

function collectSkinnedMeshes(model: THREE.Object3D): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = []
  model.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return
    object.castShadow = true
    object.receiveShadow = false
    object.frustumCulled = false
    const sources = Array.isArray(object.material) ? object.material : [object.material]
    const converted = sources.map(toRimLitMaterial)
    sources.forEach((material) => material.dispose())
    object.material = converted.length === 1 ? converted[0] : converted
    meshes.push(object)
  })
  return meshes
}

// Some exports split the body across meshes with duplicated skeletons; bind
// them all to the largest one so a single mixer drives every piece.
function shareSkeleton(meshes: THREE.SkinnedMesh[]): void {
  if (meshes.length === 0) return
  const shared = meshes.reduce((largest, mesh) =>
    mesh.skeleton.bones.length > largest.skeleton.bones.length ? mesh : largest,
  ).skeleton
  const sharedNames = shared.bones.map((bone) => bone.name).join(',')
  for (const mesh of meshes) {
    const names = mesh.skeleton.bones.map((bone) => bone.name).join(',')
    if (names === sharedNames) {
      mesh.bind(shared, mesh.bindMatrix)
    } else {
      console.warn(`[paladin] skeleton mismatch on "${mesh.name}" — keeping its own skeleton`)
    }
  }
}

function buildClips(rawClips: (THREE.AnimationClip | null)[]): PaladinClips | null {
  const idleClip = rawClips[PALADIN_STATES.indexOf('idle')]
  if (!idleClip) return null

  return mapPaladinStates((state) => {
    const clip = rawClips[PALADIN_STATES.indexOf(state)]
    if (!clip) console.warn(`[paladin] no clip for "${state}" — falling back to idle`)
    return stripRootMotion(clip ?? idleClip.clone())
  })
}

export function Paladin({ stateRef, speedRef, onActionFinished }: Props) {
  const [loaded, setLoaded] = useState<LoadedPaladin | null>(null)
  const smoothedSpeed = useRef(1)
  const onFinishedRef = useRef(onActionFinished)

  useEffect(() => {
    onFinishedRef.current = onActionFinished
  }, [onActionFinished])

  useEffect(() => {
    let cancelled = false
    let built: LoadedPaladin | null = null

    async function load(): Promise<void> {
      const [model, ...rawClips] = await Promise.all([
        loadFbx(PALADIN_MODEL_URL),
        ...PALADIN_STATES.map((state) => loadOptionalClip(PALADIN_ANIMATION_URLS[state])),
      ])
      if (cancelled) return

      const clips = buildClips(rawClips)
      if (!clips) throw new Error('idle clip missing — cannot animate the paladin')

      shareSkeleton(collectSkinnedMeshes(model))
      const animator = new PaladinAnimator(model, clips, (state) =>
        onFinishedRef.current(state),
      )
      const capsuleBones = findCapsuleBones(model)
      if (!capsuleBones) console.warn('[paladin] rig is missing capsule bones — grass/fireflies will not react to the body')
      built = { model, animator, capsuleBones }
      setLoaded(built)
      setCharacterStatus('ready')
    }

    load().catch((error: unknown) => {
      if (cancelled) return
      console.error('[paladin] load failed:', error)
      setCharacterStatus('failed')
    })

    // The model itself is a session-wide cached asset (one paladin per page),
    // so only the per-mount animator is torn down.
    return () => {
      cancelled = true
      built?.animator.dispose()
    }
  }, [])

  useFrame((_, delta) => {
    if (!loaded) return
    const targetSpeed = speedRef?.current ?? 1
    smoothedSpeed.current = THREE.MathUtils.damp(
      smoothedSpeed.current,
      targetSpeed,
      SPEED_DAMPING,
      delta,
    )
    loaded.animator.update(stateRef.current, smoothedSpeed.current, delta)
    if (loaded.capsuleBones) {
      // Bones are posed by the mixer; refresh world matrices from the root
      // (the character group already moved this frame) before reading them.
      loaded.model.updateWorldMatrix(true, true)
      updateCharacterCapsules(loaded.capsuleBones)
    }
  })

  if (!loaded) return null

  return (
    <group scale={MODEL_SCALE}>
      <primitive object={loaded.model} />
    </group>
  )
}
