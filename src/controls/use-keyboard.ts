import { useEffect, useRef } from 'react'

export type MovementState = {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  run: boolean
  // Held: true while the key/button is down.
  block: boolean
  // Edge-triggered: set to true on press, must be cleared by the consumer
  // (character.tsx) after handling. Lets us trigger one-shots without
  // re-firing every frame the key stays down.
  jumpPressed: boolean
  attackPressed: boolean
}

const KEY_MAP: Record<string, keyof MovementState> = {
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
}

export function useKeyboard() {
  const stateRef = useRef<MovementState>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    run: false,
    block: false,
    jumpPressed: false,
    attackPressed: false,
  })

  useEffect(() => {
    const handleDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        if (!event.repeat) stateRef.current.jumpPressed = true
        return
      }
      const action = KEY_MAP[event.code]
      if (action) stateRef.current[action] = true
    }
    const handleUp = (event: KeyboardEvent) => {
      const action = KEY_MAP[event.code]
      if (action) stateRef.current[action] = false
    }
    const handleBlur = () => {
      const s = stateRef.current
      s.forward = s.backward = s.left = s.right = false
      s.run = s.block = false
    }
    const handleMouseDown = (event: MouseEvent) => {
      // Require pointer lock so the very first click (which only acquires the
      // lock) doesn't accidentally fire a swing.
      if (!document.pointerLockElement) return
      if (event.button === 0) stateRef.current.attackPressed = true
      if (event.button === 2) stateRef.current.block = true
    }
    const handleMouseUp = (event: MouseEvent) => {
      if (event.button === 2) stateRef.current.block = false
    }
    // Suppress the right-click menu so block (RMB) doesn't pop up the context.
    const handleContextMenu = (event: MouseEvent) => event.preventDefault()

    window.addEventListener('keydown', handleDown)
    window.addEventListener('keyup', handleUp)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('contextmenu', handleContextMenu)

    return () => {
      window.removeEventListener('keydown', handleDown)
      window.removeEventListener('keyup', handleUp)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [])

  return stateRef
}
