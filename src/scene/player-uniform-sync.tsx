import { useFrame } from '@react-three/fiber'
import type { RefObject } from 'react'
import { playerPosition } from '../lib/shared-uniforms'
import type { CharacterHandle } from './character'

const PLAYER_Z_TEST_HOOK = '__playerZ'

export function PlayerUniformSync({ characterRef }: { characterRef: RefObject<CharacterHandle | null> }) {
  useFrame(() => {
    const character = characterRef.current
    if (!character) return
    playerPosition.value.copy(character.getPosition())
    // Dev-only hook so end-to-end tests can check movement; stripped in builds.
    if (import.meta.env.DEV) Reflect.set(window, PLAYER_Z_TEST_HOOK, playerPosition.value.z)
  })
  return null
}
