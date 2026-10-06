// Whether player input (movement, actions, camera look) is currently ignored.
// Written by the story director every frame; read by the character and the
// follow camera. Module state, like playerPosition, so no React re-renders.
let locked = false

export function setControlLock(next: boolean): void {
  locked = next
}

export function isControlLocked(): boolean {
  return locked
}
