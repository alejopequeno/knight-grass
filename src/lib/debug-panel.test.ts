import { describe, expect, it } from 'vitest'
import { isDebugRequested, isDebugToggle } from './debug-panel'

describe('isDebugRequested', () => {
  it('opens the panel when the url carries ?debug', () => {
    expect(isDebugRequested('?debug')).toBe(true)
    expect(isDebugRequested('?foo=1&debug=1')).toBe(true)
  })

  it('keeps it hidden otherwise', () => {
    expect(isDebugRequested('')).toBe(false)
    expect(isDebugRequested('?debugger')).toBe(false)
  })
})

describe('isDebugToggle', () => {
  const press = { code: 'KeyD', altKey: true, metaKey: false, ctrlKey: false, repeat: false, targetIsEditable: false }

  it('toggles on Option+D', () => {
    expect(isDebugToggle(press)).toBe(true)
  })

  it('ignores plain D (movement), other modifiers, key repeat and typing in a field', () => {
    expect(isDebugToggle({ ...press, altKey: false })).toBe(false)
    expect(isDebugToggle({ ...press, metaKey: true })).toBe(false)
    expect(isDebugToggle({ ...press, ctrlKey: true })).toBe(false)
    expect(isDebugToggle({ ...press, repeat: true })).toBe(false)
    expect(isDebugToggle({ ...press, targetIsEditable: true })).toBe(false)
    expect(isDebugToggle({ ...press, code: 'Backquote' })).toBe(false)
  })
})
