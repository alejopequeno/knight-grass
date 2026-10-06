import { useSyncExternalStore } from 'react'

// Assets loaded outside THREE.DefaultLoadingManager's view (or whose loads
// start late, after a Suspense boundary resolves) report here so the
// curtain never lifts on a half-built scene.
export type CharacterLoadStatus = 'loading' | 'ready' | 'failed'

let characterStatus: CharacterLoadStatus = 'loading'
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): CharacterLoadStatus {
  return characterStatus
}

export function setCharacterStatus(status: CharacterLoadStatus): void {
  if (characterStatus === status) return
  characterStatus = status
  listeners.forEach((listener) => listener())
}

export function useCharacterStatus(): CharacterLoadStatus {
  return useSyncExternalStore(subscribe, getSnapshot)
}

// Flips when the curtain starts lifting. The story waits for it, so nothing
// it shows (the opening zone title above all) plays under the black curtain.
let sceneRevealed = false

export function setSceneRevealed(): void {
  sceneRevealed = true
}

export function isSceneRevealed(): boolean {
  return sceneRevealed
}
