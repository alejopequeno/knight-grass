import {
  Bloom,
  EffectComposer,
  Vignette,
} from '@react-three/postprocessing'
import { useControls } from 'leva'
import { BlendFunction, KernelSize } from 'postprocessing'

export function Post() {
  const {
    enabled,
    bloomIntensity,
    bloomLuminanceThreshold,
    bloomLuminanceSmoothing,
    bloomMipmapBlur,
    vignetteOffset,
    vignetteDarkness,
  } = useControls('post', {
    enabled: true,
    bloomIntensity: { value: 0.25, min: 0, max: 3, step: 0.05 },
    bloomLuminanceThreshold: { value: 0.85, min: 0, max: 2, step: 0.01 },
    bloomLuminanceSmoothing: { value: 0.2, min: 0, max: 1, step: 0.01 },
    bloomMipmapBlur: true,
    vignetteOffset: { value: 0.25, min: 0, max: 1, step: 0.01 },
    vignetteDarkness: { value: 0.85, min: 0, max: 2, step: 0.01 },
  })

  if (!enabled) return null

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom
        intensity={bloomIntensity}
        luminanceThreshold={bloomLuminanceThreshold}
        luminanceSmoothing={bloomLuminanceSmoothing}
        mipmapBlur={bloomMipmapBlur}
        kernelSize={KernelSize.LARGE}
      />
      <Vignette
        offset={vignetteOffset}
        darkness={vignetteDarkness}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  )
}
