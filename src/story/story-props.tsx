import { RigidBody } from '@react-three/rapier'
import { use, useEffect } from 'react'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { Mesh, type Texture } from 'three/webgpu'
import { terrainHeight } from '../lib/terrain'
import { EMBLEM_URL, STORY_PROP_URLS } from '../loading/asset-manifest'
import { loadAsset } from '../loading/assets'
import { applyBannerWind } from './banner-wind'
import { STORY_SCRIPT, type StoryBeat, type Waypoint } from './story-script'
import { TombEpitaph } from './tomb-epitaph'

// Props face the player arriving from the previous waypoint (-z): turn the
// tomb so its carved face greets them.
const PROP_YAW: Readonly<Record<string, number>> = { fabroos: Math.PI, standard: Math.PI }

type PropBeat = StoryBeat & { waypoint: Waypoint }

function isPropBeat(beat: StoryBeat): beat is PropBeat {
  return beat.waypoint !== undefined && STORY_PROP_URLS[beat.id] !== undefined
}

const PROP_BEATS: readonly PropBeat[] = STORY_SCRIPT.filter(isPropBeat)
const PROP_MODEL_URLS = PROP_BEATS.map((beat) => STORY_PROP_URLS[beat.id])

type PropAssets = readonly [gltfs: GLTF[], emblem: Texture]

// One promise for the component's lifetime: use() must see the same one on
// every render.
let propAssets: Promise<PropAssets> | null = null

function loadPropAssets(): Promise<PropAssets> {
  propAssets ??= Promise.all([
    Promise.all(PROP_MODEL_URLS.map((url) => loadAsset(url, 'gltf'))),
    loadAsset(EMBLEM_URL, 'texture'),
  ])
  return propAssets
}

export function StoryProps() {
  const [gltfs, emblem] = use(loadPropAssets())

  useEffect(() => {
    for (const gltf of gltfs) applyBannerWind(gltf.scene, emblem)
  }, [gltfs, emblem])

  useEffect(() => {
    for (const gltf of gltfs) {
      gltf.scene.traverse((object) => {
        if (!(object instanceof Mesh)) return
        object.castShadow = true
        object.receiveShadow = true
      })
    }
  }, [gltfs])

  return (
    <>
      {PROP_BEATS.map((beat, index) => {
        const { x, z } = beat.waypoint
        return (
          // Solid: one convex hull per mesh keeps the paladin out of the stone.
          <RigidBody
            key={beat.id}
            type="fixed"
            colliders="hull"
            position={[x, terrainHeight(x, z), z]}
            rotation={[0, PROP_YAW[beat.id] ?? 0, 0]}
          >
            <primitive object={gltfs[index].scene} />
            {beat.epitaph && <TombEpitaph root={gltfs[index].scene} text={beat.epitaph} />}
          </RigidBody>
        )
      })}
    </>
  )
}
