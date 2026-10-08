import { useEffect, useState } from 'react'

const DEBUG_PARAM = 'debug'
// Option+D (Alt+D): D alone is movement, which ignores modified keys.
const TOGGLE_KEY_CODE = 'KeyD'

/** `?debug` in the url opens the tweak panel on load. */
export function isDebugRequested(search: string): boolean {
  return new URLSearchParams(search).has(DEBUG_PARAM)
}

type ToggleKey = {
  code: string
  altKey: boolean
  metaKey: boolean
  ctrlKey: boolean
  repeat: boolean
  targetIsEditable: boolean
}

/** Option+D shows / hides the panel, unless typing in a field. */
export function isDebugToggle({ code, altKey, metaKey, ctrlKey, repeat, targetIsEditable }: ToggleKey): boolean {
  return code === TOGGLE_KEY_CODE && altKey && !metaKey && !ctrlKey && !repeat && !targetIsEditable
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
}

/** Whether the tweak panel is visible: `?debug` to start open, Option+D to toggle. */
export function useDebugPanel(): boolean {
  const [visible, setVisible] = useState(() => isDebugRequested(window.location.search))

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const toggle = isDebugToggle({
        code: event.code,
        altKey: event.altKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        repeat: event.repeat,
        targetIsEditable: isEditable(event.target),
      })
      if (!toggle) return
      // Option+D would otherwise type "∂" into whatever has focus.
      event.preventDefault()
      setVisible((current) => !current)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return visible
}
