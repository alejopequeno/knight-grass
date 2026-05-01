import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Leva } from 'leva'
import { Suspense, useRef } from 'react'
import * as THREE from 'three'
import { AudioBoot, AudioController } from './audio/audio-controller'
import { AudioFeedback } from './audio/audio-feedback'
import { AudioHud } from './audio/audio-hud'
import { Character, type CharacterHandle } from './scene/character'
import { FollowCamera } from './scene/follow-camera'
import { Grass } from './scene/grass'
import { Ground } from './scene/ground'
import { Post } from './scene/post'
import { Sky } from './scene/sky'
import { useKeyboard } from './controls/use-keyboard'
import { Curtain } from './curtain'

function App() {
  const movement = useKeyboard()
  const characterRef = useRef<CharacterHandle>(null)
  const cameraYawRef = useRef(0)

  return (
    <AudioController>
      {/* Hide the leva panel — useControls calls still work, the floating
          tweaker UI is just suppressed. */}
      <Leva hidden />
      <AudioBoot />
      <Canvas
        shadows
        camera={{ position: [0, 5, 10], fov: 75, near: 0.1, far: 500 }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.55,
        }}
        dpr={[1, 1.5]}
      >
        <Suspense fallback={null}>
          <Sky />
          <Physics gravity={[0, -25, 0]}>
            <Ground />
            <Character
              ref={characterRef}
              movement={movement}
              cameraYawRef={cameraYawRef}
            />
          </Physics>
          <Grass characterRef={characterRef} />
          <AudioFeedback characterRef={characterRef} />
        </Suspense>

        <FollowCamera targetRef={characterRef} yawRef={cameraYawRef} />
        <Post />
      </Canvas>

      <div className="hud">
        <kbd>W</kbd>
        <kbd>A</kbd>
        <kbd>S</kbd>
        <kbd>D</kbd> move &nbsp;·&nbsp; <kbd>Shift</kbd> run &nbsp;·&nbsp;{' '}
        <kbd>Space</kbd> jump &nbsp;·&nbsp; <kbd>LMB</kbd> attack &nbsp;·&nbsp;{' '}
        <kbd>RMB</kbd>/<kbd>Q</kbd> block &nbsp;·&nbsp; click to look
      </div>
      <AudioHud />
      <Curtain />
    </AudioController>
  )
}

export default App
