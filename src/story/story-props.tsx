import { useLoader } from '@react-three/fiber'
import { RigidBody } from '@react-three/rapier'
import { useEffect } from 'react'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Mesh, TextureLoader } from 'three/webgpu'
import { terrainHeight } from '../lib/terrain'
import { applyBannerWind } from './banner-wind'
import { STORY_SCRIPT, type StoryBeat, type Waypoint } from './story-script'
import { TombEpitaph } from './tomb-epitaph'

const PROP_URLS: Readonly<Record<string, string>> = {
  fabroos: '/models/props/tomb.glb',
  oath: '/models/props/stones.glb',
  standard: '/models/props/standard.glb',
}
// The order's emblem, stamped on the standard's banner.
const EMBLEM_URL = '/textures/order-emblem.png'
// Props face the player arriving from the previous waypoint (-z): turn the
// tomb so its carved face greets them.
const PROP_YAW: Readonly<Record<string, number>> = { fabroos: Math.PI, standard: Math.PI }

type PropBeat = StoryBeat & { waypoint: Waypoint }

function isPropBeat(beat: StoryBeat): beat is PropBeat {
  return beat.waypoint !== undefined && PROP_URLS[beat.id] !== undefined
}

const PROP_BEATS: readonly PropBeat[] = STORY_SCRIPT.filter(isPropBeat)
const PROP_MODEL_URLS = PROP_BEATS.map((beat) => PROP_URLS[beat.id])

export function StoryProps() {
  const gltfs = useLoader(GLTFLoader, PROP_MODEL_URLS)
  const emblem = useLoader(TextureLoader, EMBLEM_URL)

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
