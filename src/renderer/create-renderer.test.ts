import { describe, expect, it, vi } from 'vitest'
import { createRendererFactory, type ManagedRenderer } from './create-renderer'

function fakeRenderer(init: () => Promise<unknown>): ManagedRenderer {
  return { init, onDeviceLost: () => {}, render: () => undefined }
}

const canvas = document.createElement('canvas')

describe('createRendererFactory', () => {
  it('resolves the renderer once init succeeds', async () => {
    const renderer = fakeRenderer(async () => undefined)
    const onFailure = vi.fn()
    const factory = createRendererFactory({ onFailure, instantiate: () => renderer })
    await expect(factory({ canvas })).resolves.toBe(renderer)
    expect(onFailure).not.toHaveBeenCalled()
  })

  it('reports init-failed and rejects when init throws', async () => {
    const onFailure = vi.fn()
    const factory = createRendererFactory({
      onFailure,
      instantiate: () =>
        fakeRenderer(async () => {
          throw new Error('no device')
        }),
    })
    await expect(factory({ canvas })).rejects.toThrow('no device')
    expect(onFailure).toHaveBeenCalledWith('init-failed', 'no device')
  })

  it('reports device-lost when the GPU device is lost', async () => {
    const renderer = fakeRenderer(async () => undefined)
    const onFailure = vi.fn()
    const factory = createRendererFactory({ onFailure, instantiate: () => renderer })
    await factory({ canvas })
    renderer.onDeviceLost({ message: 'GPU reset' })
    expect(onFailure).toHaveBeenCalledWith('device-lost', 'GPU reset')
  })
})
