import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // lettra imports `three/webgpu`; pre-bundling it separately inlined a second
  // copy of three, so its meshes and our scene graph used different Matrix4
  // classes. Serve lettra as-is and force a single three instance.
  resolve: { dedupe: ['three'] },
  optimizeDeps: { exclude: ['lettra'] },
})
