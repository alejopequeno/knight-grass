import { defineConfig } from 'vitest/config'

export default defineConfig({
  // jsdom gives tests a real <canvas> and window.matchMedia without casts.
  test: { include: ['src/**/*.test.ts'], environment: 'jsdom' },
})
