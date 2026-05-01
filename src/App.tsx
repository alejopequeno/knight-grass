import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Suspense, useCallback, useRef, useState } from 'react'
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
import { StartScreen } from './start-screen'

function App() {
  const movement = useKeyboard()
  const characterRef = useRef<CharacterHandle>(null)
  const cameraYawRef = useRef(0)
  const [started, setStarted] = useState(false)
  const handlePlay = useCallback(() => setStarted(true), [])

  return (
    <AudioController>
      {/* Canvas mounts immediately so the Paladin / grass / FBX assets start
          downloading and compiling while the user reads the controls. */}
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

      {/* Audio init waits until Play is clicked — autoplay policies block it
          before a real user gesture anyway, and starting the wind loop while
          the splash is up feels off. */}
      {started && <AudioBoot />}

      {started && (
        <>
          <div className="hud">
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> move &nbsp;·&nbsp; <kbd>Shift</kbd> run &nbsp;·&nbsp;{' '}
            <kbd>Space</kbd> jump &nbsp;·&nbsp; <kbd>LMB</kbd> attack &nbsp;·&nbsp;{' '}
            <kbd>RMB</kbd>/<kbd>Q</kbd> block &nbsp;·&nbsp; click to look
          </div>
          <AudioHud />
        </>
      )}

      {!started && <StartScreen onPlay={handlePlay} />}
    </AudioController>
  )
}

export default App
