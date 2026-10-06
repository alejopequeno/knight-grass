import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import { useEffect, useRef } from 'react'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { film } from 'three/addons/tsl/display/FilmNode.js'
import { lut3D } from 'three/addons/tsl/display/Lut3DNode.js'
import { smaa } from 'three/addons/tsl/display/SMAANode.js'
import { traa } from 'three/addons/tsl/display/TRAANode.js'
import {
  length,
  mrt,
  oneMinus,
  output,
  pass,
  renderOutput,
  screenUV,
  smoothstep,
  texture3D,
  uniform,
  vec4,
  velocity,
} from 'three/tsl'
import { RenderPipeline, type Camera, type Data3DTexture, type Scene, type WebGPURenderer } from 'three/webgpu'
import { motionScaleFor, useReducedMotion } from '../lib/reduced-motion'
import { motionScale } from '../lib/shared-uniforms'
import { asWebGPURenderer } from './as-webgpu-renderer'
import { createBlueHourLut, LUT_SIZE } from './blue-hour-lut'
import { grainIntensityFor } from './post-settings'

const BLOOM_RADIUS = 0.6
const VIGNETTE_OUTER_EDGE = 1.4

// Module-level uniforms: leva writes them, the node graph reads them.
const postUniforms = {
  lutIntensity: uniform(0.8),
  vignetteOffset: uniform(0.35),
  vignetteDarkness: uniform(0.75),
  grain: uniform(grainIntensityFor(false)),
}

type AntiAliasing = 'traa' | 'smaa'

type BuiltPipeline = {
  pipeline: RenderPipeline
  lut: Data3DTexture
  setBloom: (strength: number, threshold: number) => void
}

function buildPipeline(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  antiAliasing: AntiAliasing,
): BuiltPipeline {
  const scenePass = pass(scene, camera)
  scenePass.setMRT(mrt({ output, velocity }))
  const color = scenePass.getTextureNode('output')

  const bloomPass = bloom(color, 0.6, BLOOM_RADIUS, 0.85)
  const hdr = color.add(bloomPass)
  const antiAliased =
    antiAliasing === 'traa'
      ? traa(hdr, scenePass.getTextureNode('depth'), scenePass.getTextureNode('velocity'), camera)
      : smaa(hdr)

  const display = renderOutput(antiAliased)

  const edge = length(screenUV.sub(0.5)).mul(2)
  const vignette = oneMinus(
    smoothstep(postUniforms.vignetteOffset, VIGNETTE_OUTER_EDGE, edge).mul(postUniforms.vignetteDarkness),
  )
  const vignetted = display.mul(vec4(vignette, vignette, vignette, 1))

  const lut = createBlueHourLut()
  const graded = lut3D(vignetted, texture3D(lut), LUT_SIZE, postUniforms.lutIntensity)
  const finalNode = film(graded, postUniforms.grain)

  const pipeline = new RenderPipeline(renderer, finalNode)
  // renderOutput above already tone-maps and encodes to the output colour space.
  pipeline.outputColorTransform = false

  return {
    pipeline,
    lut,
    setBloom: (strength, threshold) => {
      bloomPass.strength.value = strength
      bloomPass.threshold.value = threshold
    },
  }
}

export function RenderPipelineEffect() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const builtRef = useRef<BuiltPipeline | null>(null)
  const reducedMotion = useReducedMotion()

  const c = useControls('post', {
    enabled: true,
    antiAliasing: { value: 'traa', options: ['traa', 'smaa'] },
    bloomStrength: { value: 0.6, min: 0, max: 3, step: 0.05 },
    bloomThreshold: { value: 0.85, min: 0, max: 2, step: 0.01 },
    lutIntensity: { value: 0.8, min: 0, max: 1, step: 0.05 },
    vignetteOffset: { value: 0.35, min: 0, max: 1, step: 0.01 },
    vignetteDarkness: { value: 0.75, min: 0, max: 2, step: 0.01 },
  })
  const antiAliasing: AntiAliasing = c.antiAliasing === 'smaa' ? 'smaa' : 'traa'

  useEffect(() => {
    const built = buildPipeline(asWebGPURenderer(gl), scene, camera, antiAliasing)
    builtRef.current = built
    return () => {
      builtRef.current = null
      built.pipeline.dispose()
      built.lut.dispose()
    }
  }, [gl, scene, camera, antiAliasing])

  useEffect(() => {
    builtRef.current?.setBloom(c.bloomStrength, c.bloomThreshold)
    postUniforms.lutIntensity.value = c.lutIntensity
    postUniforms.vignetteOffset.value = c.vignetteOffset
    postUniforms.vignetteDarkness.value = c.vignetteDarkness
  }, [c, antiAliasing])

  useEffect(() => {
    postUniforms.grain.value = grainIntensityFor(reducedMotion)
    motionScale.value = motionScaleFor(reducedMotion)
  }, [reducedMotion])

  // Priority 1: R3F stops auto-rendering; this component owns the frame.
  useFrame((state) => {
    const built = builtRef.current
    if (c.enabled && built) {
      built.pipeline.render()
      return
    }
    state.gl.render(state.scene, state.camera)
  }, 1)

  return null
}
