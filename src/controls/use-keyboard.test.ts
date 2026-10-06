import { afterEach, describe, expect, it } from 'vitest'
import { attachKeyboardControls, createMovementState } from './use-keyboard'

function press(target: EventTarget, code: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }))
}

describe('attachKeyboardControls', () => {
  let detach: () => void = () => {}

  afterEach(() => {
    detach()
    document.body.innerHTML = ''
  })

  it('jumps on Space when no control is focused', () => {
    const state = createMovementState()
    detach = attachKeyboardControls(state, window)
    press(document.body, 'Space')
    expect(state.jumpPressed).toBe(true)
  })

  it('leaves Space to a focused button instead of jumping', () => {
    const state = createMovementState()
    detach = attachKeyboardControls(state, window)
    const button = document.createElement('button')
    document.body.append(button)
    press(button, 'Space')
    expect(state.jumpPressed).toBe(false)
  })

  it('still moves while a button has focus', () => {
    const state = createMovementState()
    detach = attachKeyboardControls(state, window)
    const button = document.createElement('button')
    document.body.append(button)
    press(button, 'KeyW')
    expect(state.forward).toBe(true)
  })

  it('orbits the camera with J and attacks with F', () => {
    const state = createMovementState()
    detach = attachKeyboardControls(state, window)
    press(document.body, 'KeyJ')
    press(document.body, 'KeyF')
    expect(state.lookLeft).toBe(true)
    expect(state.attackPressed).toBe(true)
  })

})
