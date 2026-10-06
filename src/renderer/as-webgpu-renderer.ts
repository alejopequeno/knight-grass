import { WebGPURenderer } from 'three/webgpu'

// R3F types `state.gl` as WebGLRenderer; at runtime it is our WebGPURenderer.
export function asWebGPURenderer(gl: unknown): WebGPURenderer {
  if (gl instanceof WebGPURenderer) return gl
  throw new Error('Expected a WebGPURenderer — is the Canvas using createRendererFactory?')
}
