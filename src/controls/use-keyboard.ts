import { useEffect, useRef } from 'react'

export type MovementState = {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  run: boolean
  // Held: true while the key/button is down.
  block: boolean
  // Keyboard camera orbit — the alternative to pointer-lock mouse look.
  lookLeft: boolean
  lookRight: boolean
  lookUp: boolean
  lookDown: boolean
  // Edge-triggered: set to true on press, must be cleared by the consumer
  // (character.tsx) after handling. Lets us trigger one-shots without
  // re-firing every frame the key stays down.
  jumpPressed: boolean
  attackPressed: boolean
}

type PressAction = 'jumpPressed' | 'attackPressed'
type HeldAction = Exclude<keyof MovementState, PressAction>

const HELD_KEYS: Record<string, HeldAction> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  KeyQ: 'block',
  KeyJ: 'lookLeft',
  KeyL: 'lookRight',
  KeyI: 'lookUp',
  KeyK: 'lookDown',
}

// One key can raise several presses; each consumer clears its own.
const PRESS_KEYS: Record<string, readonly PressAction[]> = {
  Space: ['jumpPressed'],
  KeyF: ['attackPressed'],
}

const PRIMARY_MOUSE_BUTTON = 0
const SECONDARY_MOUSE_BUTTON = 2

export function createMovementState(): MovementState {
  return {
    forward: false,
    backward: false,
    left: false,
    right: false,
    run: false,
    block: false,
    lookLeft: false,
    lookRight: false,
    lookUp: false,
    lookDown: false,
    jumpPressed: false,
    attackPressed: false,
  }
}

const CONTROL_ACTIVATION_KEYS: ReadonlySet<string> = new Set(['Space', 'Enter', 'NumpadEnter'])
const INTERACTIVE_SELECTOR = 'button, a[href], input, select, textarea, [contenteditable="true"]'

// Activation keys pressed while a real control (the sound toggle, any future
// input) has focus belong to that control. Otherwise Space on a focused
// <button> would both jump and click it. Movement keys still reach the game.
function belongsToFocusedControl(event: KeyboardEvent): boolean {
  if (!CONTROL_ACTIVATION_KEYS.has(event.code)) return false
  return event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR) !== null
}

// Wires keyboard + mouse input into `state`. Returns a cleanup function.
export function attachKeyboardControls(state: MovementState, target: Window): () => void {
  const releaseHeld = () => {
    for (const action of Object.values(HELD_KEYS)) state[action] = false
  }

  const handleDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (belongsToFocusedControl(event)) return

    const press = PRESS_KEYS[event.code]
    if (press) {
      event.preventDefault()
      if (!event.repeat) for (const action of press) state[action] = true
      return
    }
    const held = HELD_KEYS[event.code]
    if (!held) return
    event.preventDefault()
    state[held] = true
  }

  const handleUp = (event: KeyboardEvent) => {
    const held = HELD_KEYS[event.code]
    if (held) state[held] = false
  }

  const handleMouseDown = (event: MouseEvent) => {
    // Require pointer lock so the very first click (which only acquires the
    // lock) doesn't accidentally fire a swing.
    if (!document.pointerLockElement) return
    if (event.button === PRIMARY_MOUSE_BUTTON) state.attackPressed = true
    if (event.button === SECONDARY_MOUSE_BUTTON) state.block = true
  }

  const handleMouseUp = (event: MouseEvent) => {
    if (event.button === SECONDARY_MOUSE_BUTTON) state.block = false
  }

  // Suppress the context menu only while playing with pointer lock, so the
  // page still behaves normally when the user is outside the game.
  const handleContextMenu = (event: MouseEvent) => {
    if (document.pointerLockElement) event.preventDefault()
  }

  target.addEventListener('keydown', handleDown)
  target.addEventListener('keyup', handleUp)
  target.addEventListener('blur', releaseHeld)
  target.addEventListener('mousedown', handleMouseDown)
  target.addEventListener('mouseup', handleMouseUp)
  target.addEventListener('contextmenu', handleContextMenu)

  return () => {
    target.removeEventListener('keydown', handleDown)
    target.removeEventListener('keyup', handleUp)
    target.removeEventListener('blur', releaseHeld)
    target.removeEventListener('mousedown', handleMouseDown)
    target.removeEventListener('mouseup', handleMouseUp)
    target.removeEventListener('contextmenu', handleContextMenu)
  }
}

export function useKeyboard() {
  const stateRef = useRef<MovementState>(createMovementState())

  useEffect(() => attachKeyboardControls(stateRef.current, window), [])

  return stateRef
}
