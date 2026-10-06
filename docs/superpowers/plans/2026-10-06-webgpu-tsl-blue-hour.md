# walk-grass WebGPU + TSL + Blue Hour — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move walk-grass from `WebGLRenderer` + GLSL to `WebGPURenderer` + TSL, port the grass 1:1, then give the scene a cinematic blue-hour look (SkyMesh, TSL stars, compute fireflies, shared height fog, moon rim, RenderPipeline post).

**Architecture:** R3F v9 stays; `<Canvas gl>` receives an async `WebGPURenderer` factory behind a WebGPU gate. All shader parameters live as module-level TSL `uniform()` nodes (`atmosphere.ts`, `grass-material.ts`, `shared-uniforms.ts`) so materials share them and React effects can write `.value` without tripping React Compiler immutability rules. Post-processing is a `RenderPipeline` rendered from `useFrame(..., 1)`.

**Tech Stack:** three r184 (`three/webgpu`, `three/tsl`, `three/addons/tsl/display/*`, `SkyMesh`, `HDRLoader`), @react-three/fiber 9, @react-three/drei 10 (only `useTexture`, `useProgress`), @react-three/rapier 2, leva, vitest 5, @playwright/test.

**Spec:** `docs/superpowers/specs/2026-10-06-webgpu-tsl-blue-hour-design.md`

**Deviation from spec (agreed simplification):** bloom runs on the full HDR output with a luminance threshold instead of an emissive MRT target. Stars and fireflies are written well above 1.0 so they bloom; the MRT carries only `velocity` for TRAA. This avoids giving every material an emissive output.

## Global Constraints

- **No git commits.** The user wants every change local in the working tree. Where a task would commit, run `git status --short` instead and confirm only the expected files changed.
- Target: desktop browsers with WebGPU (Chrome/Edge, Safari 26+). No WebGL fallback; show the gate screen instead.
- Performance: 60 fps at dpr 1.5 on the user's Mac while walking for 10 s.
- TypeScript strict; no `any`; no unsafe `as` casts (use type guards / `instanceof`).
- File and directory names in kebab-case; all code, comments and UI copy in English.
- Every task ends with `pnpm lint`, `pnpm test`, `npx tsc -b` and `pnpm build` at zero errors.
- Keyboard: WASD/arrows, Shift, Space, F, Q, J/L/I/K keep working; Space/Enter on a focused control must not trigger game actions; focus stays visible.
- React Compiler lint (`react-hooks` v7) is on: never assign to values returned by hooks (`useMemo`, `useState`, `useThree`, `useLoader`). Mutate refs, module-level objects, or objects received as `useFrame` callback arguments.
- Props holding refs must end in `Ref` (the compiler only treats `*Ref` names as refs).
- Leva stays hidden (`<Leva hidden />`); its folders keep working.
- Import WebGPU classes from `three/webgpu` and TSL from `three/tsl`. Core classes from `three` are the same objects (shared build), so existing `import * as THREE from 'three'` code keeps working.

## Review Focus

1. **Window resize / dpr change** — canvas and every post-processing render target must follow the new size without errors or stretched output. Test: `e2e/smoke.spec.ts` resize case (Task 2).
2. **Tab hidden then shown (huge frame delta)** — fireflies must not teleport or explode. Test: `clampFrameDelta` unit tests (Task 6).
3. **GPU device lost mid-session** — an explanatory overlay instead of a frozen/black canvas. Test: `create-renderer.test.ts` device-lost case (Task 2).
4. **`renderer.init()` rejects** (driver/adapter failure) — gate shows the init-failed message, no crash loop. Test: `create-renderer.test.ts` init-failure case (Task 2).
5. **`prefers-reduced-motion: reduce`** — film grain off and no flicker. Test: `grainIntensityFor` unit test (Task 7); curtain already respects it.

---

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/lib/seeded-random.ts` (+ test) | Deterministic PRNG (mulberry32) | 1 |
| `src/lib/terrain.ts` (+ test) | Octave table → TS function, TSL node (GLSL string kept until Task 8) | 1, 8 |
| `src/lib/reduced-motion.ts` | `prefersReducedMotion()` shared by curtain + post | 1 |
| `src/renderer/webgpu-support.ts` (+ test) | Pure WebGPU detection | 2 |
| `src/renderer/create-renderer.ts` (+ test) | Async renderer factory, init/device-lost reporting | 2 |
| `src/renderer/as-webgpu-renderer.ts` | `instanceof` narrowing of R3F's `gl` | 2 |
| `src/renderer/webgpu-gate.tsx` | Detection + error boundary + failure screen | 2 |
| `src/experience.tsx` | Canvas + scene graph + HUD + curtain (moved out of `App.tsx`) | 2 |
| `src/lib/shared-uniforms.ts` | `playerPosition` uniform shared by grass/fireflies | 3 |
| `src/scene/player-uniform-sync.tsx` | Writes the character position into `playerPosition` | 3 |
| `src/scene/grass-material.ts` | Grass TSL material + `grassUniforms` | 3 |
| `src/atmosphere/atmosphere.ts` (+ test) | Shared atmosphere uniforms + direction math | 4 |
| `src/atmosphere/height-fog.ts` | `heightFogNode` for `scene.fogNode` | 4 |
| `src/atmosphere/atmosphere-controls.tsx` | Leva → atmosphere uniforms | 4 |
| `src/atmosphere/lights.tsx` | Moon key (shadows), sun fill, hemisphere | 4 |
| `src/atmosphere/sky.tsx` | SkyMesh + HDR environment + fog attach | 2 → 4 (moved from `src/scene/sky.tsx`) |
| `src/atmosphere/stars.tsx` | TSL star sprites | 5 |
| `src/atmosphere/moon-rim.ts` (+ test) | Rim node + Phong → `MeshStandardNodeMaterial` conversion | 5 |
| `src/lib/frame-delta.ts` (+ test) | `clampFrameDelta` | 6 |
| `src/atmosphere/fireflies.tsx` | Compute fireflies | 6 |
| `src/renderer/blue-hour-lut.ts` (+ test) | Procedural 3D LUT data | 7 |
| `src/renderer/post-settings.ts` (+ test) | `grainIntensityFor(reducedMotion)` | 7 |
| `src/renderer/render-pipeline.tsx` | RenderPipeline + leva | 7 |
| `e2e/*.spec.ts`, `playwright.config.ts`, `vitest.config.ts` | Browser + unit test harness | 2 |

Deleted by Task 8: `src/shaders/`, `src/lib/scene-state.ts`, `src/scene/post.tsx`, `postprocessing`, `@react-three/postprocessing`.

---

### Task 1: Deterministic foundations + WebGL baseline capture

Makes grass/ground generation reproducible so WebGL and WebGPU screenshots are comparable, adds the TSL terrain node, and records the WebGL baseline **before** the renderer changes.

**Files:**
- Create: `src/lib/seeded-random.ts`, `src/lib/seeded-random.test.ts`, `src/lib/terrain.test.ts`, `src/lib/reduced-motion.ts`, `scripts/capture-baseline.mjs`
- Modify: `src/lib/terrain.ts`, `src/scene/grass.tsx`, `src/scene/ground.tsx`, `src/curtain.tsx`, `.gitignore`

**Interfaces:**
- Produces: `createSeededRandom(seed: number): RandomSource` where `type RandomSource = () => number` (values in `[0, 1)`); `terrainHeightNode(p: Node<'vec2'>): Node<'float'>`; `prefersReducedMotion(): boolean`; `REDUCED_MOTION_QUERY: string`.

- [ ] **Step 1: Write the failing PRNG test**

`src/lib/seeded-random.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createSeededRandom } from './seeded-random'

const SAMPLE_COUNT = 1000

describe('createSeededRandom', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = createSeededRandom(42)
    const b = createSeededRandom(42)
    for (let i = 0; i < SAMPLE_COUNT; i++) expect(a()).toBe(b())
  })

  it('produces different sequences for different seeds', () => {
    const a = createSeededRandom(1)
    const b = createSeededRandom(2)
    const same = Array.from({ length: 10 }, () => a() === b()).every(Boolean)
    expect(same).toBe(false)
  })

  it('stays within [0, 1)', () => {
    const random = createSeededRandom(7)
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const value = random()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module './seeded-random'`)

Run: `pnpm test -- src/lib/seeded-random.test.ts`

- [ ] **Step 3: Implement**

`src/lib/seeded-random.ts`:
```ts
export type RandomSource = () => number

const UINT32_RANGE = 4294967296
const MULBERRY_INCREMENT = 0x6d2b79f5

// mulberry32: tiny, fast, good enough for procedural placement. Same seed →
// same sequence, so generated content is identical across reloads and
// renderers (needed for WebGL vs WebGPU parity screenshots).
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0
  return () => {
    state = (state + MULBERRY_INCREMENT) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE
  }
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `pnpm test -- src/lib/seeded-random.test.ts`

- [ ] **Step 5: Terrain regression test (locks current heights before adding the TSL node)**

`src/lib/terrain.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { terrainHeight } from './terrain'

// Reference values from the original hand-written formula:
// a = sin(x*.04)*cos(z*.04)*1.5; b = sin(x*.13+2)*cos(z*.11+1)*.6; c = sin(x*.28-1)*cos(z*.31-2)*.25
function referenceHeight(x: number, z: number): number {
  const a = Math.sin(x * 0.04) * Math.cos(z * 0.04) * 1.5
  const b = Math.sin(x * 0.13 + 2) * Math.cos(z * 0.11 + 1) * 0.6
  const c = Math.sin(x * 0.28 - 1) * Math.cos(z * 0.31 - 2) * 0.25
  return a + b + c
}

const SAMPLE_POINTS: ReadonlyArray<[number, number]> = [
  [0, 0], [10, -4], [-37.5, 81.25], [199, -199], [3.3, 3.3],
]

describe('terrainHeight', () => {
  it.each(SAMPLE_POINTS)('matches the reference formula at (%d, %d)', (x, z) => {
    expect(terrainHeight(x, z)).toBeCloseTo(referenceHeight(x, z), 10)
  })
})
```
Run: `pnpm test -- src/lib/terrain.test.ts` — expect PASS (guards the refactor below).

- [ ] **Step 6: Add the TSL terrain node** — append to `src/lib/terrain.ts` (keep `TERRAIN_HEIGHT_GLSL` until Task 8):
```ts
import { cos, float, sin } from 'three/tsl'
import type { Node } from 'three/webgpu'

// TSL twin of terrainHeight, generated from the same octave table.
export function terrainHeightNode(p: Node<'vec2'>): Node<'float'> {
  let height: Node<'float'> = float(0)
  for (const octave of TERRAIN_OCTAVES) {
    const wave = sin(p.x.mul(octave.frequencyX).add(octave.phaseX))
      .mul(cos(p.y.mul(octave.frequencyZ).add(octave.phaseZ)))
      .mul(octave.amplitude)
    height = height.add(wave)
  }
  return height
}
```
(Move the two imports to the top of the file.)

- [ ] **Step 7: Seed grass and ground generation**

In `src/scene/grass.tsx`: add `import { createSeededRandom, type RandomSource } from '../lib/seeded-random'`, constants `const GRASS_CARD_SEED = 1337` and `const GRASS_LAYOUT_SEED = 2024`. Change `buildGrassCardTexture()` to `buildGrassCardTexture(random: RandomSource)` and replace every `Math.random()` inside it with `random()`; call it as `buildGrassCardTexture(createSeededRandom(GRASS_CARD_SEED))`. In the per-instance `useEffect`, create `const random = createSeededRandom(GRASS_LAYOUT_SEED)` at the top and replace every `Math.random()` in the loop with `random()`.

In `src/scene/ground.tsx`: same pattern — `const THATCH_SEED = 99`, `buildThatchTexture(random: RandomSource)`, all `Math.random()` → `random()`, call with `createSeededRandom(THATCH_SEED)`.

- [ ] **Step 8: Extract reduced-motion helper**

`src/lib/reduced-motion.ts`:
```ts
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}
```
In `src/curtain.tsx` delete the local `REDUCED_MOTION_QUERY` / `prefersReducedMotion` and import them from `./lib/reduced-motion`.

- [ ] **Step 9: Baseline capture script**

Add to `.gitignore`:
```
test-artifacts/
test-results/
playwright-report/
```

`scripts/capture-baseline.mjs`:
```js
// Captures a fixed-pose screenshot of whatever renderer the dev server runs.
// Usage: node scripts/capture-baseline.mjs <output-name>
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:5199/'
const SETTLE_MS = 4000
const name = process.argv[2] ?? 'baseline'

await mkdir('test-artifacts', { recursive: true })
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto(BASE_URL)
await page.waitForFunction(() => !document.querySelector('.curtain'), null, { timeout: 60000 })
await page.waitForTimeout(SETTLE_MS)
await page.screenshot({ path: `test-artifacts/${name}.png` })
await browser.close()
console.log(`saved test-artifacts/${name}.png`)
```

- [ ] **Step 10: Capture the WebGL baseline**

Run: `pnpm dev --port 5199 --strictPort` (background), then `node scripts/capture-baseline.mjs webgl-grass`. Expected: `saved test-artifacts/webgl-grass.png`. Open it and confirm the scene rendered (grass, sky, paladin). Run it twice and confirm the grass layout is identical (wind phase may differ).

- [ ] **Step 11: Verify + no commit**

Run: `pnpm lint && pnpm test && npx tsc -b && pnpm build` — all zero. `git status --short` shows only this task's files.

---

### Task 2: WebGPU renderer, gate, and test harness

Switches the Canvas to `WebGPURenderer`. Anything that cannot run on WebGPU is removed or swapped **in this task** so the scene renders: GLSL grass is unmounted (back in Task 3), pmndrs post is unmounted (replaced in Task 7), drei `Sky`/`Stars`/`Environment` are replaced by `SkyMesh` + `HDRLoader` (stars return in Task 5).

**Files:**
- Create: `src/renderer/webgpu-support.ts`, `src/renderer/webgpu-support.test.ts`, `src/renderer/create-renderer.ts`, `src/renderer/create-renderer.test.ts`, `src/renderer/as-webgpu-renderer.ts`, `src/renderer/webgpu-gate.tsx`, `src/experience.tsx`, `vitest.config.ts`, `playwright.config.ts`, `e2e/smoke.spec.ts`, `e2e/capture.spec.ts`
- Modify: `src/App.tsx`, `src/scene/sky.tsx`, `src/index.css`, `package.json`, `tsconfig.node.json`

**Interfaces:**
- Produces:
  - `detectWebGPU(gpu?: unknown): Promise<WebGPUSupport>`; `type WebGPUSupport = { supported: true } | { supported: false; reason: 'no-api' | 'no-adapter' }`
  - `type RendererFailureReason = 'init-failed' | 'device-lost'`
  - `type ManagedRenderer = { init(): Promise<unknown>; onDeviceLost(info: { message: string }): void; render(scene: Scene, camera: Camera): unknown }`
  - `createRendererFactory(options: { onFailure: (reason: RendererFailureReason, detail: string) => void; instantiate: (canvas: HTMLCanvasElement | OffscreenCanvas) => ManagedRenderer }): (props: { canvas: HTMLCanvasElement | OffscreenCanvas }) => Promise<ManagedRenderer>`
  - `instantiateWebGPURenderer(canvas): WebGPURenderer`
  - `asWebGPURenderer(gl: unknown): WebGPURenderer`
  - `<WebGPUGate>{(reportFailure: (reason: RendererFailureReason, detail: string) => void) => ReactNode}</WebGPUGate>`
  - `<Experience onRendererFailure={...} />`

- [ ] **Step 1: Test harness config**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // jsdom gives tests a real <canvas> and window.matchMedia without casts.
  test: { include: ['src/**/*.test.ts'], environment: 'jsdom' },
})
```

Run: `pnpm add -D @playwright/test jsdom` then `npx playwright install chromium`. Run `pnpm test` — the existing animator tests must still pass under jsdom.

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test'

const PORT = 5199

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    // Headed: WebGPU in headless Chromium on macOS is unreliable.
    headless: false,
    launchOptions: { args: ['--enable-unsafe-webgpu', '--use-angle=metal'] },
  },
  webServer: {
    command: `pnpm dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
  },
})
```

`package.json` scripts: add `"e2e": "playwright test --grep-invert @capture"` and `"capture": "playwright test --grep @capture"`.

`tsconfig.node.json` `include`: add `"vitest.config.ts"`, `"playwright.config.ts"`, `"e2e"`.

- [ ] **Step 2: Failing detection tests**

`src/renderer/webgpu-support.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { detectWebGPU } from './webgpu-support'

describe('detectWebGPU', () => {
  it('reports no-api when navigator.gpu is missing', async () => {
    await expect(detectWebGPU(undefined)).resolves.toEqual({ supported: false, reason: 'no-api' })
  })

  it('reports no-api when gpu has no requestAdapter', async () => {
    await expect(detectWebGPU({})).resolves.toEqual({ supported: false, reason: 'no-api' })
  })

  it('reports no-adapter when requestAdapter resolves null', async () => {
    const gpu = { requestAdapter: async () => null }
    await expect(detectWebGPU(gpu)).resolves.toEqual({ supported: false, reason: 'no-adapter' })
  })

  it('reports no-adapter when requestAdapter throws', async () => {
    const gpu = { requestAdapter: async () => { throw new Error('boom') } }
    await expect(detectWebGPU(gpu)).resolves.toEqual({ supported: false, reason: 'no-adapter' })
  })

  it('reports supported when an adapter is returned', async () => {
    const gpu = { requestAdapter: async () => ({}) }
    await expect(detectWebGPU(gpu)).resolves.toEqual({ supported: true })
  })
})
```
Run: `pnpm test -- src/renderer/webgpu-support.test.ts` — expect FAIL (module missing).

- [ ] **Step 3: Implement detection**

`src/renderer/webgpu-support.ts`:
```ts
export type WebGPUUnsupportedReason = 'no-api' | 'no-adapter'
export type WebGPUSupport = { supported: true } | { supported: false; reason: WebGPUUnsupportedReason }

type GpuLike = { requestAdapter: () => Promise<unknown> }

function isGpuLike(value: unknown): value is GpuLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'requestAdapter' in value &&
    typeof value.requestAdapter === 'function'
  )
}

function navigatorGpu(): unknown {
  return typeof navigator === 'undefined' ? undefined : Reflect.get(navigator, 'gpu')
}

export async function detectWebGPU(gpu: unknown = navigatorGpu()): Promise<WebGPUSupport> {
  if (!isGpuLike(gpu)) return { supported: false, reason: 'no-api' }
  try {
    const adapter = await gpu.requestAdapter()
    return adapter ? { supported: true } : { supported: false, reason: 'no-adapter' }
  } catch {
    return { supported: false, reason: 'no-adapter' }
  }
}
```
Run the test — expect PASS.

- [ ] **Step 4: Failing renderer-factory tests (Review Focus 3 + 4)**

`src/renderer/create-renderer.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { createRendererFactory, type ManagedRenderer } from './create-renderer'

function fakeRenderer(init: () => Promise<unknown>): ManagedRenderer {
  return { init, onDeviceLost: () => {}, render: () => undefined }
}

const canvas = document.createElement('canvas')

describe('createRendererFactory', () => {
  it('resolves the renderer once init succeeds', async () => {
    const renderer = fakeRenderer(async () => undefined)
    const onFailure = vi.fn()
    const factory = createRendererFactory({ onFailure, instantiate: () => renderer })
    await expect(factory({ canvas })).resolves.toBe(renderer)
    expect(onFailure).not.toHaveBeenCalled()
  })

  it('reports init-failed and rejects when init throws', async () => {
    const onFailure = vi.fn()
    const factory = createRendererFactory({
      onFailure,
      instantiate: () => fakeRenderer(async () => { throw new Error('no device') }),
    })
    await expect(factory({ canvas })).rejects.toThrow('no device')
    expect(onFailure).toHaveBeenCalledWith('init-failed', 'no device')
  })

  it('reports device-lost when the GPU device is lost', async () => {
    const renderer = fakeRenderer(async () => undefined)
    const onFailure = vi.fn()
    const factory = createRendererFactory({ onFailure, instantiate: () => renderer })
    await factory({ canvas })
    renderer.onDeviceLost({ message: 'GPU reset' })
    expect(onFailure).toHaveBeenCalledWith('device-lost', 'GPU reset')
  })
})
```
Run — expect FAIL (module missing).

- [ ] **Step 5: Implement the factory and narrowing helper**

`src/renderer/create-renderer.ts`:
```ts
import type { Camera, Scene } from 'three'
import { AgXToneMapping, WebGPURenderer } from 'three/webgpu'

export type RendererFailureReason = 'init-failed' | 'device-lost'
export type RendererCanvas = HTMLCanvasElement | OffscreenCanvas

// Method syntax keeps WebGPURenderer assignable (its DeviceLostInfo is wider).
export type ManagedRenderer = {
  init(): Promise<unknown>
  onDeviceLost(info: { message: string }): void
  render(scene: Scene, camera: Camera): unknown
}

type RendererFactoryOptions = {
  onFailure: (reason: RendererFailureReason, detail: string) => void
  instantiate: (canvas: RendererCanvas) => ManagedRenderer
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function instantiateWebGPURenderer(canvas: RendererCanvas): WebGPURenderer {
  const renderer = new WebGPURenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.toneMapping = AgXToneMapping
  return renderer
}

// R3F `gl` factory: awaits init, and turns init failures and device loss
// into explicit reports so the gate can show a message instead of a black canvas.
export function createRendererFactory({ onFailure, instantiate }: RendererFactoryOptions) {
  return async ({ canvas }: { canvas: RendererCanvas }): Promise<ManagedRenderer> => {
    const renderer = instantiate(canvas)
    renderer.onDeviceLost = (info) => {
      console.error('[renderer] GPU device lost:', info.message)
      onFailure('device-lost', info.message)
    }
    try {
      await renderer.init()
    } catch (error: unknown) {
      onFailure('init-failed', errorMessage(error))
      throw error
    }
    return renderer
  }
}
```

`src/renderer/as-webgpu-renderer.ts`:
```ts
import { WebGPURenderer } from 'three/webgpu'

// R3F types `state.gl` as WebGLRenderer; at runtime it is our WebGPURenderer.
export function asWebGPURenderer(gl: unknown): WebGPURenderer {
  if (gl instanceof WebGPURenderer) return gl
  throw new Error('Expected a WebGPURenderer — is the Canvas using createRendererFactory?')
}
```
Run `pnpm test -- src/renderer` — expect PASS.

- [ ] **Step 6: Gate component**

`src/renderer/webgpu-gate.tsx`:
```tsx
import { Component, useCallback, useEffect, useState, type ReactNode } from 'react'
import type { RendererFailureReason } from './create-renderer'
import { detectWebGPU, type WebGPUUnsupportedReason } from './webgpu-support'

type GateFailure = WebGPUUnsupportedReason | RendererFailureReason
type GateState =
  | { status: 'checking' }
  | { status: 'ready' }
  | { status: 'failed'; reason: GateFailure; detail?: string }

const FAILURE_COPY: Record<GateFailure, { title: string; body: string }> = {
  'no-api': {
    title: 'This experiment needs WebGPU',
    body: 'Open it in a recent Chrome, Edge or Safari (version 26 or later) on desktop.',
  },
  'no-adapter': {
    title: 'No compatible GPU found',
    body: 'WebGPU is available but no GPU adapter was returned. Try updating your browser or graphics drivers.',
  },
  'init-failed': {
    title: 'The renderer failed to start',
    body: 'WebGPU could not be initialised on this device. Reload the page to try again.',
  },
  'device-lost': {
    title: 'The GPU connection was lost',
    body: 'Your graphics device was reset or removed. Reload the page to continue.',
  },
}

type ReportFailure = (reason: RendererFailureReason, detail: string) => void

type BoundaryProps = { children: ReactNode; onError: (error: unknown) => void }

class RendererErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    this.props.onError(error)
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

export function WebGPUGate({ children }: { children: (reportFailure: ReportFailure) => ReactNode }) {
  const [state, setState] = useState<GateState>({ status: 'checking' })

  useEffect(() => {
    let cancelled = false
    void detectWebGPU().then((support) => {
      if (cancelled) return
      setState(support.supported ? { status: 'ready' } : { status: 'failed', reason: support.reason })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const reportFailure = useCallback<ReportFailure>((reason, detail) => {
    setState({ status: 'failed', reason, detail })
  }, [])

  const handleBoundaryError = useCallback(
    (error: unknown) => reportFailure('init-failed', error instanceof Error ? error.message : String(error)),
    [reportFailure],
  )

  if (state.status === 'checking') return null

  if (state.status === 'failed') {
    const copy = FAILURE_COPY[state.reason]
    return (
      <div className="gate" role="alert">
        <h1 className="gate__title">{copy.title}</h1>
        <p className="gate__body">{copy.body}</p>
      </div>
    )
  }

  return <RendererErrorBoundary onError={handleBoundaryError}>{children(reportFailure)}</RendererErrorBoundary>
}
```

Append to `src/index.css`:
```css
/* ---------- WebGPU gate ---------- */

.gate {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-content: center;
  gap: 12px;
  padding: 16px;
  text-align: center;
  background: var(--color-backdrop);
  color: var(--color-text);
}

.gate__title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.gate__body {
  margin: 0;
  max-width: 44ch;
  font-size: 15px;
  line-height: 1.5;
}
```

- [ ] **Step 7: Move the scene into `src/experience.tsx` and wire the factory**

`src/experience.tsx` — contents of today's `App.tsx` scene part, with these changes: Canvas `gl={rendererFactory}`; no `gl={{ ... }}` object; `<Grass>` and `<Post>` removed (comment-free; they return in Tasks 3 and 7); HUD list and `<Curtain />` live here:
```tsx
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Suspense, useMemo, useRef } from 'react'
import { AudioFeedback } from './audio/audio-feedback'
import { useKeyboard } from './controls/use-keyboard'
import { Curtain } from './curtain'
import { createRendererFactory, instantiateWebGPURenderer, type RendererFailureReason } from './renderer/create-renderer'
import { Character, type CharacterHandle } from './scene/character'
import { FollowCamera } from './scene/follow-camera'
import { Ground } from './scene/ground'
import { Sky } from './scene/sky'

const GRAVITY: [number, number, number] = [0, -25, 0]
const CAMERA_POSITION: [number, number, number] = [0, 5, 10]
const CAMERA = { position: CAMERA_POSITION, fov: 75, near: 0.1, far: 500 }
const DPR_RANGE: [number, number] = [1, 1.5]

type ExperienceProps = {
  onRendererFailure: (reason: RendererFailureReason, detail: string) => void
}

export function Experience({ onRendererFailure }: ExperienceProps) {
  const movementRef = useKeyboard()
  const characterRef = useRef<CharacterHandle>(null)
  const cameraYawRef = useRef(0)
  const rendererFactory = useMemo(
    () => createRendererFactory({ onFailure: onRendererFailure, instantiate: instantiateWebGPURenderer }),
    [onRendererFailure],
  )

  return (
    <>
      <Canvas shadows camera={CAMERA} gl={rendererFactory} dpr={DPR_RANGE}>
        <Suspense fallback={null}>
          <Sky />
          <Physics gravity={GRAVITY}>
            <Ground />
            <Character ref={characterRef} movementRef={movementRef} cameraYawRef={cameraYawRef} />
          </Physics>
          <AudioFeedback characterRef={characterRef} />
        </Suspense>
        <FollowCamera targetRef={characterRef} yawRef={cameraYawRef} movementRef={movementRef} />
      </Canvas>
      {/* paste the existing <ul className="hud"> … </ul> from App.tsx unchanged */}
      <Curtain />
    </>
  )
}
```
> Replace the JSX comment above with the literal `<ul className="hud" aria-label="Controls">…</ul>` block currently in `src/App.tsx` (no comment left in the final file).

`src/App.tsx`:
```tsx
import { Leva } from 'leva'
import { AudioBoot, AudioController } from './audio/audio-controller'
import { AudioHud } from './audio/audio-hud'
import { Experience } from './experience'
import { WebGPUGate } from './renderer/webgpu-gate'

function App() {
  return (
    <AudioController>
      {/* Hidden tweak panel — useControls calls still work. */}
      <Leva hidden />
      <AudioBoot />
      <WebGPUGate>{(reportFailure) => <Experience onRendererFailure={reportFailure} />}</WebGPUGate>
      <AudioHud />
    </AudioController>
  )
}

export default App
```

- [ ] **Step 8: Replace drei Sky/Stars/Environment with SkyMesh + HDRLoader**

`src/scene/sky.tsx` (full rewrite; lights stay as today until Task 4):
```tsx
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import { use, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { SkyMesh } from 'three/addons/objects/SkyMesh.js'
import { sceneState } from '../lib/scene-state'

const NIGHT_HDRI_URL = '/hdri/dikhololo-night-1k.hdr'
const SKY_SCALE = 450000
const SUN_LIGHT_DISTANCE = 120
const MOON_LIGHT_DISTANCE = 100
const MOON_MIN_HEIGHT = 50
const SHADOW_MAP_SIZE = 2048
const SHADOW_HALF_EXTENT = 40
const SHADOW_FAR = 200

// Module-level singletons: one sky per page. Mutating their uniforms from
// effects is allowed (they are not hook return values).
const sky = new SkyMesh()
sky.scale.setScalar(SKY_SCALE)
sky.material.fog = false

const nightHdri: Promise<THREE.DataTexture> = new HDRLoader().loadAsync(NIGHT_HDRI_URL).then((texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping
  return texture
})

function sunDirectionFromAngles(elevationDeg: number, azimuthDeg: number): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg)
  const theta = THREE.MathUtils.degToRad(azimuthDeg)
  return new THREE.Vector3().setFromSphericalCoords(1, phi, theta)
}

export function Sky() {
  const environment = use(nightHdri)
  const sunLightRef = useRef<THREE.DirectionalLight>(null)
  const moonLightRef = useRef<THREE.DirectionalLight>(null)

  const {
    turbidity, rayleigh, mieCoefficient, mieDirectionalG, elevation, azimuth,
    exposure, moonIntensity, sunIntensity, envIntensity,
  } = useControls('sky', {
    turbidity: { value: 3.4, min: 0, max: 20, step: 0.1 },
    rayleigh: { value: 2.2, min: 0, max: 4, step: 0.05 },
    mieCoefficient: { value: 0.003, min: 0, max: 0.1, step: 0.0005 },
    mieDirectionalG: { value: 0.9, min: 0, max: 1, step: 0.01 },
    elevation: { value: 3.5, min: -10, max: 90, step: 0.5 },
    azimuth: { value: 194, min: 0, max: 360, step: 1 },
    exposure: { value: 0.56, min: 0, max: 1.5, step: 0.01 },
    moonIntensity: { value: 0.55, min: 0, max: 8, step: 0.05 },
    sunIntensity: { value: 2.75, min: 0, max: 8, step: 0.05 },
    envIntensity: { value: 0.55, min: 0, max: 2, step: 0.05 },
  })

  const sunDirection = useMemo(() => sunDirectionFromAngles(elevation, azimuth), [elevation, azimuth])

  useEffect(() => {
    sky.turbidity.value = turbidity
    sky.rayleigh.value = rayleigh
    sky.mieCoefficient.value = mieCoefficient
    sky.mieDirectionalG.value = mieDirectionalG
    sky.sunPosition.value.copy(sunDirection)
    sceneState.sunDirection.copy(sunDirection)

    const sunLight = sunLightRef.current
    if (sunLight) sunLight.position.copy(sunDirection).multiplyScalar(SUN_LIGHT_DISTANCE)
    const moonLight = moonLightRef.current
    if (moonLight) {
      moonLight.position.copy(sunDirection).multiplyScalar(-MOON_LIGHT_DISTANCE)
      moonLight.position.y = Math.max(MOON_MIN_HEIGHT, Math.abs(moonLight.position.y))
    }
  }, [turbidity, rayleigh, mieCoefficient, mieDirectionalG, sunDirection])

  useFrame(({ camera, gl, scene }) => {
    gl.toneMappingExposure = exposure
    scene.environmentIntensity = envIntensity
    for (const ref of [sunLightRef, moonLightRef]) {
      const light = ref.current
      if (!light) continue
      light.target.position.set(camera.position.x, 0, camera.position.z)
      light.target.updateMatrixWorld()
    }
  })

  return (
    <>
      <primitive object={sky} />
      <primitive object={environment} attach="environment" />
      <hemisphereLight args={['#5a6478', '#1a1a22', 0.7]} />
      <directionalLight
        ref={sunLightRef}
        intensity={sunIntensity}
        color="#ffb878"
        castShadow
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
        shadow-camera-far={SHADOW_FAR}
        shadow-camera-left={-SHADOW_HALF_EXTENT}
        shadow-camera-right={SHADOW_HALF_EXTENT}
        shadow-camera-top={SHADOW_HALF_EXTENT}
        shadow-camera-bottom={-SHADOW_HALF_EXTENT}
      />
      <directionalLight ref={moonLightRef} intensity={moonIntensity} color="#b9cfe8" />
    </>
  )
}
```
If lint flags `gl.toneMappingExposure` / `scene.environmentIntensity` inside `useFrame`, keep them — those objects are callback arguments, not hook returns; if the rule still fires, read them via the `state` object (`(state) => { state.gl… }`).

- [ ] **Step 9: Browser tests**

`e2e/smoke.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test'

const CURTAIN_TIMEOUT_MS = 60_000

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function waitForScene(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible({ timeout: CURTAIN_TIMEOUT_MS })
  await expect(page.locator('.curtain')).toHaveCount(0, { timeout: CURTAIN_TIMEOUT_MS })
}

test('scene boots on WebGPU without console errors', async ({ page }) => {
  const errors = collectErrors(page)
  await waitForScene(page)
  await page.waitForTimeout(2000)
  expect(errors).toEqual([])
})

test('Space on the focused sound button toggles it without being swallowed by the game', async ({ page }) => {
  await waitForScene(page)
  await page.keyboard.press('Tab')
  const button = page.locator('.audio-hud')
  await expect(button).toBeFocused()
  const before = await button.textContent()
  await page.keyboard.press('Space')
  await expect(button).not.toHaveText(before ?? '')
})

test('canvas follows a viewport resize', async ({ page }) => {
  const errors = collectErrors(page)
  await waitForScene(page)
  await page.setViewportSize({ width: 900, height: 600 })
  await page.waitForTimeout(1000)
  const box = await page.locator('canvas').boundingBox()
  expect(box?.width).toBe(900)
  expect(box?.height).toBe(600)
  expect(errors).toEqual([])
})

test('shows the WebGPU gate when the API is missing', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true })
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('needs WebGPU')
  await expect(page.locator('canvas')).toHaveCount(0)
})
```

`e2e/capture.spec.ts` (manual visual review; tagged so `pnpm e2e` skips it):
```ts
import { test } from '@playwright/test'

const OUT = 'test-artifacts'
const ATTACK_FRAMES_MS = [600, 1150, 1250, 1350, 1450, 1600]
const JUMP_FRAMES_MS = [300, 700, 850, 1000, 1200]
const CHARACTER_CLIP = { x: 440, y: 100, width: 400, height: 580 }

test('@capture scene frames for visual review', async ({ page }) => {
  await page.goto('/')
  await page.locator('.curtain').waitFor({ state: 'detached', timeout: 60_000 })
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${OUT}/webgpu-scene.png` })

  await page.keyboard.press('KeyF')
  let elapsed = 0
  for (const at of ATTACK_FRAMES_MS) {
    await page.waitForTimeout(at - elapsed)
    elapsed = at
    await page.screenshot({ path: `${OUT}/attack-${at}.png`, clip: CHARACTER_CLIP })
  }

  await page.waitForTimeout(800)
  await page.keyboard.press('Space')
  elapsed = 0
  for (const at of JUMP_FRAMES_MS) {
    await page.waitForTimeout(at - elapsed)
    elapsed = at
    await page.screenshot({ path: `${OUT}/jump-${at}.png`, clip: CHARACTER_CLIP })
  }
})
```

- [ ] **Step 10: Verify**

Run: `pnpm lint && pnpm test && npx tsc -b && pnpm build && pnpm e2e`. Expected: all green. Then `pnpm capture` and open `test-artifacts/webgpu-scene.png` (sky + ground + paladin, **no grass yet**) and the attack/jump frames (no T-pose). If the HDR environment does not light the paladin, check `scene.environment` is set (R3F `attach="environment"` at scene root) before moving on.

- [ ] **Step 11: No commit** — `git status --short` shows only this task's files.

---

### Task 3: Grass in TSL (1:1 port) + parity gate

**Files:**
- Create: `src/lib/shared-uniforms.ts`, `src/scene/player-uniform-sync.tsx`, `src/scene/grass-material.ts`
- Modify: `src/scene/grass.tsx`, `src/experience.tsx`

**Interfaces:**
- Consumes: `terrainHeightNode` (Task 1), `createSeededRandom` (Task 1).
- Produces: `playerPosition: UniformNode<Vector3>` (`src/lib/shared-uniforms.ts`); `grassUniforms` (object of `uniform()` nodes, keys below); `createGrassMaterial(textures: { card: Texture; cloud: Texture }): MeshBasicNodeMaterial`; `<PlayerUniformSync characterRef />`; `<Grass />` (no props).

- [ ] **Step 1: Shared player uniform + sync**

`src/lib/shared-uniforms.ts`:
```ts
import { uniform } from 'three/tsl'
import { Vector3 } from 'three/webgpu'

// Character world position, written once per frame by <PlayerUniformSync>.
// Grass (wrap + trample) and fireflies (wrap) read it on the GPU.
export const playerPosition = uniform(new Vector3())
```

`src/scene/player-uniform-sync.tsx`:
```tsx
import { useFrame } from '@react-three/fiber'
import type { RefObject } from 'react'
import { playerPosition } from '../lib/shared-uniforms'
import type { CharacterHandle } from './character'

export function PlayerUniformSync({ characterRef }: { characterRef: RefObject<CharacterHandle | null> }) {
  useFrame(() => {
    const character = characterRef.current
    if (character) playerPosition.value.copy(character.getPosition())
  })
  return null
}
```

- [ ] **Step 2: Grass material**

`src/scene/grass-material.ts`:
```ts
import {
  abs, attribute, cameraPosition, clamp, dot, float, Fn, frontFacing, If, Discard, length, max, mix, mod,
  normalWorld, normalize, oneMinus, positionGeometry, positionLocal, positionView, positionWorld, pow, select,
  sin, smoothstep, sqrt, texture, time, uniform, uv, vec2, vec3, vec4,
} from 'three/tsl'
import { Color, DoubleSide, MeshBasicNodeMaterial, Vector3, type Texture } from 'three/webgpu'
import { playerPosition } from '../lib/shared-uniforms'
import { terrainHeightNode } from '../lib/terrain'

const ALPHA_CUTOFF = 0.4
const LUMA = vec3(0.299, 0.587, 0.114)
const PALETTE_HEIGHT = 1.5
const CLOUD_UV_SCALE = 0.3

// Module-level so leva effects can write `.value` (not hook return values).
// Defaults mirror the leva defaults in grass.tsx.
export const grassUniforms = {
  patchSize: uniform(100),
  bendStrength: uniform(0.45),
  windAmount: uniform(0.4),
  trampleRadius: uniform(1.8),
  trampleStrength: uniform(0.9),
  fogNear: uniform(25),
  fogFar: uniform(70),
  fogColor: uniform(new Color('#1a1f2c')),
  groundFogTop: uniform(1.4),
  groundFogBottom: uniform(-0.5),
  groundFogDensity: uniform(0.55),
  baseColor: uniform(new Color('#1c2436')),
  tipColor: uniform(new Color('#5a7a4a')),
  specStrength: uniform(1.4),
  specShininess: uniform(24),
  rimStrength: uniform(0.6),
  specColor: uniform(new Color('#d8b070')),
  skyAmbient: uniform(new Color('#3e4a5c')),
  groundAmbient: uniform(new Color('#0a0f1a')),
  ambientStrength: uniform(0.18),
  tintStrength: uniform(0.95),
  lightDirection: uniform(new Vector3(0.6, 0.8, 0.3).normalize()),
}

function grassPositionNode() {
  const u = grassUniforms
  const aCenter = attribute<'vec2'>('aCenter', 'vec2')
  const aBend = attribute<'vec2'>('aBend', 'vec2')

  // Toroidal wrap around the player so the patch tiles forever.
  const half = u.patchSize.mul(0.5)
  const wrappedCenter = vec2(
    mod(aCenter.x.sub(playerPosition.x).add(half), u.patchSize).sub(half).add(playerPosition.x),
    mod(aCenter.y.sub(playerPosition.z).add(half), u.patchSize).sub(half).add(playerPosition.z),
  )
  const wrapOffset = wrappedCenter.sub(aCenter)

  const t = clamp(positionGeometry.y, 0, 1)
  const curveT = t.mul(t)

  // Wind: two travelling waves.
  const gust1 = sin(wrappedCenter.x.mul(0.08).add(wrappedCenter.y.mul(0.05)).sub(time.mul(1.2)))
  const gust2 = sin(wrappedCenter.x.mul(0.05).sub(wrappedCenter.y.mul(0.09)).sub(time.mul(0.7)))
  const sway = gust1.add(gust2).mul(0.5).mul(curveT).mul(u.windAmount)

  // Trample: push tips away from the player, sink, shimmy.
  const toBlade = wrappedCenter.sub(playerPosition.xz)
  const distance = length(toBlade)
  const trample = oneMinus(smoothstep(0, u.trampleRadius, distance))
  const awayDir = toBlade.div(max(distance, 0.001))
  const push = trample.mul(u.trampleStrength).mul(curveT)
  const perpendicular = vec2(awayDir.y.negate(), awayDir.x)
  const shimmy = sin(time.mul(3.2).add(wrappedCenter.x.mul(0.6)).add(wrappedCenter.y.mul(0.4)))
    .mul(trample).mul(curveT).mul(0.12)

  const offsetXZ = wrapOffset
    .add(aBend.mul(curveT).mul(u.bendStrength))
    .add(vec2(sway, sway.mul(0.4)))
    .add(awayDir.mul(push))
    .add(perpendicular.mul(shimmy))
  const offsetY = terrainHeightNode(wrappedCenter).sub(trample.mul(curveT).mul(0.65))

  // positionLocal is already instance-transformed when positionNode runs.
  return positionLocal.add(vec3(offsetXZ.x, offsetY, offsetXZ.y))
}

function grassColorNode(card: Texture, cloud: Texture) {
  return Fn(() => {
    const u = grassUniforms
    const sample = texture(card, uv())
    If(sample.a.lessThan(ALPHA_CUTOFF), () => {
      Discard()
    })

    const h = clamp(positionWorld.y.div(PALETTE_HEIGHT), 0, 1)
    const palette = mix(u.baseColor, u.tipColor, h)
    const lift = mix(float(0.6), float(2.2), dot(sample.rgb, LUMA))
    const color = mix(sample.rgb, palette.mul(lift), u.tintStrength).toVar()

    const cloudNoise = texture(cloud, uv().mul(CLOUD_UV_SCALE)).r
    color.assign(mix(color, color.mul(cloudNoise.mul(0.5).add(0.75)), 0.25))

    const n = normalize(select(frontFacing, normalWorld, normalWorld.negate()))
    const v = normalize(cameraPosition.sub(positionWorld))
    const l = normalize(u.lightDirection)

    const ao = mix(float(0.25), float(1), smoothstep(0, 0.65, h))
    const hemiTint = mix(u.groundAmbient, u.skyAmbient, n.y.mul(0.5).add(0.5))
    const hemiLum = max(dot(hemiTint, LUMA), 0.001)
    color.mulAssign(mix(vec3(1), hemiTint.div(hemiLum), u.ambientStrength.mul(0.4).mul(ao)))

    const diffuse = max(dot(n, l), 0)
    color.mulAssign(ao.mul(0.4).add(0.6).mul(diffuse.mul(0.15).add(0.85)))

    // Kajiya-Kay anisotropic spec along the blade tangent (world up).
    const halfVector = normalize(l.add(v))
    const sinHT = sqrt(max(oneMinus(halfVector.y.mul(halfVector.y)), 0.0001))
    const aniso = pow(sinHT, u.specShininess)
    const fresnel = pow(oneMinus(abs(dot(n, v))), 3)

    const viewDepth = positionView.z.negate()
    const specGate = max(oneMinus(smoothstep(12, 45, viewDepth)), smoothstep(0, 0.35, v.y))
    const heightMask = smoothstep(0.2, 1.3, positionWorld.y)
    color.addAssign(
      u.specColor.mul(aniso.mul(u.specStrength).add(fresnel.mul(u.rimStrength)).mul(specGate)).mul(heightMask),
    )

    // Backlit tips glow when looking toward the sun.
    const glint = pow(max(dot(v.negate(), l), 0), 6)
    color.addAssign(u.specColor.mul(1.4).mul(glint).mul(smoothstep(0.4, 1.2, positionWorld.y)).mul(0.9))

    // Parity-only fog (Task 4 replaces it with scene.fogNode).
    const distanceFog = smoothstep(u.fogNear, u.fogFar, viewDepth)
    const groundFog = oneMinus(smoothstep(u.groundFogBottom, u.groundFogTop, positionWorld.y)).mul(u.groundFogDensity)
    const combinedFog = oneMinus(oneMinus(distanceFog).mul(oneMinus(groundFog)))
    const atmosphereColor = mix(u.fogColor, u.baseColor.mul(0.7), 0.5)
    return vec4(mix(color, atmosphereColor, combinedFog), 1)
  })()
}

export function createGrassMaterial({ card, cloud }: { card: Texture; cloud: Texture }): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ side: DoubleSide })
  material.fog = false
  material.positionNode = grassPositionNode()
  material.colorNode = grassColorNode(card, cloud)
  return material
}
```
If tsc rejects a mixed number/node argument (e.g. `mix(vec3(1), …)`), wrap the literal with `float()` / `vec3()`; never fall back to `any`.

- [ ] **Step 3: Rewrite `src/scene/grass.tsx`**

Keep: constants, `buildGrassCardTexture(random)`, `configureCloudTexture`, the leva `useControls('grass', …)` block, the seeded per-instance `useEffect` (attributes `aCenter`, `aBend`, `instanceMatrix`, bounding sphere). Remove: `?raw` imports, `createGrassUniforms`, `characterRef` prop, the `materialRef` uniform effect, `sceneState`. Replace the material and frame logic with:
```tsx
import { useTexture } from '@react-three/drei'
import { useControls } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createSeededRandom, type RandomSource } from '../lib/seeded-random'
import { sceneState } from '../lib/scene-state'
import { useFrame } from '@react-three/fiber'
import { createGrassMaterial, grassUniforms } from './grass-material'

// ...constants + buildGrassCardTexture + configureCloudTexture unchanged...

export function Grass() {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const controls = useControls('grass', { /* unchanged schema */ })
  const { count, patchSize } = controls

  const geometry = useMemo(() => { /* unchanged PlaneGeometry */ }, [])
  const cloudTexture = useTexture(CLOUD_TEXTURE_URL, configureCloudTexture)
  const grassCard = useMemo(() => buildGrassCardTexture(createSeededRandom(GRASS_CARD_SEED)), [])
  const material = useMemo(() => createGrassMaterial({ card: grassCard, cloud: cloudTexture }), [grassCard, cloudTexture])

  useEffect(() => {
    const u = grassUniforms
    u.patchSize.value = controls.patchSize
    u.bendStrength.value = controls.bendStrength
    u.windAmount.value = controls.windAmount
    u.trampleRadius.value = controls.trampleRadius
    u.trampleStrength.value = controls.trampleStrength
    u.fogNear.value = controls.fogNear
    u.fogFar.value = controls.fogFar
    u.fogColor.value.set(controls.fogColor)
    u.groundFogTop.value = controls.groundFogTop
    u.groundFogBottom.value = controls.groundFogBottom
    u.groundFogDensity.value = controls.groundFogDensity
    u.baseColor.value.set(controls.baseColor)
    u.tipColor.value.set(controls.tipColor)
    u.specStrength.value = controls.specStrength
    u.specShininess.value = controls.specShininess
    u.rimStrength.value = controls.rimStrength
    u.specColor.value.set(controls.specColor)
    u.skyAmbient.value.set(controls.skyAmbient)
    u.groundAmbient.value.set(controls.groundAmbient)
    u.ambientStrength.value = controls.ambientStrength
    u.tintStrength.value = controls.tintStrength
  }, [controls])

  useEffect(
    () => () => {
      geometry.dispose()
      grassCard.dispose()
      material.dispose()
    },
    [geometry, grassCard, material],
  )

  // ...seeded per-instance useEffect unchanged, deps [count, patchSize]...

  useFrame(() => {
    grassUniforms.lightDirection.value.copy(sceneState.sunDirection)
  })

  return (
    <instancedMesh
      key={count}
      ref={meshRef}
      args={[geometry, material, count]}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
    />
  )
}
```
(`controls` from leva is a fresh object only when a value changes, so `[controls]` is a valid dependency.)

- [ ] **Step 4: Mount grass + player sync** — in `src/experience.tsx`, inside `<Suspense>` after `<Physics>`: `<PlayerUniformSync characterRef={characterRef} />` and `<Grass />`.

- [ ] **Step 5: Parity gate**

Run: `node scripts/capture-baseline.mjs webgpu-grass` (dev server on 5199). Compare `test-artifacts/webgl-grass.png` vs `test-artifacts/webgpu-grass.png` side by side (e.g. `ffmpeg -i a.png -i b.png -filter_complex hstack test-artifacts/parity.png`). Accept when: same blade layout and density, same base→tip gradient, same fog falloff, trample circle around the paladin. Brightness differences from tone mapping (AgX vs the old pipeline) are acceptable **and must be fixed via `exposure`, not shader math**. Walk with WASD in the dev server and confirm the patch wraps with no seams and blades bend away from the paladin.

- [ ] **Step 6: Verify + no commit** — `pnpm lint && pnpm test && npx tsc -b && pnpm build && pnpm e2e`; `git status --short`.

---

### Task 4: Atmosphere module, shared height fog, moon/sun lights

**Files:**
- Create: `src/atmosphere/atmosphere.ts`, `src/atmosphere/atmosphere.test.ts`, `src/atmosphere/height-fog.ts`, `src/atmosphere/atmosphere-controls.tsx`, `src/atmosphere/lights.tsx`
- Move: `src/scene/sky.tsx` → `src/atmosphere/sky.tsx` (rewritten below)
- Modify: `src/scene/grass-material.ts`, `src/scene/grass.tsx`, `src/experience.tsx`
- Delete: `src/lib/scene-state.ts`

**Interfaces:**
- Produces: `atmosphere` (uniform nodes: `sunDirection`, `moonDirection`, `fogColor`, `horizonColor`, `fogNear`, `fogFar`, `groundFogTop`, `groundFogBottom`, `groundFogDensity`, `moonColor`, `moonIntensity`, `sunIntensity`, `rimIntensity`, `exposure`, `environmentIntensity`); `directionFromAngles(elevationDeg: number, azimuthDeg: number): Vector3`; `heightFogNode`.

- [ ] **Step 1: Failing direction test**

`src/atmosphere/atmosphere.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { directionFromAngles } from './atmosphere'

describe('directionFromAngles', () => {
  it('points straight up at 90° elevation', () => {
    const d = directionFromAngles(90, 0)
    expect(d.y).toBeCloseTo(1, 6)
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(0, 6)
  })

  it('lies on the horizon at 0° elevation', () => {
    expect(directionFromAngles(0, 194).y).toBeCloseTo(0, 6)
  })

  it('is below the horizon for negative elevation', () => {
    expect(directionFromAngles(-2, 194).y).toBeLessThan(0)
  })

  it('is unit length', () => {
    expect(directionFromAngles(35, 14).length()).toBeCloseTo(1, 6)
  })
})
```
Run — FAIL (module missing).

- [ ] **Step 2: Atmosphere module**

`src/atmosphere/atmosphere.ts`:
```ts
import { uniform } from 'three/tsl'
import { Color, MathUtils, Vector3 } from 'three/webgpu'

export function directionFromAngles(elevationDeg: number, azimuthDeg: number): Vector3 {
  const phi = MathUtils.degToRad(90 - elevationDeg)
  const theta = MathUtils.degToRad(azimuthDeg)
  return new Vector3().setFromSphericalCoords(1, phi, theta)
}

// Single source of truth for everything atmospheric. Shaders read these
// nodes directly; <AtmosphereControls> writes them from leva; lights and
// the sky read `.value` each frame.
export const atmosphere = {
  sunDirection: uniform(directionFromAngles(3.5, 194)),
  moonDirection: uniform(directionFromAngles(35, 14)),
  fogColor: uniform(new Color('#1a1f2c')),
  horizonColor: uniform(new Color('#4a3a48')),
  fogNear: uniform(25),
  fogFar: uniform(70),
  groundFogTop: uniform(1.4),
  groundFogBottom: uniform(-0.5),
  groundFogDensity: uniform(0.55),
  moonColor: uniform(new Color('#b9cfe8')),
  moonIntensity: uniform(0.55),
  sunIntensity: uniform(2.75),
  rimIntensity: uniform(0),
  exposure: uniform(0.56),
  environmentIntensity: uniform(0.55),
}
```
Run the test — PASS.

- [ ] **Step 3: Height fog node**

`src/atmosphere/height-fog.ts`:
```ts
import { cameraPosition, dot, fog, max, mix, normalize, oneMinus, positionView, positionWorld, pow, smoothstep, vec3 } from 'three/tsl'
import { atmosphere } from './atmosphere'

const HORIZON_TINT_POWER = 4

// Distance fog combined with a low-lying ground fog band (Beer's-law style:
// independent attenuations). Colour warms toward the sun's azimuth.
const distanceFog = smoothstep(atmosphere.fogNear, atmosphere.fogFar, positionView.z.negate())
const groundFog = oneMinus(smoothstep(atmosphere.groundFogBottom, atmosphere.groundFogTop, positionWorld.y))
  .mul(atmosphere.groundFogDensity)
const fogFactor = oneMinus(oneMinus(distanceFog).mul(oneMinus(groundFog)))

const viewFlat = normalize(vec3(positionWorld.x.sub(cameraPosition.x), 0, positionWorld.z.sub(cameraPosition.z)))
const sunFlat = normalize(vec3(atmosphere.sunDirection.x, 0, atmosphere.sunDirection.z))
const towardSun = pow(max(dot(viewFlat, sunFlat), 0), HORIZON_TINT_POWER)

export const heightFogNode = fog(mix(atmosphere.fogColor, atmosphere.horizonColor, towardSun), fogFactor)
```

- [ ] **Step 4: Grass uses the shared fog and sun**

In `src/scene/grass-material.ts`: delete `fogNear`, `fogFar`, `fogColor`, `groundFogTop`, `groundFogBottom`, `groundFogDensity`, `lightDirection` from `grassUniforms`; import `atmosphere` and use `normalize(atmosphere.sunDirection)` for `l`; delete the "Parity-only fog" block and return `vec4(color, 1)`; set `material.fog = true`.

In `src/scene/grass.tsx`: remove the six fog controls and their effect lines, the `useFrame` that copied `sceneState.sunDirection`, and the `sceneState` import.

- [ ] **Step 5: Atmosphere controls**

`src/atmosphere/atmosphere-controls.tsx`:
```tsx
import { useControls } from 'leva'
import { useEffect } from 'react'
import { atmosphere, directionFromAngles } from './atmosphere'

export function AtmosphereControls() {
  const c = useControls('atmosphere', {
    sunElevation: { value: 3.5, min: -10, max: 90, step: 0.5 },
    sunAzimuth: { value: 194, min: 0, max: 360, step: 1 },
    moonElevation: { value: 35, min: 5, max: 90, step: 1 },
    exposure: { value: 0.56, min: 0, max: 1.5, step: 0.01 },
    environmentIntensity: { value: 0.55, min: 0, max: 2, step: 0.05 },
    sunIntensity: { value: 2.75, min: 0, max: 8, step: 0.05 },
    moonIntensity: { value: 0.55, min: 0, max: 8, step: 0.05 },
    rimIntensity: { value: 0, min: 0, max: 4, step: 0.05 },
    fogColor: '#1a1f2c',
    horizonColor: '#4a3a48',
    fogNear: { value: 25, min: 0, max: 100, step: 1 },
    fogFar: { value: 70, min: 5, max: 200, step: 1 },
    groundFogTop: { value: 1.4, min: 0, max: 5, step: 0.05 },
    groundFogBottom: { value: -0.5, min: -3, max: 3, step: 0.05 },
    groundFogDensity: { value: 0.55, min: 0, max: 1, step: 0.05 },
  })

  useEffect(() => {
    const MOON_AZIMUTH_OFFSET = 180
    atmosphere.sunDirection.value.copy(directionFromAngles(c.sunElevation, c.sunAzimuth))
    atmosphere.moonDirection.value.copy(directionFromAngles(c.moonElevation, c.sunAzimuth + MOON_AZIMUTH_OFFSET))
    atmosphere.exposure.value = c.exposure
    atmosphere.environmentIntensity.value = c.environmentIntensity
    atmosphere.sunIntensity.value = c.sunIntensity
    atmosphere.moonIntensity.value = c.moonIntensity
    atmosphere.rimIntensity.value = c.rimIntensity
    atmosphere.fogColor.value.set(c.fogColor)
    atmosphere.horizonColor.value.set(c.horizonColor)
    atmosphere.fogNear.value = c.fogNear
    atmosphere.fogFar.value = c.fogFar
    atmosphere.groundFogTop.value = c.groundFogTop
    atmosphere.groundFogBottom.value = c.groundFogBottom
    atmosphere.groundFogDensity.value = c.groundFogDensity
  }, [c])

  return null
}
```
(Move `MOON_AZIMUTH_OFFSET` to module scope.)

- [ ] **Step 6: Lights (moon is the shadow caster now)**

`src/atmosphere/lights.tsx`:
```tsx
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { DirectionalLight } from 'three'
import { atmosphere } from './atmosphere'

const SUN_DISTANCE = 120
const MOON_DISTANCE = 100
const SHADOW_MAP_SIZE = 2048
const SHADOW_HALF_EXTENT = 40
const SHADOW_FAR = 250

export function Lights() {
  const moonRef = useRef<DirectionalLight>(null)
  const sunRef = useRef<DirectionalLight>(null)

  useFrame(({ camera }) => {
    const moon = moonRef.current
    const sun = sunRef.current
    if (!moon || !sun) return
    moon.position.copy(atmosphere.moonDirection.value).multiplyScalar(MOON_DISTANCE).add(camera.position)
    sun.position.copy(atmosphere.sunDirection.value).multiplyScalar(SUN_DISTANCE).add(camera.position)
    moon.intensity = atmosphere.moonIntensity.value
    sun.intensity = atmosphere.sunIntensity.value
    for (const light of [moon, sun]) {
      light.target.position.set(camera.position.x, 0, camera.position.z)
      light.target.updateMatrixWorld()
    }
  })

  return (
    <>
      <hemisphereLight args={['#5a6478', '#1a1a22', 0.7]} />
      <directionalLight
        ref={moonRef}
        color="#b9cfe8"
        castShadow
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
        shadow-camera-far={SHADOW_FAR}
        shadow-camera-left={-SHADOW_HALF_EXTENT}
        shadow-camera-right={SHADOW_HALF_EXTENT}
        shadow-camera-top={SHADOW_HALF_EXTENT}
        shadow-camera-bottom={-SHADOW_HALF_EXTENT}
      />
      <directionalLight ref={sunRef} color="#ffb878" />
    </>
  )
}
```

- [ ] **Step 7: Sky reads the atmosphere and attaches the fog**

`src/atmosphere/sky.tsx` (replaces `src/scene/sky.tsx`; delete the old file):
```tsx
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import { use, useEffect } from 'react'
import * as THREE from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { SkyMesh } from 'three/addons/objects/SkyMesh.js'
import { atmosphere } from './atmosphere'
import { heightFogNode } from './height-fog'

const NIGHT_HDRI_URL = '/hdri/dikhololo-night-1k.hdr'
const SKY_SCALE = 450000

const sky = new SkyMesh()
sky.scale.setScalar(SKY_SCALE)
sky.material.fog = false

const nightHdri: Promise<THREE.DataTexture> = new HDRLoader().loadAsync(NIGHT_HDRI_URL).then((texture) => {
  texture.mapping = THREE.EquirectangularReflectionMapping
  return texture
})

export function Sky() {
  const environment = use(nightHdri)
  const c = useControls('sky', {
    turbidity: { value: 3.4, min: 0, max: 20, step: 0.1 },
    rayleigh: { value: 2.2, min: 0, max: 4, step: 0.05 },
    mieCoefficient: { value: 0.003, min: 0, max: 0.1, step: 0.0005 },
    mieDirectionalG: { value: 0.9, min: 0, max: 1, step: 0.01 },
  })

  useEffect(() => {
    sky.turbidity.value = c.turbidity
    sky.rayleigh.value = c.rayleigh
    sky.mieCoefficient.value = c.mieCoefficient
    sky.mieDirectionalG.value = c.mieDirectionalG
  }, [c])

  useFrame(({ gl, scene }) => {
    sky.sunPosition.value.copy(atmosphere.sunDirection.value)
    gl.toneMappingExposure = atmosphere.exposure.value
    scene.environmentIntensity = atmosphere.environmentIntensity.value
  })

  return (
    <>
      <primitive object={sky} />
      <primitive object={environment} attach="environment" />
      <primitive object={heightFogNode} attach="fogNode" />
    </>
  )
}
```

- [ ] **Step 8: Wire into the experience** — `src/experience.tsx`: import `Sky` from `./atmosphere/sky`; add `<AtmosphereControls />` (outside Suspense) and `<Lights />` (inside Suspense, before `<Physics>`). Delete `src/lib/scene-state.ts`; `grep -rn scene-state src` must return nothing.

- [ ] **Step 9: Verify** — `pnpm lint && pnpm test && npx tsc -b && pnpm build && pnpm e2e`, then `node scripts/capture-baseline.mjs webgpu-atmosphere`: ground and paladin now fade into the same fog as the grass (previously only grass fogged); paladin shadow comes from the moon side. No commit; `git status --short`.

---

### Task 5: Blue-hour sky, stars, moon rim on the paladin

**Files:**
- Create: `src/atmosphere/stars.tsx`, `src/atmosphere/moon-rim.ts`, `src/atmosphere/moon-rim.test.ts`
- Modify: `src/atmosphere/atmosphere.ts`, `src/atmosphere/atmosphere-controls.tsx`, `src/atmosphere/sky.tsx`, `src/scene/grass.tsx` (palette defaults), `src/scene/paladin.tsx`, `src/experience.tsx`

**Interfaces:**
- Consumes: `atmosphere` (Task 4), `createSeededRandom` (Task 1).
- Produces: `toRimLitMaterial(source: Material): MeshStandardNodeMaterial`; `moonRimNode`; `<Stars />`.

- [ ] **Step 1: Failing material-conversion test**

`src/atmosphere/moon-rim.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { Color, MeshPhongMaterial, MeshStandardNodeMaterial, Texture } from 'three/webgpu'
import { toRimLitMaterial } from './moon-rim'

describe('toRimLitMaterial', () => {
  it('keeps the Phong colour, map and normal map', () => {
    const map = new Texture()
    const normalMap = new Texture()
    const source = new MeshPhongMaterial({ color: new Color('#336699'), map, normalMap })
    const result = toRimLitMaterial(source)
    expect(result).toBeInstanceOf(MeshStandardNodeMaterial)
    expect(result.color.getHexString()).toBe('336699')
    expect(result.map).toBe(map)
    expect(result.normalMap).toBe(normalMap)
  })

  it('adds the moon rim as emissive', () => {
    const result = toRimLitMaterial(new MeshPhongMaterial())
    expect(result.emissiveNode).not.toBeNull()
  })

  it('handles materials without maps', () => {
    const result = toRimLitMaterial(new MeshPhongMaterial({ color: new Color('#ffffff') }))
    expect(result.map).toBeNull()
  })
})
```
Run — FAIL (module missing).

- [ ] **Step 2: Implement**

`src/atmosphere/moon-rim.ts`:
```ts
import { abs, dot, normalView, normalize, oneMinus, positionView, pow } from 'three/tsl'
import { MeshLambertMaterial, MeshPhongMaterial, MeshStandardMaterial, MeshStandardNodeMaterial, type Material } from 'three/webgpu'
import { atmosphere } from './atmosphere'

const RIM_POWER = 3
const ARMOR_ROUGHNESS = 0.55
const ARMOR_METALNESS = 0.35

const viewDirection = normalize(positionView.negate())
export const moonRimNode = atmosphere.moonColor
  .mul(pow(oneMinus(abs(dot(normalView, viewDirection))), RIM_POWER))
  .mul(atmosphere.rimIntensity)

type MappedMaterial = MeshPhongMaterial | MeshLambertMaterial | MeshStandardMaterial

function isMappedMaterial(material: Material): material is MappedMaterial {
  return (
    material instanceof MeshPhongMaterial ||
    material instanceof MeshLambertMaterial ||
    material instanceof MeshStandardMaterial
  )
}

// FBX meshes arrive as Phong. Rebuild them as PBR node materials so the moon
// rim can be added as an emissive node; skinning keeps working automatically.
export function toRimLitMaterial(source: Material): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ roughness: ARMOR_ROUGHNESS, metalness: ARMOR_METALNESS })
  if (isMappedMaterial(source)) {
    material.color.copy(source.color)
    material.map = source.map
    material.normalMap = source.normalMap
  }
  material.transparent = source.transparent
  material.side = source.side
  material.emissiveNode = moonRimNode
  return material
}
```
Run the test — PASS.

- [ ] **Step 3: Apply to the paladin** — in `src/scene/paladin.tsx` `collectSkinnedMeshes`, after the shadow flags:
```ts
const sources = Array.isArray(object.material) ? object.material : [object.material]
const converted = sources.map(toRimLitMaterial)
sources.forEach((material) => material.dispose())
object.material = converted.length === 1 ? converted[0] : converted
```
Import `toRimLitMaterial` from `../atmosphere/moon-rim`.

- [ ] **Step 4: Stars**

`src/atmosphere/stars.tsx`:
```tsx
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { float, hash, instanceIndex, instancedBufferAttribute, length, normalize, sin, smoothstep, time, uv, vec3, vec4 } from 'three/tsl'
import { AdditiveBlending, InstancedBufferAttribute, Sprite, SpriteNodeMaterial, type Group } from 'three/webgpu'
import { createSeededRandom } from '../lib/seeded-random'

const STAR_COUNT = 4000
const STAR_RADIUS = 300
const STAR_SEED = 4242
const STAR_SIZE = 0.006
const MIN_ELEVATION_Y = -0.05
const TWINKLE_SPEED = 1.7
const BRIGHTNESS = 1.6

function buildStarPositions(): Float32Array {
  const random = createSeededRandom(STAR_SEED)
  const positions = new Float32Array(STAR_COUNT * 3)
  let written = 0
  while (written < STAR_COUNT) {
    const x = random() * 2 - 1
    const y = random() * 2 - 1
    const z = random() * 2 - 1
    const lengthSq = x * x + y * y + z * z
    if (lengthSq < 0.01 || lengthSq > 1) continue
    const scale = STAR_RADIUS / Math.sqrt(lengthSq)
    if ((y * scale) / STAR_RADIUS < MIN_ELEVATION_Y) continue
    positions.set([x * scale, y * scale, z * scale], written * 3)
    written++
  }
  return positions
}

function createStarMaterial(positions: InstancedBufferAttribute): SpriteNodeMaterial {
  const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending })
  material.fog = false
  material.sizeAttenuation = false
  const position = instancedBufferAttribute(positions)
  material.positionNode = position
  material.scaleNode = float(STAR_SIZE).mul(hash(instanceIndex).mul(0.8).add(0.4))
  const twinkle = sin(time.mul(TWINKLE_SPEED).add(hash(instanceIndex.add(7)).mul(6.283))).mul(0.35).add(0.65)
  const horizonFade = smoothstep(0, 0.25, normalize(position).y)
  const disc = smoothstep(0.5, 0.1, length(uv().sub(0.5)))
  material.colorNode = vec4(vec3(float(BRIGHTNESS).mul(twinkle).mul(horizonFade).mul(disc)), disc)
  return material
}

export function Stars() {
  const groupRef = useRef<Group>(null)
  const sprite = useMemo(() => {
    const attribute = new InstancedBufferAttribute(buildStarPositions(), 3)
    const instance = new Sprite(createStarMaterial(attribute))
    instance.count = STAR_COUNT
    instance.frustumCulled = false
    return instance
  }, [])

  useEffect(() => () => sprite.material.dispose(), [sprite])

  // Stars live at infinity: keep them centred on the camera.
  useFrame(({ camera }) => {
    groupRef.current?.position.copy(camera.position)
  })

  return (
    <group ref={groupRef}>
      <primitive object={sprite} />
    </group>
  )
}
```

- [ ] **Step 5: Blue-hour defaults** (starting values; tune live with `<Leva hidden={false}>` locally, then restore `hidden`):

| Where | Key | Value |
| --- | --- | --- |
| `atmosphere-controls.tsx` | `sunElevation` | `-2` |
| | `moonElevation` | `35` |
| | `exposure` | `0.62` |
| | `environmentIntensity` | `0.35` |
| | `sunIntensity` | `0.6` |
| | `moonIntensity` | `0.9` |
| | `rimIntensity` | `1.2` |
| | `fogColor` | `'#18202f'` |
| | `horizonColor` | `'#6b4a52'` |
| `atmosphere.ts` | defaults | mirror the values above |
| `sky.tsx` | `turbidity` / `rayleigh` / `mieCoefficient` / `mieDirectionalG` | `8` / `3.2` / `0.004` / `0.85` |
| `sky.tsx` module | `sky.showSunDisc.value` | `0` |
| `sky.tsx` module | `sky.cloudCoverage.value` / `sky.cloudDensity.value` | `0.3` / `0.3` |
| `lights.tsx` | sun `color` | `'#ff9a5c'` |
| `lights.tsx` | hemisphere | `['#2c3a5c', '#0b0f18', 0.5]` |
| `grass.tsx` leva | `baseColor` / `tipColor` / `specColor` | `'#141c2e'` / `'#4f6b52'` / `'#e0a868'` |

Mount `<Stars />` in `src/atmosphere/sky.tsx`'s fragment.

- [ ] **Step 6: Verify** — lint/test/tsc/build/e2e green; `pnpm capture`; review `webgpu-scene.png` (orange band on horizon, blue zenith, no sun disc, stars visible above the horizon, paladin silhouette with a cool rim) and the attack/jump frames (**no T-pose**, rim present while animating). No commit; `git status --short`.

---

### Task 6: Compute fireflies

**Files:**
- Create: `src/lib/frame-delta.ts`, `src/lib/frame-delta.test.ts`, `src/atmosphere/fireflies.tsx`
- Modify: `src/atmosphere/sky.tsx` (mount)

**Interfaces:**
- Consumes: `playerPosition` (Task 3), `terrainHeightNode` (Task 1), `asWebGPURenderer` (Task 2).
- Produces: `clampFrameDelta(delta: number): number`, `MAX_FRAME_DELTA_S`, `<Fireflies />`.

- [ ] **Step 1: Failing delta test (Review Focus 2)**

`src/lib/frame-delta.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { clampFrameDelta, MAX_FRAME_DELTA_S } from './frame-delta'

describe('clampFrameDelta', () => {
  it('passes normal frame deltas through', () => {
    expect(clampFrameDelta(1 / 60)).toBeCloseTo(1 / 60)
  })
  it('caps long pauses (tab hidden)', () => {
    expect(clampFrameDelta(12)).toBe(MAX_FRAME_DELTA_S)
  })
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('returns 0 for invalid delta %s', (delta) => {
    expect(clampFrameDelta(delta)).toBe(0)
  })
})
```
Run — FAIL.

- [ ] **Step 2: Implement**

`src/lib/frame-delta.ts`:
```ts
// After a hidden tab, R3F can report a multi-second delta; simulations that
// integrate velocity would jump. Cap it to a few frames' worth.
export const MAX_FRAME_DELTA_S = 0.1

export function clampFrameDelta(delta: number): number {
  if (!Number.isFinite(delta) || delta < 0) return 0
  return Math.min(delta, MAX_FRAME_DELTA_S)
}
```
Run — PASS.

- [ ] **Step 3: Fireflies**

`src/atmosphere/fireflies.tsx`:
```tsx
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  clamp, color, float, Fn, hash, instanceIndex, instancedArray, length, mod, mx_noise_vec3, sin, smoothstep,
  time, uniform, uv, vec2, vec3, vec4,
} from 'three/tsl'
import { AdditiveBlending, Sprite, SpriteNodeMaterial } from 'three/webgpu'
import { clampFrameDelta } from '../lib/frame-delta'
import { playerPosition } from '../lib/shared-uniforms'
import { terrainHeightNode } from '../lib/terrain'
import { asWebGPURenderer } from '../renderer/as-webgpu-renderer'

const FIREFLY_COUNT = 400
const SPAWN_RADIUS = 25
const MIN_HEIGHT = 0.3
const MAX_HEIGHT = 2
const DRIFT_SPEED = 0.6
const NOISE_SCALE = 0.15
const NOISE_TIME_SCALE = 0.1
const SPRITE_SIZE = 0.08
const GLOW_COLOR = '#d8f27a'
const GLOW_INTENSITY = 3
const PULSE_SPEED = 2.4

const frameDelta = uniform(0)
const positions = instancedArray(FIREFLY_COUNT, 'vec3')

// Seed every firefly on a disc around the player.
const initCompute = Fn(() => {
  const p = positions.element(instanceIndex)
  const offset = vec2(hash(instanceIndex), hash(instanceIndex.add(1))).mul(2).sub(1).mul(SPAWN_RADIUS)
  const ground = terrainHeightNode(playerPosition.xz.add(offset))
  const height = hash(instanceIndex.add(2)).mul(MAX_HEIGHT - MIN_HEIGHT).add(MIN_HEIGHT)
  p.assign(vec3(playerPosition.x.add(offset.x), ground.add(height), playerPosition.z.add(offset.y)))
})().compute(FIREFLY_COUNT)

// Drift on a noise field, wrap around the player, stay in a band above the ground.
const updateCompute = Fn(() => {
  const p = positions.element(instanceIndex)
  const drift = mx_noise_vec3(p.mul(NOISE_SCALE).add(time.mul(NOISE_TIME_SCALE)))
  p.addAssign(drift.mul(DRIFT_SPEED).mul(frameDelta))
  const span = float(SPAWN_RADIUS * 2)
  const relative = vec2(
    mod(p.x.sub(playerPosition.x).add(SPAWN_RADIUS), span).sub(SPAWN_RADIUS),
    mod(p.z.sub(playerPosition.z).add(SPAWN_RADIUS), span).sub(SPAWN_RADIUS),
  )
  const xz = playerPosition.xz.add(relative)
  const ground = terrainHeightNode(xz)
  p.assign(vec3(xz.x, clamp(p.y, ground.add(MIN_HEIGHT), ground.add(MAX_HEIGHT)), xz.y))
})().compute(FIREFLY_COUNT)

function createFireflyMaterial(): SpriteNodeMaterial {
  const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending })
  material.fog = false
  material.positionNode = positions.toAttribute()
  material.scaleNode = float(SPRITE_SIZE)
  const pulse = sin(time.mul(PULSE_SPEED).add(hash(instanceIndex).mul(6.283))).mul(0.5).add(0.5)
  const glow = smoothstep(0.5, 0, length(uv().sub(0.5)))
  material.colorNode = vec4(color(GLOW_COLOR).mul(GLOW_INTENSITY).mul(pulse).mul(glow), glow)
  return material
}

export function Fireflies() {
  const gl = useThree((state) => state.gl)
  const sprite = useMemo(() => {
    const instance = new Sprite(createFireflyMaterial())
    instance.count = FIREFLY_COUNT
    instance.frustumCulled = false
    return instance
  }, [])

  useEffect(() => {
    void asWebGPURenderer(gl).computeAsync(initCompute)
  }, [gl])

  useEffect(() => () => sprite.material.dispose(), [sprite])

  useFrame((state, delta) => {
    frameDelta.value = clampFrameDelta(delta)
    asWebGPURenderer(state.gl).compute(updateCompute)
  })

  return <primitive object={sprite} />
}
```
Mount `<Fireflies />` in `src/atmosphere/sky.tsx`'s fragment.

- [ ] **Step 4: Verify** — lint/test/tsc/build/e2e green; in the dev server: fireflies hover in the grass around the paladin, pulse, follow when running, never appear underground on hills, and after switching tabs for 10 s and returning they continue smoothly (no burst). `pnpm capture` for a still. No commit; `git status --short`.

---

### Task 7: RenderPipeline post-processing

**Files:**
- Create: `src/renderer/blue-hour-lut.ts`, `src/renderer/blue-hour-lut.test.ts`, `src/renderer/post-settings.ts`, `src/renderer/post-settings.test.ts`, `src/renderer/render-pipeline.tsx`
- Modify: `src/experience.tsx`, `src/renderer/create-renderer.ts` (`antialias: false`)

**Interfaces:**
- Consumes: `asWebGPURenderer` (Task 2), `prefersReducedMotion` (Task 1).
- Produces: `LUT_SIZE`, `createBlueHourLutData(size: number): Uint8Array`, `createBlueHourLut(): Data3DTexture`, `grainIntensityFor(reducedMotion: boolean): number`, `<RenderPipelineEffect />`.

- [ ] **Step 1: Failing LUT + settings tests**

`src/renderer/blue-hour-lut.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createBlueHourLutData } from './blue-hour-lut'

const SIZE = 17
const CHANNELS = 4

function texel(data: Uint8Array, r: number, g: number, b: number): number[] {
  const index = ((b * SIZE + g) * SIZE + r) * CHANNELS
  return Array.from(data.slice(index, index + CHANNELS))
}

describe('createBlueHourLutData', () => {
  it('has size³ RGBA texels', () => {
    expect(createBlueHourLutData(SIZE)).toHaveLength(SIZE ** 3 * CHANNELS)
  })

  it('leaves mid-grey unchanged (neutral point)', () => {
    const mid = (SIZE - 1) / 2
    const [r, g, b] = texel(createBlueHourLutData(SIZE), mid, mid, mid)
    for (const channel of [r, g, b]) expect(Math.abs(channel - 128)).toBeLessThanOrEqual(2)
  })

  it('cools the shadows (blue > red near black)', () => {
    const [r, , b] = texel(createBlueHourLutData(SIZE), 2, 2, 2)
    expect(b).toBeGreaterThan(r)
  })

  it('warms the highlights (red > blue near white)', () => {
    const [r, , b] = texel(createBlueHourLutData(SIZE), SIZE - 3, SIZE - 3, SIZE - 3)
    expect(r).toBeGreaterThan(b)
  })

  it('writes opaque alpha', () => {
    expect(texel(createBlueHourLutData(SIZE), 0, 0, 0)[3]).toBe(255)
  })
})
```

`src/renderer/post-settings.test.ts` (Review Focus 5):
```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_GRAIN, grainIntensityFor } from './post-settings'

describe('grainIntensityFor', () => {
  it('uses the default grain normally', () => {
    expect(grainIntensityFor(false)).toBe(DEFAULT_GRAIN)
  })
  it('disables grain for reduced motion', () => {
    expect(grainIntensityFor(true)).toBe(0)
  })
})
```
Run — FAIL.

- [ ] **Step 2: Implement LUT + settings**

`src/renderer/blue-hour-lut.ts`:
```ts
import { Data3DTexture, LinearFilter, RGBAFormat, UnsignedByteType } from 'three/webgpu'

export const LUT_SIZE = 32
const CHANNELS = 4
const MAX_BYTE = 255
const SHADOW_TINT = [-0.04, 0.0, 0.06] as const
const HIGHLIGHT_TINT = [0.06, 0.02, -0.04] as const
const LUMA = [0.2126, 0.7152, 0.0722] as const

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

type Rgb = readonly [number, number, number]

// Split toning: cool shadows, warm highlights, mid-grey untouched.
function grade(rgb: Rgb): Rgb {
  const luma = rgb[0] * LUMA[0] + rgb[1] * LUMA[1] + rgb[2] * LUMA[2]
  const shadowWeight = 1 - smoothstep(0, 0.5, luma)
  const highlightWeight = smoothstep(0.5, 1, luma)
  const channel = (c: 0 | 1 | 2) =>
    clamp01(rgb[c] + SHADOW_TINT[c] * shadowWeight + HIGHLIGHT_TINT[c] * highlightWeight)
  return [channel(0), channel(1), channel(2)]
}

export function createBlueHourLutData(size: number): Uint8Array {
  const data = new Uint8Array(size ** 3 * CHANNELS)
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const graded = grade([r / (size - 1), g / (size - 1), b / (size - 1)])
        const index = ((b * size + g) * size + r) * CHANNELS
        data[index] = Math.round(graded[0] * MAX_BYTE)
        data[index + 1] = Math.round(graded[1] * MAX_BYTE)
        data[index + 2] = Math.round(graded[2] * MAX_BYTE)
        data[index + 3] = MAX_BYTE
      }
    }
  }
  return data
}

export function createBlueHourLut(): Data3DTexture {
  const texture = new Data3DTexture(createBlueHourLutData(LUT_SIZE), LUT_SIZE, LUT_SIZE, LUT_SIZE)
  texture.format = RGBAFormat
  texture.type = UnsignedByteType
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.unpackAlignment = 1
  texture.needsUpdate = true
  return texture
}
```
`src/renderer/post-settings.ts`:
```ts
export const DEFAULT_GRAIN = 0.12

// Animated grain is motion; drop it entirely for reduced-motion users.
export function grainIntensityFor(reducedMotion: boolean): number {
  return reducedMotion ? 0 : DEFAULT_GRAIN
}
```
Run tests — PASS.

- [ ] **Step 3: Render pipeline**

`src/renderer/render-pipeline.tsx`:
```tsx
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import { useEffect, useRef } from 'react'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { film } from 'three/addons/tsl/display/FilmNode.js'
import { lut3D } from 'three/addons/tsl/display/Lut3DNode.js'
import { smaa } from 'three/addons/tsl/display/SMAANode.js'
import { traa } from 'three/addons/tsl/display/TRAANode.js'
import { length, mrt, oneMinus, output, pass, renderOutput, screenUV, smoothstep, texture3D, uniform, velocity, vec4 } from 'three/tsl'
import { RenderPipeline, type Camera, type Data3DTexture, type Scene, type WebGPURenderer } from 'three/webgpu'
import { prefersReducedMotion } from '../lib/reduced-motion'
import { asWebGPURenderer } from './as-webgpu-renderer'
import { createBlueHourLut, LUT_SIZE } from './blue-hour-lut'
import { grainIntensityFor } from './post-settings'

const BLOOM_RADIUS = 0.6

// Module-level uniforms: leva writes them, the node graph reads them.
const postUniforms = {
  lutIntensity: uniform(0.8),
  vignetteOffset: uniform(0.35),
  vignetteDarkness: uniform(0.75),
  grain: uniform(grainIntensityFor(false)),
}

type BuiltPipeline = { pipeline: RenderPipeline; lut: Data3DTexture; setBloom: (strength: number, threshold: number) => void }

type AntiAliasing = 'traa' | 'smaa'

function buildPipeline(renderer: WebGPURenderer, scene: Scene, camera: Camera, antiAliasing: AntiAliasing): BuiltPipeline {
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
  const lut = createBlueHourLut()
  const graded = lut3D(display, texture3D(lut), LUT_SIZE, postUniforms.lutIntensity)

  const edge = length(screenUV.sub(0.5)).mul(2)
  const vignette = oneMinus(smoothstep(postUniforms.vignetteOffset, 1.4, edge).mul(postUniforms.vignetteDarkness))
  const vignetted = vec4(graded.rgb.mul(vignette), graded.a)
  const finalNode = film(vignetted, postUniforms.grain)

  const pipeline = new RenderPipeline(renderer, finalNode)
  pipeline.outputColorTransform = false // renderOutput above already tone-maps + encodes

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
    postUniforms.grain.value = grainIntensityFor(prefersReducedMotion())
  }, [c, antiAliasing])

  // Priority 1: R3F stops auto-rendering; we own the frame.
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
```
Notes for the implementer: (a) if `bloomPass.strength`/`threshold` are typed differently in r184, read the property names from `node_modules/three/examples/jsm/tsl/display/BloomNode.js` and adjust `setBloom`; (b) `film(input, intensity)` — confirm the second parameter is intensity in `FilmNode.js` (it is in r184: `constructor(inputNode, intensityNode = null, uvNode = null)`).

- [ ] **Step 4: Wire it** — `src/experience.tsx`: render `<RenderPipelineEffect />` inside `<Canvas>` (outside Suspense). In `create-renderer.ts` set `antialias: false` (TRAA/SMAA replace MSAA).

- [ ] **Step 5: TRAA ghosting decision**

Run the dev server, walk and turn the camera with J/L. Wind-animated grass is not in the velocity buffer, so TRAA may smear blades. If smearing is visible, change the leva default `antiAliasing` to `'smaa'` and note it in the README. Either way confirm stars/fireflies bloom and the vignette/grain are subtle.

- [ ] **Step 6: Verify** — lint/test/tsc/build/e2e green (resize test now also exercises the pipeline's render targets); `pnpm capture` for final stills. No commit; `git status --short`.

---

### Task 8: Cleanup, performance pass, docs

**Files:**
- Delete: `src/shaders/` (both `.glsl`), `src/scene/post.tsx`
- Modify: `src/lib/terrain.ts` (remove `TERRAIN_HEIGHT_GLSL`, `glslFloat`), `src/vite-env.d.ts` (drop `?raw` usage if any), `package.json`, `README.md`
- Create: `e2e/perf.spec.ts`

- [ ] **Step 1: Remove dead code and deps**

Delete the files above and the GLSL exports from `terrain.ts`. Run `pnpm remove postprocessing @react-three/postprocessing`. Then:
```bash
grep -rn "glsl\|postprocessing\|scene-state\|TERRAIN_HEIGHT_GLSL" src
```
Expected: no output.

- [ ] **Step 2: Performance test**

`e2e/perf.spec.ts`:
```ts
import { expect, test } from '@playwright/test'

const SAMPLE_MS = 10_000
const TARGET_FPS = 60
const TOLERANCE_FPS = 5

test.use({ deviceScaleFactor: 2 }) // Canvas dpr clamps to 1.5

test('walks at ~60 fps for 10 s at dpr 1.5', async ({ page }) => {
  await page.goto('/')
  await page.locator('.curtain').waitFor({ state: 'detached', timeout: 60_000 })
  await page.waitForTimeout(2000)
  await page.keyboard.down('KeyW')
  const fps = await page.evaluate(
    (sampleMs) =>
      new Promise<number>((resolve) => {
        let frames = 0
        const start = performance.now()
        const tick = (now: number) => {
          frames++
          if (now - start < sampleMs) requestAnimationFrame(tick)
          else resolve((frames * 1000) / (now - start))
        }
        requestAnimationFrame(tick)
      }),
    SAMPLE_MS,
  )
  await page.keyboard.up('KeyW')
  test.info().annotations.push({ type: 'fps', description: fps.toFixed(1) })
  expect.soft(fps).toBeGreaterThanOrEqual(TARGET_FPS - TOLERANCE_FPS)
})
```
Run `pnpm e2e -- e2e/perf.spec.ts`. If fps < 55, apply in order, re-measuring after each: (1) bloom at half resolution (`bloomPass.setResolutionScale?.(0.5)` or the r184 equivalent in `BloomNode.js`), (2) grass `count` default 197000 → 150000, (3) shadow map 2048 → 1024. Record the final fps in the README.

- [ ] **Step 3: README** — update the stack line (WebGPU + TSL), add the "Requires WebGPU" note with supported browsers, the `pnpm e2e` / `pnpm capture` scripts, the new `src/renderer/` and `src/atmosphere/` folders, the TRAA/SMAA choice from Task 7, and the measured fps.

- [ ] **Step 4: Final verification** — `pnpm lint && pnpm test && npx tsc -b && pnpm build && pnpm e2e`, all green; `pnpm capture` and review every still once more (blue-hour look, stars, fireflies, rim, no T-pose). Run the keyboard checks manually: Tab to the sound button (focus ring visible), Space toggles sound without jumping, J/L/I/K orbit, F attacks, Q blocks.

- [ ] **Step 5: No commit** — `git status --short`; report the file list to the user.
