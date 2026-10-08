import {
  clamp,
  dot,
  float,
  length,
  max,
  min,
  oneMinus,
  pow,
  smoothstep,
  step,
  uniformArray,
  vec2,
  vec3,
} from 'three/tsl'
import { Vector3, Vector4, type Node, type Object3D } from 'three/webgpu'

// Body parts the grass and fireflies avoid: each is a segment between two
// Mixamo bones, inflated by a radius (world metres).
export const CAPSULE_DEFINITIONS = [
  { from: 'mixamorigLeftUpLeg', to: 'mixamorigLeftLeg', radius: 0.11 },
  { from: 'mixamorigLeftLeg', to: 'mixamorigLeftFoot', radius: 0.08 },
  { from: 'mixamorigLeftFoot', to: 'mixamorigLeftToeBase', radius: 0.07 },
  { from: 'mixamorigRightUpLeg', to: 'mixamorigRightLeg', radius: 0.11 },
  { from: 'mixamorigRightLeg', to: 'mixamorigRightFoot', radius: 0.08 },
  { from: 'mixamorigRightFoot', to: 'mixamorigRightToeBase', radius: 0.07 },
  { from: 'mixamorigHips', to: 'mixamorigSpine', radius: 0.2 },
] as const

const LEFT_FOOT_BONE = 'mixamorigLeftFoot'
const RIGHT_FOOT_BONE = 'mixamorigRightFoot'
const MIN_LENGTH = 1e-4
// Capsules start far below the world so nothing reacts before the rig loads.
const PARKED_Y = -1000

export type CapsuleSegment = { start: Vector3; end: Vector3; radius: number }
export type CapsuleBones = ReadonlyMap<string, Object3D>

const REQUIRED_BONES: ReadonlySet<string> = new Set(CAPSULE_DEFINITIONS.flatMap((c) => [c.from, c.to]))

// Every bone the capsules need, or null if the rig is missing one.
export function findCapsuleBones(root: Object3D): CapsuleBones | null {
  const bones = new Map<string, Object3D>()
  root.traverse((object) => {
    if (REQUIRED_BONES.has(object.name) && !bones.has(object.name)) bones.set(object.name, object)
  })
  return bones.size === REQUIRED_BONES.size ? bones : null
}

function worldPosition(bones: CapsuleBones, name: string): Vector3 {
  const bone = bones.get(name)
  if (!bone) throw new Error(`[capsules] missing bone ${name}`)
  return bone.getWorldPosition(new Vector3())
}

export function capsulesFromBones(bones: CapsuleBones): CapsuleSegment[] {
  return CAPSULE_DEFINITIONS.map((capsule) => ({
    start: worldPosition(bones, capsule.from),
    end: worldPosition(bones, capsule.to),
    radius: capsule.radius,
  }))
}

// GPU copies: xyz = segment point, w (starts only) = radius.
const capsuleStarts = uniformArray<'vec4'>(CAPSULE_DEFINITIONS.map(() => new Vector4(0, PARKED_Y, 0, 0)), 'vec4')
const capsuleEnds = uniformArray<'vec4'>(CAPSULE_DEFINITIONS.map(() => new Vector4(0, PARKED_Y, 0, 0)), 'vec4')

// Feet in world space for footstep detection.
export const characterFeet = { left: new Vector3(), right: new Vector3(), ready: false }

export function updateCharacterCapsules(bones: CapsuleBones): void {
  capsulesFromBones(bones).forEach((capsule, index) => {
    const start = capsuleStarts.array[index]
    const end = capsuleEnds.array[index]
    if (start instanceof Vector4) start.set(capsule.start.x, capsule.start.y, capsule.start.z, capsule.radius)
    if (end instanceof Vector4) end.set(capsule.end.x, capsule.end.y, capsule.end.z, 0)
  })
  characterFeet.left.copy(worldPosition(bones, LEFT_FOOT_BONE))
  characterFeet.right.copy(worldPosition(bones, RIGHT_FOOT_BONE))
  characterFeet.ready = true
}

// Ground-plane push for a blade rooted at `point` (xz) whose top reaches
// `reachY`: sum of xz pushes out of every capsule it overlaps, and in z the
// deepest relative penetration (0 = clear, 1 = root inside a capsule).
export function capsuleGroundPushNode(point: Node<'vec2'>, reachY: Node<'float'>, margin: number): Node<'vec3'> {
  let push: Node<'vec2'> = vec2(0, 0)
  let deepest: Node<'float'> = float(0)
  CAPSULE_DEFINITIONS.forEach((_, index) => {
    const start = capsuleStarts.element(index)
    const end = capsuleEnds.element(index)
    const a = start.xz
    const ab = end.xz.sub(a)
    const t = clamp(dot(point.sub(a), ab).div(max(dot(ab, ab), MIN_LENGTH)), 0, 1)
    const closest = a.add(ab.mul(t))
    const offset = point.sub(closest)
    const distance = length(offset)
    const reach = start.w.add(margin)
    const lowest = min(start.y, end.y).sub(start.w)
    const overlaps = step(lowest, reachY)
    const penetration = max(reach.sub(distance), 0).mul(overlaps)
    push = push.add(offset.div(max(distance, MIN_LENGTH)).mul(penetration))
    deepest = max(deepest, penetration.div(reach))
  })
  return vec3(push.x, push.y, deepest)
}

// How far the occlusion reaches past a capsule's own radius, at the contact
// point. Everything here is deliberately short: what grounds a figure in deep
// grass is the dark well his body makes around his feet, not a cast silhouette.
const CONTACT_REACH = 0.55
// Extra reach per metre the caster stands above the shaded point, so the pool
// opens out under the torso instead of hugging it.
const SPREAD_PER_METRE = 0.5
// Occlusion from a caster this far above the point has faded out entirely.
const VERTICAL_REACH = 2.1
// Pushes the falloff toward the capsule, leaving a wide soft edge. A hard core
// reads as a hole cut in the ground.
const FALLOFF_POWER = 2.2
// The light only skews the pool a little: at blue hour the sun sits on the
// horizon, and projecting properly smears a black slab across the field.
const LIGHT_SKEW = 0.35

// Ambient occlusion (0 open → 1 enclosed) at a world point, from the body
// capsules. Soft, short-range and barely directional on purpose.
export function capsuleShadowNode(point: Node<'vec3'>, lightDirection: Node<'vec3'>): Node<'float'> {
  // Lean the pool away from the light without ever detaching it from the body.
  const skew = lightDirection.xz.mul(LIGHT_SKEW)
  const leaned = (caster: Node<'vec3'>): Node<'vec2'> => caster.xz.sub(skew.mul(caster.y.sub(point.y)))

  let shadow: Node<'float'> = float(0)
  CAPSULE_DEFINITIONS.forEach((_, index) => {
    const start = capsuleStarts.element(index)
    const end = capsuleEnds.element(index)
    const a = leaned(start.xyz)
    const ab = leaned(end.xyz).sub(a)
    const t = clamp(dot(point.xz.sub(a), ab).div(max(dot(ab, ab), MIN_LENGTH)), 0, 1)
    const distance = length(point.xz.sub(a.add(ab.mul(t))))

    const height = max(min(start.y, end.y).sub(point.y), 0)
    const reach = start.w.add(CONTACT_REACH).add(height.mul(SPREAD_PER_METRE))
    const nearness = oneMinus(smoothstep(float(0), reach, distance))
    const falloff = oneMinus(smoothstep(float(0), float(VERTICAL_REACH), height))
    shadow = max(shadow, pow(nearness, FALLOFF_POWER).mul(falloff))
  })
  return shadow
}

// 3D push that moves `point` out of every capsule (plus margin).
export function capsuleVolumePushNode(point: Node<'vec3'>, margin: number): Node<'vec3'> {
  let push: Node<'vec3'> = vec3(0, 0, 0)
  CAPSULE_DEFINITIONS.forEach((_, index) => {
    const start = capsuleStarts.element(index)
    const end = capsuleEnds.element(index)
    const a = start.xyz
    const ab = end.xyz.sub(a)
    const t = clamp(dot(point.sub(a), ab).div(max(dot(ab, ab), MIN_LENGTH)), 0, 1)
    const offset = point.sub(a.add(ab.mul(t)))
    const distance = length(offset)
    const penetration = max(start.w.add(margin).sub(distance), 0)
    push = push.add(offset.div(max(distance, MIN_LENGTH)).mul(penetration))
  })
  return push
}
