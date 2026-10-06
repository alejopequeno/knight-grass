import { Object3D } from 'three/webgpu'
import { describe, expect, it } from 'vitest'
import { CAPSULE_DEFINITIONS, capsulesFromBones, findCapsuleBones } from './character-capsules'

function buildRig(): Object3D {
  const root = new Object3D()
  root.position.set(10, 0, -5)
  const names = new Set(CAPSULE_DEFINITIONS.flatMap((capsule) => [capsule.from, capsule.to]))
  let y = 0
  for (const name of names) {
    const bone = new Object3D()
    bone.name = name
    bone.position.set(0, y, 0)
    y += 0.1
    root.add(bone)
  }
  root.updateMatrixWorld(true)
  return root
}

describe('character capsules', () => {
  it('finds every bone a capsule needs', () => {
    const bones = findCapsuleBones(buildRig())
    expect(bones).not.toBeNull()
  })

  it('returns null when the rig lacks a bone', () => {
    expect(findCapsuleBones(new Object3D())).toBeNull()
  })

  it('builds one world-space segment per capsule with its radius', () => {
    const rig = buildRig()
    const bones = findCapsuleBones(rig)
    if (!bones) throw new Error('rig incomplete')
    const capsules = capsulesFromBones(bones)
    expect(capsules).toHaveLength(CAPSULE_DEFINITIONS.length)
    capsules.forEach((capsule, index) => {
      expect(capsule.radius).toBe(CAPSULE_DEFINITIONS[index].radius)
      expect(capsule.start.x).toBeCloseTo(10)
      expect(capsule.end.z).toBeCloseTo(-5)
    })
  })
})
