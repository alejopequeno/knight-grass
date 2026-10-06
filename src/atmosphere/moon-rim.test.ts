import { describe, expect, it } from 'vitest'
import { Color, MeshPhongMaterial, MeshStandardNodeMaterial, Texture } from 'three/webgpu'
import { toRimLitMaterial } from './moon-rim'

describe('toRimLitMaterial', () => {
  it('keeps the Phong colour, map and normal map', () => {
    const map = new Texture()
    const normalMap = new Texture()
    const source = new MeshPhongMaterial({ color: new Color('#336699'), map, normalMap })
    const result = toRimLitMaterial(source)
    expect(result).toBeInstanceOf(MeshStandardNodeMaterial)
    expect(result.color.getHexString()).toBe('336699')
    expect(result.map).toBe(map)
    expect(result.normalMap).toBe(normalMap)
  })

  it('adds the moon rim as emissive', () => {
    const result = toRimLitMaterial(new MeshPhongMaterial())
    expect(result.emissiveNode).not.toBeNull()
  })

  it('handles materials without maps', () => {
    const result = toRimLitMaterial(new MeshPhongMaterial({ color: new Color('#ffffff') }))
    expect(result.map).toBeNull()
  })

  it('stays non-metallic: the FBX colour lives in the diffuse map', () => {
    expect(toRimLitMaterial(new MeshPhongMaterial()).metalness).toBe(0)
  })

  it('derives roughness from the Phong specular map when present', () => {
    const specularMap = new Texture()
    expect(toRimLitMaterial(new MeshPhongMaterial({ specularMap })).roughnessNode).not.toBeNull()
    expect(toRimLitMaterial(new MeshPhongMaterial()).roughnessNode).toBeNull()
  })
})
