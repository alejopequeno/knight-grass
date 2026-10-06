import { describe, expect, it } from 'vitest'
import { detectWebGPU } from './webgpu-support'

describe('detectWebGPU', () => {
  it('reports no-api when navigator.gpu is missing', async () => {
    await expect(detectWebGPU(undefined)).resolves.toEqual({ supported: false, reason: 'no-api' })
  })

  it('reports no-api when gpu has no requestAdapter', async () => {
    await expect(detectWebGPU({})).resolves.toEqual({ supported: false, reason: 'no-api' })
  })

  it('reports no-adapter when requestAdapter resolves null', async () => {
    const gpu = { requestAdapter: async () => null }
    await expect(detectWebGPU(gpu)).resolves.toEqual({ supported: false, reason: 'no-adapter' })
  })

  it('reports no-adapter when requestAdapter throws', async () => {
    const gpu = {
      requestAdapter: async () => {
        throw new Error('boom')
      },
    }
    await expect(detectWebGPU(gpu)).resolves.toEqual({ supported: false, reason: 'no-adapter' })
  })

  it('reports supported when an adapter is returned', async () => {
    const gpu = { requestAdapter: async () => ({}) }
    await expect(detectWebGPU(gpu)).resolves.toEqual({ supported: true })
  })
})
