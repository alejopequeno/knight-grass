import { Leva } from 'leva'
import { AudioBoot, AudioController } from './audio/audio-controller'
import { Experience } from './experience'
import { useDebugPanel } from './lib/debug-panel'
import { WebGPUGate } from './renderer/webgpu-gate'

function App() {
  const debugVisible = useDebugPanel()

  return (
    <AudioController>
      {/* Tweak panel: hidden by default; ?debug opens it, Option+D toggles it. */}
      <Leva hidden={!debugVisible} />
      <AudioBoot />
      <WebGPUGate>{(reportFailure) => <Experience onRendererFailure={reportFailure} />}</WebGPUGate>
    </AudioController>
  )
}

export default App
