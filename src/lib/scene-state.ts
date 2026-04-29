import * as THREE from 'three'

// Shared scene state used to keep grass shading in sync with the sky.
// Sky writes; Grass reads.
export const sceneState = {
  sunDirection: new THREE.Vector3(0.6, 0.8, 0.3).normalize(),
}
