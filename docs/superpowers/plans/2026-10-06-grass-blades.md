# Grass Blades (Ghost of Tsushima style) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the alpha-tested grass cards with a compute-driven field of curved geometry blades (tall pampas look) that reads as volume up close, continuous in the distance, and never floats.

**Architecture:** Two LOD rings (near ±15 m, far ±60 m) of blades on a world-anchored grid. One compute pass per ring writes per-blade state (`instancedArray` vec4 ×2) each frame — placement by cell hash, Voronoi clumps, noise wind, trample, density/edge fades. A `MeshBasicNodeMaterial` vertex shader reads its blade via `instanceIndex` and builds a quadratic-Bezier blade with taper, edge-on widening and rounded normals; the fragment does custom wrap-lambert + translucency shading with a shared albedo that the ground also uses.

**Tech Stack:** three r184 (`three/webgpu`, `three/tsl`: `instancedArray`, `Fn().compute()`, `mx_noise_float`, `varying`), @react-three/fiber 9, leva, vitest 5 (jsdom), @playwright/test.

**Spec:** `docs/superpowers/specs/2026-10-06-grass-blades-design.md`

## Global Constraints

- **No git commits.** Everything stays local; where a task would commit, run `git status --short` and confirm only expected files changed.
- 60 fps at dpr 1.5 on the user's Mac walking 10 s (`e2e/perf.spec.ts`).
- Look: tall pampas, blades ~0.7–1.3 m (× clump 0.8–1.2), olive base → golden straw tips.
- TypeScript strict; no `any`; no unsafe `as`; kebab-case files; English code; no magic numbers (named constants).
- React Compiler lint: never assign to hook return values; TSL uniforms are module-level; refs end in `Ref`.
- Grass does not cast shadows. Material uses `scene.fogNode` (`fog: true`).
- Every task ends with `pnpm lint && pnpm test && npx tsc -b && pnpm build` green; tasks touching runtime also run `pnpm e2e`.
- Dev server for captures: `pnpm dev --port 5199 --strictPort` (Playwright reuses it).

## Review Focus

1. **Walking across grid-cell boundaries** — blades stay locked to the world (no jumping/popping). Test: `grass-layout.test.ts` "crossing a cell" (Task 1).
2. **Player near the world edge (±190 m)** — no blades over the void beyond the 400 m ground. Test: `isOnGround` cases (Task 1); used by the simulation (Task 2).
3. **Camera at minimum pitch** — lens stays above the tallest blade. Test: `maxBladeHeight() < CAMERA_MIN_CLEARANCE` (Task 1).
4. **`prefers-reduced-motion`** — no flutter, gusts reduced. Test: `gustScaleFor` (Task 4).
5. **Fast camera turns with TRAA on thin blades** — no ghost trails. Check: Task 7 capture review with the SMAA fallback ready.

---

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/grass/grass-config.ts` (+test) | Ring configs, blade/wind/colour defaults, control ranges, `maxBladeHeight`, `gustScaleFor` | 1, 4 |
| `src/grass/grass-layout.ts` (+test) | Pure TS: ring side/count, world-anchored cell index, ring density, ground mask | 1 |
| `src/grass/grass-blade-geometry.ts` (+test) | Base blade strip geometry (`bladeT`, `bladeSide`) | 1 |
| `src/grass/grass-uniforms.ts` | Module-level TSL uniforms built from `GRASS_DEFAULTS` | 2 |
| `src/grass/grass-hash.ts` | TSL `hash21`, `hash22` | 2 |
| `src/grass/grass-nodes.ts` | TSL twins of layout functions (`ringDensityNode`, `groundMaskNode`) | 2 |
| `src/grass/grass-state.ts` | Per-ring `instancedArray` buffers | 2 |
| `src/grass/grass-simulation.ts` | Per-ring compute (placement → clumps/wind/trample) | 2, 4 |
| `src/grass/grass-color.ts` | Shared albedo (`grassAlbedoNode`, `groundAlbedoNode`) | 5 |
| `src/grass/grass-material.ts` | Blade vertex shape + fragment shading | 2, 3, 5 |
| `src/grass/grass-controls.tsx` | Leva → uniforms | 2 |
| `src/grass/grass.tsx` | Mounts ring meshes, dispatches compute | 2, 6 |
| `src/scene/ground.tsx` | Ground node material with grass albedo | 6 |
| Deleted (Task 7) | `src/scene/grass.tsx`, `src/scene/grass-material.ts`, `src/scene/grass-patch.ts` (+test), `public/cloud.jpg` | 7 |

---

### Task 1: Config, layout and blade geometry (pure, tested)

**Files:**
- Create: `src/grass/grass-config.ts`, `src/grass/grass-config.test.ts`, `src/grass/grass-layout.ts`, `src/grass/grass-layout.test.ts`, `src/grass/grass-blade-geometry.ts`, `src/grass/grass-blade-geometry.test.ts`

**Interfaces:**
- Consumes: `GROUND_SIZE` (`src/lib/world.ts`), `CAMERA_MIN_CLEARANCE` (`src/scene/camera-clearance.ts`).
- Produces:
  - `type GrassRingName = 'near' | 'far'`
  - `type GrassRingConfig = { name: GrassRingName; halfExtent: number; spacing: number; segments: number; widthScale: number; innerFadeStart: number; innerFadeEnd: number; outerFadeStart: number; thinStart: number; minDensity: number }`
  - `GRASS_RINGS: Record<GrassRingName, GrassRingConfig>`, `GRASS_RING_LIST: readonly GrassRingConfig[]`
  - `GRASS_DEFAULTS` (object of numbers / hex strings, keys listed in Step 5), `maxBladeHeight(): number`
  - `ringSide(ring): number`, `ringBladeCount(ring): number`, `bladeCellIndex(index, ring, playerX, playerZ): { ix: number; iz: number }`, `cellCenter(cellIndex, spacing): number`, `chebyshevDistance(dx, dz): number`, `ringDensity(distance, ring): number`, `isOnGround(x, z): boolean`, `GROUND_HALF_EXTENT: number`
  - `createBladeGeometry(segments: number): BufferGeometry` with attributes `position` (zeros), `bladeT` (float), `bladeSide` (float) and an index

- [ ] **Step 1: Failing layout tests**

`src/grass/grass-layout.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { GRASS_RINGS } from './grass-config'
import {
  bladeCellIndex,
  cellCenter,
  chebyshevDistance,
  isOnGround,
  GROUND_HALF_EXTENT,
  ringBladeCount,
  ringDensity,
  ringSide,
} from './grass-layout'

const near = GRASS_RINGS.near
const far = GRASS_RINGS.far
const SAMPLE_STRIDE = 997

function sampledCells(playerX: number, playerZ: number) {
  const cells: string[] = []
  for (let index = 0; index < ringBladeCount(near); index += SAMPLE_STRIDE) {
    const { ix, iz } = bladeCellIndex(index, near, playerX, playerZ)
    cells.push(`${ix}:${iz}`)
  }
  return cells
}

describe('ring sizing', () => {
  it('covers each ring with a square grid', () => {
    expect(ringSide(near)).toBe(Math.ceil((2 * near.halfExtent) / near.spacing))
    expect(ringBladeCount(far)).toBe(ringSide(far) ** 2)
  })
})

describe('world-anchored grid', () => {
  it('keeps every blade on the same world cell while the player moves inside a cell', () => {
    const base = 3 * near.spacing
    expect(sampledCells(base + 0.01, 1.2)).toEqual(sampledCells(base + near.spacing * 0.9, 1.2))
  })

  it('crossing a cell shifts indices by one column but keeps shared world cells identical', () => {
    const before = bladeCellIndex(500, near, 0.001, 0.001)
    const after = bladeCellIndex(499, near, near.spacing + 0.001, 0.001)
    expect(after).toEqual(before)
  })

  it('never places a blade outside its ring', () => {
    const playerX = 12.34
    const playerZ = -56.7
    for (let index = 0; index < ringBladeCount(near); index += SAMPLE_STRIDE) {
      const { ix, iz } = bladeCellIndex(index, near, playerX, playerZ)
      const dx = cellCenter(ix, near.spacing) - playerX
      const dz = cellCenter(iz, near.spacing) - playerZ
      expect(chebyshevDistance(dx, dz)).toBeLessThanOrEqual(near.halfExtent + near.spacing)
    }
  })
})

describe('ringDensity', () => {
  it('is full near the player for the near ring and empty at its edge', () => {
    expect(ringDensity(0, near)).toBe(1)
    expect(ringDensity(near.halfExtent, near)).toBe(0)
  })

  it('leaves the centre to the near ring and fades the far ring out at its edge', () => {
    expect(ringDensity(0, far)).toBe(0)
    expect(ringDensity(far.halfExtent, far)).toBe(0)
  })

  it('cross-fades the two rings so their sum stays at 1 inside the overlap', () => {
    const overlap = (near.outerFadeStart + near.halfExtent) / 2
    expect(ringDensity(overlap, near) + ringDensity(overlap, far)).toBeCloseTo(1, 5)
  })

  it('thins the far ring monotonically with distance', () => {
    let previous = Number.POSITIVE_INFINITY
    for (let d = far.innerFadeEnd; d <= far.halfExtent; d += 1) {
      const density = ringDensity(d, far)
      expect(density).toBeLessThanOrEqual(previous + 1e-9)
      previous = density
    }
  })
})

describe('isOnGround', () => {
  it('accepts points on the 400 m ground and rejects the void past it', () => {
    expect(isOnGround(0, 0)).toBe(true)
    expect(isOnGround(GROUND_HALF_EXTENT - 0.1, -GROUND_HALF_EXTENT + 0.1)).toBe(true)
    expect(isOnGround(GROUND_HALF_EXTENT + 0.1, 0)).toBe(false)
    expect(isOnGround(0, -GROUND_HALF_EXTENT - 0.1)).toBe(false)
  })
})
```

`src/grass/grass-config.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { CAMERA_MIN_CLEARANCE } from '../scene/camera-clearance'
import { maxBladeHeight } from './grass-config'

describe('grass config', () => {
  it('keeps the tallest blade below the camera clearance', () => {
    expect(maxBladeHeight()).toBeLessThan(CAMERA_MIN_CLEARANCE)
  })
})
```

`src/grass/grass-blade-geometry.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { createBladeGeometry } from './grass-blade-geometry'

const SEGMENTS = 6

describe('createBladeGeometry', () => {
  const geometry = createBladeGeometry(SEGMENTS)
  const t = geometry.getAttribute('bladeT')
  const side = geometry.getAttribute('bladeSide')
  const index = geometry.getIndex()

  it('has two vertices per row and two triangles per segment', () => {
    expect(geometry.getAttribute('position').count).toBe(2 * (SEGMENTS + 1))
    expect(index?.count).toBe(SEGMENTS * 6)
  })

  it('runs bladeT from 0 at the root to 1 at the tip', () => {
    expect(t.getX(0)).toBe(0)
    expect(t.getX(t.count - 1)).toBe(1)
    for (let i = 2; i < t.count; i++) expect(t.getX(i)).toBeGreaterThanOrEqual(t.getX(i - 2))
  })

  it('alternates bladeSide between -1 and +1', () => {
    for (let i = 0; i < side.count; i++) expect([-1, 1]).toContain(side.getX(i))
  })

  it('only references existing vertices', () => {
    const vertexCount = t.count
    for (let i = 0; i < (index?.count ?? 0); i++) expect(index?.getX(i)).toBeLessThan(vertexCount)
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (modules missing). Run: `pnpm test -- src/grass`

- [ ] **Step 3: Implement config**

`src/grass/grass-config.ts`:
```ts
export type GrassRingName = 'near' | 'far'

export type GrassRingConfig = {
  name: GrassRingName
  /** Half side of the square ring around the player (m). */
  halfExtent: number
  /** Grid cell size (m); one blade per cell. */
  spacing: number
  /** Bezier segments along the blade. */
  segments: number
  /** Blade width multiplier (sparser rings use wider blades). */
  widthScale: number
  /** Chebyshev distance where the ring starts to appear (cross-fade in). */
  innerFadeStart: number
  innerFadeEnd: number
  /** Distance where the ring starts fading out toward its edge. */
  outerFadeStart: number
  /** Distance where density thinning begins. */
  thinStart: number
  /** Density reached at the outer edge before the final fade. */
  minDensity: number
}

const NEAR_HALF_EXTENT = 15
const RING_OVERLAP = 3

export const GRASS_RINGS: Record<GrassRingName, GrassRingConfig> = {
  near: {
    name: 'near',
    halfExtent: NEAR_HALF_EXTENT,
    spacing: 0.07,
    segments: 6,
    widthScale: 1,
    innerFadeStart: 0,
    innerFadeEnd: 0,
    outerFadeStart: NEAR_HALF_EXTENT - RING_OVERLAP,
    thinStart: NEAR_HALF_EXTENT,
    minDensity: 1,
  },
  far: {
    name: 'far',
    halfExtent: 60,
    spacing: 0.18,
    segments: 2,
    widthScale: 1.8,
    innerFadeStart: NEAR_HALF_EXTENT - RING_OVERLAP,
    innerFadeEnd: NEAR_HALF_EXTENT,
    outerFadeStart: 50,
    thinStart: NEAR_HALF_EXTENT,
    minDensity: 0.35,
  },
}

export const GRASS_RING_LIST: readonly GrassRingConfig[] = [GRASS_RINGS.near, GRASS_RINGS.far]

// Single source of truth for every tweakable grass value: uniforms and leva
// both read from here.
export const GRASS_DEFAULTS = {
  bladeWidth: 0.04,
  heightMin: 0.7,
  heightMax: 1.3,
  clumpHeightMin: 0.8,
  clumpHeightMax: 1.2,
  leanMin: 0.2,
  leanMax: 0.6,
  stiffnessMin: 0.6,
  stiffnessMax: 1.4,
  clumpSize: 1.5,
  windAngleDeg: 30,
  windStrength: 0.45,
  windScale: 0.035,
  windSpeed: 0.5,
  trampleRadius: 1.8,
  trampleStrength: 0.9,
  baseColor: '#2a3018',
  tipColor: '#c8b273',
  dryColor: '#d9c78f',
  lushColor: '#6d7a3c',
  skyAmbient: '#3e4a6a',
  groundAmbient: '#141810',
  ambientStrength: 0.35,
  diffuseStrength: 0.55,
  aoNear: 0.35,
  aoFar: 0.7,
  translucency: 1.4,
  specStrength: 0.12,
  specShininess: 18,
} as const

export function maxBladeHeight(): number {
  return GRASS_DEFAULTS.heightMax * GRASS_DEFAULTS.clumpHeightMax
}
```

- [ ] **Step 4: Implement layout**

`src/grass/grass-layout.ts`:
```ts
import { GROUND_SIZE } from '../lib/world'
import type { GrassRingConfig } from './grass-config'

export const GROUND_HALF_EXTENT = GROUND_SIZE / 2

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function ringSide(ring: GrassRingConfig): number {
  return Math.ceil((2 * ring.halfExtent) / ring.spacing)
}

export function ringBladeCount(ring: GrassRingConfig): number {
  return ringSide(ring) ** 2
}

// Integer world cell of blade `index`. The grid origin snaps to the cell under
// the player, so a blade keeps its world cell until the player crosses a
// cell — then indices shift by exactly one row/column.
export function bladeCellIndex(
  index: number,
  ring: GrassRingConfig,
  playerX: number,
  playerZ: number,
): { ix: number; iz: number } {
  const side = ringSide(ring)
  const half = Math.floor(side / 2)
  const column = index % side
  const row = Math.floor(index / side)
  return {
    ix: Math.floor(playerX / ring.spacing) + column - half,
    iz: Math.floor(playerZ / ring.spacing) + row - half,
  }
}

export function cellCenter(cellIndex: number, spacing: number): number {
  return (cellIndex + 0.5) * spacing
}

export function chebyshevDistance(dx: number, dz: number): number {
  return Math.max(Math.abs(dx), Math.abs(dz))
}

// Fraction of blades kept at `distance` (Chebyshev) from the player.
export function ringDensity(distance: number, ring: GrassRingConfig): number {
  const fadeIn = ring.innerFadeEnd > ring.innerFadeStart ? smoothstep(ring.innerFadeStart, ring.innerFadeEnd, distance) : 1
  const fadeOut = 1 - smoothstep(ring.outerFadeStart, ring.halfExtent, distance)
  const thinT = Math.min(1, Math.max(0, (distance - ring.thinStart) / (ring.halfExtent - ring.thinStart)))
  const thin = distance <= ring.thinStart ? 1 : 1 + (ring.minDensity - 1) * thinT
  return fadeIn * fadeOut * thin
}

export function isOnGround(x: number, z: number): boolean {
  return Math.abs(x) <= GROUND_HALF_EXTENT && Math.abs(z) <= GROUND_HALF_EXTENT
}
```

- [ ] **Step 5: Implement blade geometry**

`src/grass/grass-blade-geometry.ts`:
```ts
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu'

const VERTICES_PER_ROW = 2

// A flat strip: rows from root (bladeT = 0) to tip (bladeT = 1), two vertices
// per row (bladeSide −1 / +1). Positions are placeholders — the vertex shader
// builds the real shape from bladeT / bladeSide and the blade's state.
export function createBladeGeometry(segments: number): BufferGeometry {
  const rows = segments + 1
  const vertexCount = rows * VERTICES_PER_ROW
  const bladeT = new Float32Array(vertexCount)
  const bladeSide = new Float32Array(vertexCount)
  for (let row = 0; row < rows; row++) {
    const t = row / segments
    bladeT[row * 2] = t
    bladeT[row * 2 + 1] = t
    bladeSide[row * 2] = -1
    bladeSide[row * 2 + 1] = 1
  }

  const indices: number[] = []
  for (let segment = 0; segment < segments; segment++) {
    const a = segment * 2
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(vertexCount * 3), 3))
  geometry.setAttribute('bladeT', new Float32BufferAttribute(bladeT, 1))
  geometry.setAttribute('bladeSide', new Float32BufferAttribute(bladeSide, 1))
  geometry.setIndex(indices)
  return geometry
}
```

- [ ] **Step 6: Run — expect PASS.** Run: `pnpm test -- src/grass`. If the cross-fade test is off, check `outerFadeStart`/`innerFadeStart` match (both `NEAR_HALF_EXTENT - RING_OVERLAP`) — they must for the sum to be 1.

- [ ] **Step 7: Verify + no commit** — `pnpm lint && pnpm test && npx tsc -b && pnpm build`; `git status --short`.

---

### Task 2: Uniforms, state, placement compute and near ring (flat colour)

**Files:**
- Create: `src/grass/grass-uniforms.ts`, `src/grass/grass-hash.ts`, `src/grass/grass-nodes.ts`, `src/grass/grass-state.ts`, `src/grass/grass-simulation.ts`, `src/grass/grass-material.ts`, `src/grass/grass-controls.tsx`, `src/grass/grass.tsx`
- Modify: `src/experience.tsx` (mount new `<Grass />` from `./grass/grass` instead of `./scene/grass`; add `<GrassControls />` next to `<AtmosphereControls />`)

**Interfaces:**
- Consumes: Task 1 exports; `playerPosition`, `motionScale` (`src/lib/shared-uniforms.ts`); `terrainHeightNode` (`src/lib/terrain.ts`); `asWebGPURenderer` (`src/renderer/as-webgpu-renderer.ts`).
- Produces:
  - `grassUniforms` (module object of uniform nodes; keys = `GRASS_DEFAULTS` keys except colours become `Color` uniforms, plus `windDirection: uniform(Vector2)`)
  - `hash21(p: Node<'vec2'>): Node<'float'>`, `hash22(p: Node<'vec2'>): Node<'vec2'>`
  - `ringDensityNode(distance: Node<'float'>, ring): Node<'float'>`, `groundMaskNode(world: Node<'vec2'>): Node<'float'>`
  - `type RingState = { ring: GrassRingConfig; count: number; bladeA: StorageBuffer; bladeB: StorageBuffer }` where `StorageBuffer = ReturnType<typeof instancedArray>`; `createRingState(ring): RingState`
  - `createRingSimulation(state: RingState): ComputeNode` (`ReturnType<ReturnType<typeof Fn>['compute']>` — use the inferred type)
  - `createGrassMaterial(state: RingState): MeshBasicNodeMaterial`
  - `<Grass />`, `<GrassControls />`
  - Blade state layout: `bladeA = (worldX, worldZ, height, yaw)`, `bladeB = (bendX, bendZ, clumpTint, seed)`

- [ ] **Step 1: Uniforms**

`src/grass/grass-uniforms.ts`:
```ts
import { uniform } from 'three/tsl'
import { Color, MathUtils, Vector2 } from 'three/webgpu'
import { GRASS_DEFAULTS } from './grass-config'

export function windDirectionFromAngle(angleDeg: number): Vector2 {
  const radians = MathUtils.degToRad(angleDeg)
  return new Vector2(Math.cos(radians), Math.sin(radians))
}

const d = GRASS_DEFAULTS

// Module-level so <GrassControls> can write `.value` without mutating hook
// return values. Built from GRASS_DEFAULTS — the single source of defaults.
export const grassUniforms = {
  bladeWidth: uniform(d.bladeWidth),
  heightMin: uniform(d.heightMin),
  heightMax: uniform(d.heightMax),
  clumpHeightMin: uniform(d.clumpHeightMin),
  clumpHeightMax: uniform(d.clumpHeightMax),
  leanMin: uniform(d.leanMin),
  leanMax: uniform(d.leanMax),
  stiffnessMin: uniform(d.stiffnessMin),
  stiffnessMax: uniform(d.stiffnessMax),
  clumpSize: uniform(d.clumpSize),
  windDirection: uniform(windDirectionFromAngle(d.windAngleDeg)),
  windStrength: uniform(d.windStrength),
  windScale: uniform(d.windScale),
  windSpeed: uniform(d.windSpeed),
  trampleRadius: uniform(d.trampleRadius),
  trampleStrength: uniform(d.trampleStrength),
  baseColor: uniform(new Color(d.baseColor)),
  tipColor: uniform(new Color(d.tipColor)),
  dryColor: uniform(new Color(d.dryColor)),
  lushColor: uniform(new Color(d.lushColor)),
  skyAmbient: uniform(new Color(d.skyAmbient)),
  groundAmbient: uniform(new Color(d.groundAmbient)),
  ambientStrength: uniform(d.ambientStrength),
  diffuseStrength: uniform(d.diffuseStrength),
  aoNear: uniform(d.aoNear),
  aoFar: uniform(d.aoFar),
  translucency: uniform(d.translucency),
  specStrength: uniform(d.specStrength),
  specShininess: uniform(d.specShininess),
}
```

Add to `src/grass/grass-config.test.ts`:
```ts
import { GRASS_DEFAULTS } from './grass-config'
import { grassUniforms } from './grass-uniforms'

describe('grass uniforms', () => {
  it('start from GRASS_DEFAULTS', () => {
    expect(grassUniforms.windStrength.value).toBe(GRASS_DEFAULTS.windStrength)
    expect(grassUniforms.heightMax.value).toBe(GRASS_DEFAULTS.heightMax)
    expect(`#${grassUniforms.tipColor.value.getHexString()}`).toBe(GRASS_DEFAULTS.tipColor)
  })
})
```
Run `pnpm test -- src/grass` — FAIL first (module missing), then PASS after creating the file.

- [ ] **Step 2: Hash + layout node twins + state**

`src/grass/grass-hash.ts`:
```ts
import { dot, fract, sin, vec2 } from 'three/tsl'
import type { Node } from 'three/webgpu'

const HASH_DOT = vec2(127.1, 311.7)
const HASH_SCALE = 43758.5453
const HASH22_OFFSET = vec2(19.19, 7.31)

// Classic sin-fract hash; inputs are integer cell coordinates (small), so
// float precision is fine.
export function hash21(p: Node<'vec2'>): Node<'float'> {
  return fract(sin(dot(p, HASH_DOT)).mul(HASH_SCALE))
}

export function hash22(p: Node<'vec2'>): Node<'vec2'> {
  return vec2(hash21(p), hash21(p.add(HASH22_OFFSET)))
}
```

`src/grass/grass-nodes.ts`:
```ts
import { abs, clamp, float, mix, oneMinus, smoothstep, step } from 'three/tsl'
import type { Node } from 'three/webgpu'
import type { GrassRingConfig } from './grass-config'
import { GROUND_HALF_EXTENT } from './grass-layout'

// TSL twin of ringDensity() in grass-layout.ts — keep the two in sync.
export function ringDensityNode(distance: Node<'float'>, ring: GrassRingConfig): Node<'float'> {
  const fadeIn =
    ring.innerFadeEnd > ring.innerFadeStart ? smoothstep(ring.innerFadeStart, ring.innerFadeEnd, distance) : float(1)
  const fadeOut = oneMinus(smoothstep(ring.outerFadeStart, ring.halfExtent, distance))
  const thinT = clamp(distance.sub(ring.thinStart).div(ring.halfExtent - ring.thinStart), 0, 1)
  const thin = mix(float(1), float(ring.minDensity), thinT)
  return fadeIn.mul(fadeOut).mul(thin)
}

// TSL twin of isOnGround(): 1 on the ground, 0 over the void.
export function groundMaskNode(world: Node<'vec2'>): Node<'float'> {
  return step(abs(world.x), float(GROUND_HALF_EXTENT)).mul(step(abs(world.y), float(GROUND_HALF_EXTENT)))
}
```
(`thin` with `thinStart === halfExtent` divides by 0 for the near ring — guard: if `ring.halfExtent === ring.thinStart` return `fadeIn.mul(fadeOut)`. Apply the same guard in `ringDensity` if a test exposes it.)

`src/grass/grass-state.ts`:
```ts
import { instancedArray } from 'three/tsl'
import type { GrassRingConfig } from './grass-config'
import { ringBladeCount } from './grass-layout'

export type StorageBuffer = ReturnType<typeof instancedArray>

export type RingState = {
  ring: GrassRingConfig
  count: number
  /** (worldX, worldZ, height, yaw) */
  bladeA: StorageBuffer
  /** (bendX, bendZ, clumpTint, seed) */
  bladeB: StorageBuffer
}

export function createRingState(ring: GrassRingConfig): RingState {
  const count = ringBladeCount(ring)
  return { ring, count, bladeA: instancedArray(count, 'vec4'), bladeB: instancedArray(count, 'vec4') }
}
```

- [ ] **Step 3: Placement compute (static: no clumps/wind/trample yet)**

`src/grass/grass-simulation.ts`:
```ts
import { abs, cos, float, floor, Fn, instanceIndex, max, mix, sin, step, vec2, vec4 } from 'three/tsl'
import { playerPosition } from '../lib/shared-uniforms'
import { hash21, hash22 } from './grass-hash'
import { ringSide } from './grass-layout'
import { groundMaskNode, ringDensityNode } from './grass-nodes'
import type { RingState } from './grass-state'
import { grassUniforms } from './grass-uniforms'

const TWO_PI = Math.PI * 2
// Distinct offsets so each per-blade property draws an independent hash.
const HASH_HEIGHT = vec2(13.7, 7.1)
const HASH_YAW = vec2(29.3, 3.9)
const HASH_LEAN = vec2(5.1, 41.2)
const HASH_RANK = vec2(57.8, 17.4)
const HASH_SEED = vec2(71.9, 63.3)

export function createRingSimulation(state: RingState) {
  const { ring } = state
  const side = ringSide(ring)
  const half = Math.floor(side / 2)
  const u = grassUniforms

  return Fn(() => {
    const index = float(instanceIndex)
    const column = index.mod(side)
    const row = floor(index.div(side))
    const cell = vec2(
      floor(playerPosition.x.div(ring.spacing)).add(column).sub(half),
      floor(playerPosition.z.div(ring.spacing)).add(row).sub(half),
    )
    const jitter = hash22(cell).sub(0.5).mul(ring.spacing)
    const world = cell.add(0.5).mul(ring.spacing).add(jitter)

    const baseHeight = mix(u.heightMin, u.heightMax, hash21(cell.add(HASH_HEIGHT)))
    const yaw = hash21(cell.add(HASH_YAW)).mul(TWO_PI)
    const lean = mix(u.leanMin, u.leanMax, hash21(cell.add(HASH_LEAN)))
    const rank = hash21(cell.add(HASH_RANK))
    const seed = hash21(cell.add(HASH_SEED))

    const offset = world.sub(playerPosition.xz)
    const distance = max(abs(offset.x), abs(offset.y))
    const visible = step(rank, ringDensityNode(distance, ring))
    const height = baseHeight.mul(visible).mul(groundMaskNode(world))

    // Blades lean along their facing (perpendicular to the width direction).
    const facing = vec2(sin(yaw).negate(), cos(yaw))
    const bend = facing.mul(lean.mul(baseHeight))

    state.bladeA.element(instanceIndex).assign(vec4(world.x, world.y, height, yaw))
    state.bladeB.element(instanceIndex).assign(vec4(bend.x, bend.y, 0.5, seed))
  })().compute(state.count)
}
```

- [ ] **Step 4: Minimal material (straight blades, flat gradient)**

`src/grass/grass-material.ts`:
```ts
import { attribute, cos, instanceIndex, mix, oneMinus, sin, varying, vec3, vec4 } from 'three/tsl'
import { DoubleSide, MeshBasicNodeMaterial } from 'three/webgpu'
import { terrainHeightNode } from '../lib/terrain'
import type { RingState } from './grass-state'
import { grassUniforms } from './grass-uniforms'

export function createGrassMaterial(state: RingState): MeshBasicNodeMaterial {
  const u = grassUniforms
  const a = state.bladeA.element(instanceIndex)
  const t = attribute<'float'>('bladeT', 'float')
  const side = attribute<'float'>('bladeSide', 'float')

  const root = vec3(a.x, terrainHeightNode(a.xy), a.y)
  const widthDir = vec3(cos(a.w), 0, sin(a.w))
  const width = u.bladeWidth.mul(state.ring.widthScale).mul(oneMinus(t))
  const position = root.add(vec3(0, a.z.mul(t), 0)).add(widthDir.mul(side.mul(width).mul(0.5)))

  const material = new MeshBasicNodeMaterial({ side: DoubleSide })
  material.positionNode = position
  material.colorNode = vec4(mix(u.baseColor, u.tipColor, varying(t)), 1)
  return material
}
```

- [ ] **Step 5: Grass component + controls**

`src/grass/grass.tsx`:
```tsx
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Mesh } from 'three/webgpu'
import { asWebGPURenderer } from '../renderer/as-webgpu-renderer'
import { createBladeGeometry } from './grass-blade-geometry'
import { GRASS_RING_LIST, type GrassRingConfig } from './grass-config'
import { createGrassMaterial } from './grass-material'
import { createRingSimulation } from './grass-simulation'
import { createRingState } from './grass-state'

function buildRing(ring: GrassRingConfig) {
  const state = createRingState(ring)
  const geometry = createBladeGeometry(ring.segments)
  const material = createGrassMaterial(state)
  const mesh = new Mesh(geometry, material)
  // Mesh.count instances the strip without an instanceMatrix buffer.
  mesh.count = state.count
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = false
  return { name: ring.name, mesh, geometry, material, simulation: createRingSimulation(state) }
}

// Rings to mount; Task 6 adds the far ring by widening this list.
const ACTIVE_RINGS: readonly GrassRingConfig[] = GRASS_RING_LIST.filter((ring) => ring.name === 'near')

export function Grass() {
  const rings = useMemo(() => ACTIVE_RINGS.map(buildRing), [])

  useEffect(
    () => () => {
      for (const ring of rings) {
        ring.geometry.dispose()
        ring.material.dispose()
      }
    },
    [rings],
  )

  // Priority 0: runs after <PlayerUniformSync> and before the render pass (priority 1).
  useFrame((state) => {
    const renderer = asWebGPURenderer(state.gl)
    for (const ring of rings) renderer.compute(ring.simulation)
  })

  return (
    <>
      {rings.map((ring) => (
        <primitive key={ring.name} object={ring.mesh} />
      ))}
    </>
  )
}
```

`src/grass/grass-controls.tsx`:
```tsx
import { useControls } from 'leva'
import { useEffect } from 'react'
import { GRASS_DEFAULTS } from './grass-config'
import { grassUniforms, windDirectionFromAngle } from './grass-uniforms'

const d = GRASS_DEFAULTS

export function GrassControls() {
  const c = useControls('grass', {
    bladeWidth: { value: d.bladeWidth, min: 0.01, max: 0.12, step: 0.005 },
    heightMin: { value: d.heightMin, min: 0.1, max: 2, step: 0.05 },
    heightMax: { value: d.heightMax, min: 0.1, max: 2, step: 0.05 },
    windAngleDeg: { value: d.windAngleDeg, min: 0, max: 360, step: 1 },
    windStrength: { value: d.windStrength, min: 0, max: 2, step: 0.05 },
    windScale: { value: d.windScale, min: 0.005, max: 0.2, step: 0.005 },
    windSpeed: { value: d.windSpeed, min: 0, max: 3, step: 0.05 },
    trampleRadius: { value: d.trampleRadius, min: 0, max: 5, step: 0.1 },
    trampleStrength: { value: d.trampleStrength, min: 0, max: 3, step: 0.05 },
    baseColor: d.baseColor,
    tipColor: d.tipColor,
    dryColor: d.dryColor,
    lushColor: d.lushColor,
    ambientStrength: { value: d.ambientStrength, min: 0, max: 2, step: 0.05 },
    diffuseStrength: { value: d.diffuseStrength, min: 0, max: 2, step: 0.05 },
    aoNear: { value: d.aoNear, min: 0, max: 1, step: 0.05 },
    aoFar: { value: d.aoFar, min: 0, max: 1, step: 0.05 },
    translucency: { value: d.translucency, min: 0, max: 4, step: 0.05 },
    specStrength: { value: d.specStrength, min: 0, max: 1, step: 0.01 },
  })

  useEffect(() => {
    const u = grassUniforms
    u.bladeWidth.value = c.bladeWidth
    u.heightMin.value = c.heightMin
    u.heightMax.value = c.heightMax
    u.windDirection.value.copy(windDirectionFromAngle(c.windAngleDeg))
    u.windStrength.value = c.windStrength
    u.windScale.value = c.windScale
    u.windSpeed.value = c.windSpeed
    u.trampleRadius.value = c.trampleRadius
    u.trampleStrength.value = c.trampleStrength
    u.baseColor.value.set(c.baseColor)
    u.tipColor.value.set(c.tipColor)
    u.dryColor.value.set(c.dryColor)
    u.lushColor.value.set(c.lushColor)
    u.ambientStrength.value = c.ambientStrength
    u.diffuseStrength.value = c.diffuseStrength
    u.aoNear.value = c.aoNear
    u.aoFar.value = c.aoFar
    u.translucency.value = c.translucency
    u.specStrength.value = c.specStrength
  }, [c])

  return null
}
```

`src/experience.tsx`: replace `import { Grass } from './scene/grass'` with `import { Grass } from './grass/grass'` and `import { GrassControls } from './grass/grass-controls'`; render `<GrassControls />` right after `<AtmosphereControls />`.

- [ ] **Step 6: Verify the world-anchored grid in the browser**

Run lint/test/tsc/build/e2e. Then capture (dev server on 5199) standing and after running 6 s (`Shift+W`) with a throwaway script like Task 7's capture spec. Expected: straight gradient blades in a ±15 m square around the paladin, following him; blades do not slide or jump while walking (watch one blade near the camera across frames). No console errors.

- [ ] **Step 7: No commit** — `git status --short`.

---

### Task 3: Blade shape — Bezier, taper, edge-on widening, rounded normals

**Files:**
- Modify: `src/grass/grass-material.ts`

**Interfaces:**
- Consumes: `RingState` blade layout (Task 2).
- Produces: varyings used by Task 5 — exported helper `bladeVaryings(state)` returning `{ position, normal, t, seed, tint, distance }` (TSL nodes), consumed inside `createGrassMaterial`.

- [ ] **Step 1: Replace the straight blade with the shaped blade**

In `src/grass/grass-material.ts`, replace the body above `const material = …` with:
```ts
const EDGE_WIDEN_MAX = 2.2
const EDGE_WIDEN_START = 0.6
const ROUND_ANGLE = Math.PI / 6 // ±30°
const TAPER_POWER = 0.7
const MAX_BEND_FRACTION = 0.9
const NORMAL_FLATTEN_START = 6
const NORMAL_FLATTEN_END = 35
const NORMAL_FLATTEN_AMOUNT = 0.6
const MIN_LENGTH = 1e-4
const UP = vec3(0, 1, 0)

export function bladeVaryings(state: RingState) {
  const u = grassUniforms
  const a = state.bladeA.element(instanceIndex)
  const b = state.bladeB.element(instanceIndex)
  const t = attribute<'float'>('bladeT', 'float')
  const side = attribute<'float'>('bladeSide', 'float')

  const root = vec3(a.x, terrainHeightNode(a.xy), a.y)
  const height = a.z
  const widthDir = vec3(cos(a.w), 0, sin(a.w))

  // Quadratic Bezier root → control → tip; the bend moves the tip while the
  // blade keeps (roughly) its length, so it bends instead of stretching.
  const bend = vec3(b.x, 0, b.y)
  const bendLength = min(length(bend), height.mul(MAX_BEND_FRACTION))
  const bendDir = bend.div(max(length(bend), MIN_LENGTH))
  const tipHeight = sqrt(max(height.mul(height).sub(bendLength.mul(bendLength)), 0))
  const control = root.add(vec3(0, tipHeight, 0))
  const tip = control.add(bendDir.mul(bendLength))
  const s = oneMinus(t)
  const point = root.mul(s.mul(s)).add(control.mul(s.mul(t).mul(2))).add(tip.mul(t.mul(t)))
  const tangent = normalize(control.sub(root).mul(s.mul(2)).add(tip.sub(control).mul(t.mul(2))).add(UP.mul(MIN_LENGTH)))
  const bladeNormal = normalize(cross(widthDir, tangent))

  // Edge-on blades widen so they never collapse to 1-px lines.
  const toCamera = normalize(cameraPosition.sub(root))
  const edgeOn = oneMinus(abs(dot(bladeNormal, toCamera)))
  const widen = mix(float(1), float(EDGE_WIDEN_MAX), smoothstep(EDGE_WIDEN_START, 1, edgeOn))
  const width = u.bladeWidth.mul(state.ring.widthScale).mul(pow(s, TAPER_POWER)).mul(widen)
  const position = point.add(widthDir.mul(side.mul(width).mul(0.5)))

  // Rounded normal: tilt ±30° across the blade; flatten toward up with distance
  // so the far field shades like a soft surface.
  const rounded = normalize(bladeNormal.mul(Math.cos(ROUND_ANGLE)).add(widthDir.mul(side.mul(Math.sin(ROUND_ANGLE)))))
  const distance = length(cameraPosition.sub(root))
  const flatten = smoothstep(NORMAL_FLATTEN_START, NORMAL_FLATTEN_END, distance).mul(NORMAL_FLATTEN_AMOUNT)
  const normal = normalize(mix(rounded, UP, flatten))

  return { position, normal, t, seed: b.w, tint: b.z, distance }
}
```
Then in `createGrassMaterial`:
```ts
const blade = bladeVaryings(state)
const material = new MeshBasicNodeMaterial({ side: DoubleSide })
material.positionNode = blade.position
const vNormal = varying(blade.normal)
const vT = varying(blade.t)
material.colorNode = vec4(mix(u.baseColor, u.tipColor, vT).mul(max(dot(normalize(vNormal), UP), 0.3)), 1)
```
Update the TSL import list to: `abs, attribute, cameraPosition, cos, cross, dot, float, instanceIndex, length, max, min, mix, normalize, oneMinus, pow, sin, smoothstep, sqrt, varying, vec3, vec4`.

- [ ] **Step 2: Verify** — tsc/lint/test/build/e2e green. Capture standing, at minimum pitch (`I` held 1.5 s) and facing the sun (`J` 1.3 s). Expected: curved, tapered blades with visible shading across their width (rounded), no flat strips; edge-on blades still visible. No console errors.

- [ ] **Step 3: No commit** — `git status --short`.

---

### Task 4: Clumps, wind, stiffness, trample (+ reduced motion)

**Files:**
- Modify: `src/grass/grass-simulation.ts`, `src/grass/grass-config.ts`, `src/grass/grass-config.test.ts`

**Interfaces:**
- Consumes: `motionScale` (`src/lib/shared-uniforms.ts`), `time`.
- Produces: `gustScaleFor(motionScale: number): number`, constants `REDUCED_GUST_SCALE`.

- [ ] **Step 1: Failing test (Review Focus 4)** — append to `src/grass/grass-config.test.ts`:
```ts
import { gustScaleFor, REDUCED_GUST_SCALE } from './grass-config'

describe('gustScaleFor', () => {
  it('keeps full gusts with normal motion', () => {
    expect(gustScaleFor(1)).toBe(1)
  })
  it('reduces gusts for reduced motion', () => {
    expect(gustScaleFor(0)).toBe(REDUCED_GUST_SCALE)
  })
})
```
Run — FAIL.

- [ ] **Step 2: Implement in `grass-config.ts`**
```ts
// Reduced motion keeps a gentle sway instead of freezing the field.
export const REDUCED_GUST_SCALE = 0.3

export function gustScaleFor(motionScale: number): number {
  return REDUCED_GUST_SCALE + (1 - REDUCED_GUST_SCALE) * motionScale
}
```
Run — PASS.

- [ ] **Step 3: Extend the compute** — in `createRingSimulation`, after `seed` and before `offset`, add clumps, wind and trample, and replace `height`/`bend`:
```ts
    // Voronoi clumps: nearest jittered centre among the 3×3 neighbouring cells.
    const clumpCell = floor(world.div(u.clumpSize))
    const bestDistance = float(CLUMP_SEARCH_INFINITY).toVar()
    const bestCell = vec2(0, 0).toVar()
    const bestCenter = vec2(0, 0).toVar()
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const candidateCell = clumpCell.add(vec2(dx, dz))
        const candidateCenter = candidateCell.add(hash22(candidateCell)).mul(u.clumpSize)
        const candidateDistance = length(world.sub(candidateCenter))
        const closer = candidateDistance.lessThan(bestDistance)
        bestCell.assign(select(closer, candidateCell, bestCell))
        bestCenter.assign(select(closer, candidateCenter, bestCenter))
        bestDistance.assign(min(bestDistance, candidateDistance))
      }
    }
    const clumpHash = hash21(bestCell.add(HASH_CLUMP))
    const clumpTint = hash21(bestCell.add(HASH_CLUMP_TINT))
    const clumpHeight = mix(u.clumpHeightMin, u.clumpHeightMax, clumpHash)
    const clumpYaw = mix(yaw, clumpHash.mul(TWO_PI), CLUMP_YAW_WEIGHT)
    const toClump = bestCenter.sub(world)
    const clumpLean = toClump.div(max(length(toClump), MIN_LENGTH)).mul(CLUMP_LEAN)

    // Wind: domain-warped scrolling noise → gusts that travel across the field.
    const windUv = world.mul(u.windScale).sub(u.windDirection.mul(time.mul(u.windSpeed)))
    const warp = vec2(mx_noise_float(vec3(windUv, WARP_Z_A)), mx_noise_float(vec3(windUv, WARP_Z_B))).mul(WIND_WARP)
    const gust = mx_noise_float(vec3(windUv.add(warp), time.mul(GUST_EVOLUTION))).mul(0.5).add(0.5)
    const stiffness = mix(u.stiffnessMin, u.stiffnessMax, hash21(cell.add(HASH_STIFFNESS)))
    const flutter = sin(time.mul(FLUTTER_RATE).add(seed.mul(TWO_PI))).mul(FLUTTER_AMPLITUDE).mul(motionScale)
    const gustScale = float(REDUCED_GUST_SCALE).add(oneMinus(float(REDUCED_GUST_SCALE)).mul(motionScale))
    const windAmount = gust.mul(u.windStrength).mul(gustScale).add(flutter).div(stiffness)

    // Trample: push away from the player and sink a little.
    const toBlade = world.sub(playerPosition.xz)
    const trampleDistance = length(toBlade)
    const trample = oneMinus(smoothstep(0, u.trampleRadius, trampleDistance))
    const away = toBlade.div(max(trampleDistance, MIN_LENGTH))

    const fullHeight = baseHeight.mul(clumpHeight).mul(oneMinus(trample.mul(TRAMPLE_SINK)))
```
Then compute `facing` from `clumpYaw`, and:
```ts
    const facing = vec2(sin(clumpYaw).negate(), cos(clumpYaw))
    const bend = facing
      .mul(lean)
      .add(clumpLean)
      .add(u.windDirection.mul(windAmount))
      .add(away.mul(trample.mul(u.trampleStrength)))
      .mul(fullHeight)
    const height = fullHeight.mul(visible).mul(groundMaskNode(world))

    state.bladeA.element(instanceIndex).assign(vec4(world.x, world.y, height, clumpYaw))
    state.bladeB.element(instanceIndex).assign(vec4(bend.x, bend.y, clumpTint, seed))
```
Constants at module top:
```ts
const HASH_STIFFNESS = vec2(83.3, 29.9)
const HASH_CLUMP = vec2(3.3, 91.1)
const HASH_CLUMP_TINT = vec2(47.7, 11.3)
const CLUMP_SEARCH_INFINITY = 1e9
const CLUMP_YAW_WEIGHT = 0.6
const CLUMP_LEAN = 0.15
const WIND_WARP = 0.6
const WARP_Z_A = 1.7
const WARP_Z_B = 9.2
const GUST_EVOLUTION = 0.05
const FLUTTER_RATE = 3.1
const FLUTTER_AMPLITUDE = 0.06
const TRAMPLE_SINK = 0.35
const MIN_LENGTH = 1e-4
```
Imports: add `length, min, mx_noise_float, oneMinus, select, smoothstep, time, vec3` from `three/tsl`, `motionScale` from `../lib/shared-uniforms`, `REDUCED_GUST_SCALE` from `./grass-config`. Remove the old `bend`/`height` lines.

- [ ] **Step 4: Verify** — tsc/lint/test/build/e2e green. In the dev server: gust bands travel across the field; blades bend toward the wind with varying stiffness; clumps visible as grouped heights/orientations; blades part around the paladin. Capture a 3-frame sequence 300 ms apart to confirm motion. No console errors.

- [ ] **Step 5: No commit.**

---

### Task 5: Colour and light (shared albedo, AO by distance, translucency, soft spec)

**Files:**
- Create: `src/grass/grass-color.ts`
- Modify: `src/grass/grass-material.ts`

**Interfaces:**
- Consumes: `atmosphere` (`sunDirection`, `moonDirection`, `sunColor`, `moonColor`, `sunIntensity`, `moonIntensity`), `grassUniforms`, `bladeVaryings`.
- Produces: `grassAlbedoNode(xz, t, seed, tint): Node<'vec3'>`, `groundAlbedoNode(xz): Node<'vec3'>` (Task 6 uses it).

- [ ] **Step 1: Shared albedo**

`src/grass/grass-color.ts`:
```ts
import { float, mix, mx_noise_float, pow, smoothstep, vec3 } from 'three/tsl'
import type { Node } from 'three/webgpu'
import { grassUniforms } from './grass-uniforms'

const ZONE_SCALE = 0.02
const ZONE_LOW = 0.35
const ZONE_HIGH = 0.65
const ZONE_WEIGHT = 0.6
const GRADIENT_POWER = 1.5
const BRIGHTNESS_RANGE = 0.3 // ±15 %
const CLUMP_TINT_COOL = vec3(0.93, 1, 0.92)
const CLUMP_TINT_WARM = vec3(1.06, 1, 0.94)
const GROUND_SAMPLE_T = 0.55
const GROUND_DARKEN = 0.7

// Field colour at `xz` for a point `t` along a blade (0 root → 1 tip).
export function grassAlbedoNode(
  xz: Node<'vec2'>,
  t: Node<'float'>,
  seed: Node<'float'>,
  tint: Node<'float'>,
): Node<'vec3'> {
  const u = grassUniforms
  const zone = mx_noise_float(vec3(xz.mul(ZONE_SCALE), 0)).mul(0.5).add(0.5)
  const zoneTip = mix(u.lushColor, u.dryColor, smoothstep(ZONE_LOW, ZONE_HIGH, zone))
  const tip = mix(u.tipColor, zoneTip, ZONE_WEIGHT)
  const gradient = mix(u.baseColor, tip, pow(t, GRADIENT_POWER))
  const brightness = seed.sub(0.5).mul(BRIGHTNESS_RANGE).add(1)
  return gradient.mul(brightness).mul(mix(CLUMP_TINT_COOL, CLUMP_TINT_WARM, tint))
}

// Ground under/after the grass: the field's mean colour, darkened like distant AO.
export function groundAlbedoNode(xz: Node<'vec2'>): Node<'vec3'> {
  return grassAlbedoNode(xz, float(GROUND_SAMPLE_T), float(0.5), float(0.5)).mul(GROUND_DARKEN)
}
```

- [ ] **Step 2: Fragment shading** — in `createGrassMaterial`, replace the `colorNode` with:
```ts
  const vNormal = varying(blade.normal)
  const vT = varying(blade.t)
  const vSeed = varying(blade.seed)
  const vTint = varying(blade.tint)
  const vDistance = varying(blade.distance)

  material.colorNode = Fn(() => {
    const albedo = grassAlbedoNode(positionWorld.xz, vT, vSeed, vTint)
    const n = normalize(select(frontFacing, vNormal, vNormal.negate()))
    const v = normalize(cameraPosition.sub(positionWorld))
    const sunL = normalize(atmosphere.sunDirection)
    const moonL = normalize(atmosphere.moonDirection)

    const wrapSun = dot(n, sunL).mul(0.5).add(0.5)
    const wrapMoon = dot(n, moonL).mul(0.5).add(0.5)
    const direct = atmosphere.sunColor
      .mul(atmosphere.sunIntensity.mul(wrapSun))
      .add(atmosphere.moonColor.mul(atmosphere.moonIntensity.mul(wrapMoon)))
      .mul(u.diffuseStrength)
    const ambient = mix(u.groundAmbient, u.skyAmbient, n.y.mul(0.5).add(0.5)).mul(u.ambientStrength)

    const aoMin = mix(u.aoNear, u.aoFar, smoothstep(AO_FADE_START, AO_FADE_END, vDistance))
    const ao = mix(aoMin, float(1), vT)

    // Backlit translucency: tips glow when looking toward the sun.
    const backlight = pow(max(dot(v.negate(), sunL), 0), TRANSLUCENCY_POWER)
    const translucency = albedo.mul(atmosphere.sunColor).mul(backlight).mul(vT.mul(vT)).mul(u.translucency)

    // Soft anisotropic spec along the blade (tangent ≈ up).
    const halfVector = normalize(sunL.add(v))
    const sinHT = sqrt(max(oneMinus(halfVector.y.mul(halfVector.y)), SPEC_EPSILON))
    const spec = atmosphere.sunColor.mul(pow(sinHT, u.specShininess)).mul(u.specStrength).mul(vT)

    return vec4(albedo.mul(direct.add(ambient)).mul(ao).add(translucency).add(spec), 1)
  })()
```
Constants: `const AO_FADE_START = 5`, `const AO_FADE_END = 40`, `const TRANSLUCENCY_POWER = 4`, `const SPEC_EPSILON = 1e-4`. Imports: add `Fn, frontFacing, positionWorld, select` from `three/tsl`, `atmosphere` from `../atmosphere/atmosphere`, `grassAlbedoNode` from `./grass-color`.

- [ ] **Step 3: Verify** — tsc/lint/test/build/e2e green. Captures: front, facing the sun, minimum pitch. Expected: olive base → golden tips; large dry/lush patches; base darkening that softens with distance (far field not black); tips glowing at backlight; no white fresnel wash. If overall too dark/bright, tune `diffuseStrength`/`ambientStrength` defaults in `GRASS_DEFAULTS` (and the leva ranges follow). No console errors.

- [ ] **Step 4: No commit.**

---

### Task 6: Far ring, cross-fade, ground in grass colour

**Files:**
- Modify: `src/grass/grass.tsx`, `src/scene/ground.tsx`

**Interfaces:**
- Consumes: `groundAlbedoNode` (Task 5), `GRASS_RING_LIST`.

- [ ] **Step 1: Mount both rings** — in `src/grass/grass.tsx` replace the `ACTIVE_RINGS` filter with `const ACTIVE_RINGS = GRASS_RING_LIST` (and drop the comment about Task 6).

- [ ] **Step 1b: Density width compensation (spec §3)** — in `bladeVaryings` (`src/grass/grass-material.ts`), thinned areas use wider blades so coverage stays even:
```ts
const MIN_COMPENSATED_DENSITY = 0.25
// …after `root` is defined:
const fromPlayer = root.xz.sub(playerPosition.xz)
const ringDistance = max(abs(fromPlayer.x), abs(fromPlayer.y))
const densityCompensation = inverseSqrt(max(ringDensityNode(ringDistance, state.ring), MIN_COMPENSATED_DENSITY))
// …and multiply `width` by densityCompensation.
```
Imports: `inverseSqrt` from `three/tsl`, `playerPosition` from `../lib/shared-uniforms`, `ringDensityNode` from `./grass-nodes`.

- [ ] **Step 2: Ground node material** — in `src/scene/ground.tsx`:
```tsx
import { positionWorld, texture, uv, dot, vec3, mix, float } from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { groundAlbedoNode } from '../grass/grass-color'

const THATCH_DETAIL_MIN = 0.8
const THATCH_DETAIL_MAX = 1.2
const LUMA = vec3(0.299, 0.587, 0.114)

function createGroundMaterial(thatch: THREE.Texture): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 })
  // Same albedo as the grass field; the thatch texture only adds detail.
  const detail = mix(float(THATCH_DETAIL_MIN), float(THATCH_DETAIL_MAX), dot(texture(thatch, uv()).rgb, LUMA))
  material.colorNode = groundAlbedoNode(positionWorld.xz).mul(detail)
  material.envMapIntensity = 0
  return material
}
```
In `Ground()`: `const material = useMemo(() => createGroundMaterial(thatch), [thatch])`, add `material.dispose()` to the cleanup, and render `<mesh geometry={geometry} material={material} receiveShadow castShadow={false} />` (remove the JSX `<meshStandardMaterial>` child and its comment). Keep `thatch.repeat` as is.

- [ ] **Step 3: Verify** — tsc/lint/test/build/e2e green. Captures: run 9 s (`Shift+W`), look at a far ridge, face the sun. Expected: field reads continuous to the horizon (far ring + ground colour); no visible ring seam at 12–15 m; no floating tufts on ridges; no grass past the ground edge (walk/teleport not needed — the mask is unit-tested). Run `pnpm e2e -- e2e/perf.spec.ts` and note fps.

- [ ] **Step 4: No commit.**

---

### Task 7: Remove old grass, perf pass, captures, README

**Files:**
- Delete: `src/scene/grass.tsx`, `src/scene/grass-material.ts`, `src/scene/grass-patch.ts`, `src/scene/grass-patch.test.ts`, `public/cloud.jpg`
- Modify: `e2e/smoke.spec.ts` (asset-failure tests abort the HDR instead of `cloud.jpg`), `e2e/capture.spec.ts`, `README.md`

- [ ] **Step 1: Delete and re-point the asset-failure tests**

Delete the files above. In `e2e/smoke.spec.ts` change both `page.route('**/cloud.jpg', …)` calls to `page.route('**/hdri/*.hdr', (route) => route.abort())`. Then:
```bash
grep -rn "scene/grass\|grass-patch\|cloud.jpg" src e2e
```
Expected: no output.

- [ ] **Step 2: Grass captures** — append to `e2e/capture.spec.ts`:
```ts
test('@capture grass views for visual review', async ({ page }) => {
  await page.goto('/')
  await page.locator('.curtain').waitFor({ state: 'detached', timeout: 60_000 })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/grass-front.png` })

  await page.keyboard.down('KeyJ')
  await page.waitForTimeout(1300)
  await page.keyboard.up('KeyJ')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/grass-backlit.png` })

  await page.keyboard.down('KeyI')
  await page.waitForTimeout(1500)
  await page.keyboard.up('KeyI')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/grass-closeup.png` })

  await page.keyboard.down('ShiftLeft')
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(9000)
  await page.keyboard.up('KeyW')
  await page.keyboard.up('ShiftLeft')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/grass-walk.png` })
})
```
Run `pnpm capture`; review all four against the success criteria (volume up close, no floating/edge, continuous far field, gust bands, golden backlit tips).

- [ ] **Step 3: TRAA check (Review Focus 5)** — in the dev server, turn quickly with `J`/`L` and pitch with `I`/`K`; look for ghost trails behind thin blades. If visible, set the `post › antiAliasing` leva default to `'smaa'` in `src/renderer/render-pipeline.tsx` and note it in the README.

- [ ] **Step 4: Performance** — `pnpm e2e -- e2e/perf.spec.ts`. If < 55 fps, apply in order, re-measuring each time: far `spacing` 0.18 → 0.22; near `halfExtent` 15 → 12 (keep `RING_OVERLAP` and the far ring's fades consistent); near `segments` 6 → 5. Layout tests must stay green after any change.

- [ ] **Step 5: README** — replace the grass description in "Layout" with `src/grass/` (compute-driven blades: two LOD rings on a world-anchored grid, Voronoi clumps, noise wind, translucency; ground shares the grass albedo) and add the measured fps.

- [ ] **Step 6: Final verification** — `pnpm lint && pnpm test && npx tsc -b && pnpm build && pnpm e2e` all green; `git status --short`; no commit.
