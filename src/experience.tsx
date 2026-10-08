import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Suspense, useCallback, useMemo, useRef } from 'react'
import { AtmosphereControls } from './atmosphere/atmosphere-controls'
import { Lights } from './atmosphere/lights'
import { Sky } from './atmosphere/sky'
import { AudioFeedback } from './audio/audio-feedback'
import { AudioHud } from './audio/audio-hud'
import { ErrorBoundary } from './components/error-boundary'
import { useKeyboard } from './controls/use-keyboard'
import { Curtain } from './curtain'
import { useHudVisible } from './lib/hud-visibility'
import { setCharacterStatus, useCharacterStatus } from './lib/load-state'
import {
  createRendererFactory,
  instantiateWebGPURenderer,
  type RendererFailureReason,
} from './renderer/create-renderer'
import { RenderPipelineEffect } from './renderer/render-pipeline'
import { Character, type CharacterHandle } from './scene/character'
import { FieldProps } from './scene/field-props'
import { FollowCamera } from './scene/follow-camera'
import { Horizon } from './scene/horizon'
import { Grass } from './grass/grass'
import { FOLLOW_FOV } from './lib/camera-shot'
import { StoryDirector } from './story/story-director'
import { StoryProps } from './story/story-props'
import { StoryLiveRegion } from './story/story-live-region'
import { GrassControls } from './grass/grass-controls'
import { Ground } from './scene/ground'
import { PlayerUniformSync } from './scene/player-uniform-sync'

const GRAVITY: [number, number, number] = [0, -25, 0]
// Fixed 120 Hz physics with interpolation: smooth on 120 Hz displays (a 60 Hz
// step moved the paladin only every other frame) and always small steps, so a
// long frame (e.g. parsing a big GLB) can never tunnel the body through the
// ground the way a variable step did.
const PHYSICS_TIME_STEP = 1 / 120
const CAMERA_POSITION: [number, number, number] = [0, 5, 10]
const CAMERA = { position: CAMERA_POSITION, fov: FOLLOW_FOV, near: 0.1, far: 500 }
const DPR_RANGE: [number, number] = [1, 1.5]

type ExperienceProps = {
  onRendererFailure: (reason: RendererFailureReason, detail: string) => void
}

export function Experience({ onRendererFailure }: ExperienceProps) {
  const movementRef = useKeyboard()
  const hudVisible = useHudVisible()
  const characterRef = useRef<CharacterHandle>(null)
  const cameraYawRef = useRef(0)
  const characterStatus = useCharacterStatus()
  // Asset failures (HDRI, textures, model) belong to the curtain's load
  // error, not to the WebGPU gate's renderer message.
  const handleSceneError = useCallback((error: unknown) => {
    console.error('[scene] failed to load:', error)
    setCharacterStatus('failed')
  }, [])
  const rendererFactory = useMemo(
    () => createRendererFactory({ onFailure: onRendererFailure, instantiate: instantiateWebGPURenderer }),
    [onRendererFailure],
  )

  return (
    <>
      <Canvas shadows camera={CAMERA} gl={rendererFactory} dpr={DPR_RANGE}>
        <AtmosphereControls />
        <GrassControls />
        <ErrorBoundary onError={handleSceneError}>
          <Suspense fallback={null}>
            <Sky />
            <Lights />
            <Physics gravity={GRAVITY} timeStep={PHYSICS_TIME_STEP}>
              <Ground />
              <Character ref={characterRef} movementRef={movementRef} cameraYawRef={cameraYawRef} />
              <StoryProps />
              <Horizon />
              <FieldProps />
            </Physics>
            <PlayerUniformSync characterRef={characterRef} />
            <Grass />
            <StoryDirector characterRef={characterRef} cameraYawRef={cameraYawRef} />

            <AudioFeedback characterRef={characterRef} />
          </Suspense>
        </ErrorBoundary>
        <FollowCamera targetRef={characterRef} yawRef={cameraYawRef} movementRef={movementRef} />
        <RenderPipelineEffect />
      </Canvas>
      <ul className="hud" aria-label="Controls" data-idle={hudVisible}>
        <li>
          <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd> move
        </li>
        <li>
          <kbd>Shift</kbd> run
        </li>
        <li>
          <kbd>Space</kbd> jump
        </li>
        <li>
          <kbd>F</kbd>/<kbd>Click</kbd> attack
        </li>
        <li>
          <kbd>Q</kbd>/<kbd>Right click</kbd> block
        </li>
        <li>
          <kbd>J</kbd>
          <kbd>L</kbd>
          <kbd>I</kbd>
          <kbd>K</kbd> or click to look
        </li>
      </ul>
      <Curtain />
      <StoryLiveRegion />
      {/* Inert until the scene is visible: no focus on a covered control. */}
      <AudioHud inert={characterStatus !== 'ready'} />
    </>
  )
}
