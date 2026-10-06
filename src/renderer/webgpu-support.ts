export type WebGPUUnsupportedReason = 'no-api' | 'no-adapter'
export type WebGPUSupport = { supported: true } | { supported: false; reason: WebGPUUnsupportedReason }

type GpuLike = { requestAdapter: () => Promise<unknown> }

function isGpuLike(value: unknown): value is GpuLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'requestAdapter' in value &&
    typeof value.requestAdapter === 'function'
  )
}

function navigatorGpu(): unknown {
  return typeof navigator === 'undefined' ? undefined : Reflect.get(navigator, 'gpu')
}

export async function detectWebGPU(gpu: unknown = navigatorGpu()): Promise<WebGPUSupport> {
  if (!isGpuLike(gpu)) return { supported: false, reason: 'no-api' }
  try {
    const adapter = await gpu.requestAdapter()
    return adapter ? { supported: true } : { supported: false, reason: 'no-adapter' }
  } catch {
    return { supported: false, reason: 'no-adapter' }
  }
}
