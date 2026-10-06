import type { Camera, Scene } from 'three'
import { AgXToneMapping, WebGPURenderer } from 'three/webgpu'

export type RendererFailureReason = 'init-failed' | 'device-lost'

// Method syntax keeps WebGPURenderer assignable (its DeviceLostInfo is wider).
export type ManagedRenderer = {
  init(): Promise<unknown>
  onDeviceLost(info: { message: string }): void
  render(scene: Scene, camera: Camera): unknown
}

type RendererFactoryOptions = {
  onFailure: (reason: RendererFailureReason, detail: string) => void
  instantiate: (canvas: HTMLCanvasElement) => ManagedRenderer
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function instantiateWebGPURenderer(canvas: HTMLCanvasElement): WebGPURenderer {
  const renderer = new WebGPURenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  renderer.toneMapping = AgXToneMapping
  return renderer
}

// R3F declares its own OffscreenCanvas type; we only ever render into the
// DOM canvas it creates, so narrow instead of trusting the declared union.
function toDomCanvas(canvas: unknown): HTMLCanvasElement {
  if (canvas instanceof HTMLCanvasElement) return canvas
  throw new Error('walk-grass renders into a DOM <canvas> only')
}

// R3F `gl` factory: awaits init, and turns init failures and device loss
// into explicit reports so the gate can show a message instead of a black canvas.
export function createRendererFactory({ onFailure, instantiate }: RendererFactoryOptions) {
  return async ({ canvas }: { canvas: unknown }): Promise<ManagedRenderer> => {
    const renderer = instantiate(toDomCanvas(canvas))
    renderer.onDeviceLost = (info) => {
      console.error('[renderer] GPU device lost:', info.message)
      onFailure('device-lost', info.message)
    }
    try {
      await renderer.init()
    } catch (error: unknown) {
      onFailure('init-failed', errorMessage(error))
      throw error
    }
    return renderer
  }
}
