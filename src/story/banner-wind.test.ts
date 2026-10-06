import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, MeshStandardNodeMaterial, Texture } from 'three/webgpu'
import { applyBannerWind, BANNER_MESH_NAME, bannerUvFrame } from './banner-wind'

function standardWithBanner(): { root: Group; map: Texture } {
  const root = new Group()
  const map = new Texture()
  const banner = new Mesh(new BoxGeometry(1, 2, 0.01), new MeshStandardMaterial({ map }))
  banner.name = BANNER_MESH_NAME
  root.add(banner, new Mesh(new BoxGeometry(0.1, 3, 0.1), new MeshStandardMaterial()))
  return { root, map }
}

describe('applyBannerWind', () => {
  it('swaps the banner to a wind-driven node material, keeping its texture', () => {
    const { root, map } = standardWithBanner()
    expect(applyBannerWind(root)).toBe(true)
    const banner = root.getObjectByName(BANNER_MESH_NAME)
    if (!(banner instanceof Mesh)) throw new Error('banner missing')
    expect(banner.material).toBeInstanceOf(MeshStandardNodeMaterial)
    expect(banner.material.map).toBe(map)
    expect(banner.material.positionNode).not.toBeNull()
  })

  it('leaves models without a banner untouched', () => {
    expect(applyBannerWind(new Group())).toBe(false)
  })
})

describe('bannerUvFrame', () => {
  it('finds the uv extent and which v edge is pinned at the top', () => {
    // Two-row strip: top row (y = 0) carries v = 0, bottom row (y = -2) v = 1.
    const positions = [-0.5, 0, 0, 0.5, 0, 0, -0.5, -2, 0, 0.5, -2, 0]
    const uvs = [0, 0, 1, 0, 0, 1, 1, 1]
    expect(bannerUvFrame(positions, uvs)).toEqual({ uMin: 0, uMax: 1, topV: 0, bottomV: 1 })
  })

  it('handles uvs whose v runs bottom to top', () => {
    const positions = [-0.5, 0, 0, 0.5, 0, 0, -0.5, -2, 0, 0.5, -2, 0]
    const uvs = [0, 1, 1, 1, 0, 0, 1, 0]
    expect(bannerUvFrame(positions, uvs)).toEqual({ uMin: 0, uMax: 1, topV: 1, bottomV: 0 })
  })
})
