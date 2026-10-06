import { Leva } from 'leva'
import { AudioBoot, AudioController } from './audio/audio-controller'
import { Experience } from './experience'
import { WebGPUGate } from './renderer/webgpu-gate'

function App() {
  return (
    <AudioController>
      {/* Hidden tweak panel — useControls calls still work. */}
      <Leva hidden />
      <AudioBoot />
      <WebGPUGate>{(reportFailure) => <Experience onRendererFailure={reportFailure} />}</WebGPUGate>
    </AudioController>
  )
}

export default App
