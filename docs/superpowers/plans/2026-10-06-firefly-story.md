# Firefly Story (lettra) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A short guided story: fireflies gather into the shape of a Spanish phrase that lights up as lettra MSDF text, the paladin answers with a diegetic scrambling subtitle, zone banners wipe in on the horizon, and between beats the fireflies form a trail to the next waypoint.

**Architecture:** A pure `story-machine` (state + timing, no three/React) is stepped every frame by `story-director`, which turns its pure `storyPresentation` output into lettra uniforms, firefly targets/mode and an `aria-live` mirror. Fireflies gain a CPU-written `targets` storage buffer (vec4: xyz + weight) that the existing compute follows when weighted. Glyph target points come from lettra's CPU `layout()` plus the atlas decoded to `ImageData`.

**Tech Stack:** three 0.185 (`three/webgpu`, `three/tsl`), lettra 0.2 (`lettra`, `lettra/three`), @react-three/fiber 9, vitest 5 (jsdom), @playwright/test, msdf-bmfont-xml (dev-time bake), fontTools (static instance), Blender 5.1 via the MCP addon socket (port 9876).

**Spec:** `docs/superpowers/specs/2026-10-06-firefly-story-design.md`

## Global Constraints

- **No git commits.** Everything stays local; replace commit steps with `git status --short`.
- Story copy in Spanish, exactly as the spec table; code, identifiers and comments in English.
- Font: Cinzel (OFL), static instance, baked `-s 64 -r 8 -p 2 -t msdf --smart-size`, single atlas page, charset latin-es (ASCII printable + `áéíóúüñÁÉÍÓÚÜÑ¿¡—–“”‘’`).
- `three` / `@types/three` 0.185.x (lettra peer).
- Every canvas text mirrored to an `aria-live="polite"` region; `prefers-reduced-motion` → no scramble, shorter wipes.
- `E` / `Enter` advance (single fire, never while a control has focus — same rule as `Space`).
- TypeScript strict, no `any`, no unsafe `as`, kebab-case files, no magic numbers, React Compiler rules (module-level TSL uniforms, refs end in `Ref`).
- 60 fps at dpr 1.5 plugged in; every task ends with `pnpm lint && pnpm test && npx tsc -b && pnpm build` (+ `pnpm e2e` for runtime tasks).

## Review Focus

1. **Player walks away mid-beat** — the line/reply still finish and the trail re-points to the waypoint. Test: `story-machine` keeps advancing phases by time regardless of position (Task 2).
2. **Player reaches a later waypoint first (skips one)** — only the current beat's waypoint triggers; others are inert. Test: `story-machine` "ignores waypoints of future beats" (Task 2).
3. **Mashing E/Enter** — skips at most the current hold; never skips a beat that hasn't been triggered. Test: `story-machine` advance cases (Task 2).
4. **Phrase characters missing from the baked atlas** — rendered as `?` silently. Test: script charset validation against the baked JSON (Task 3).
5. **Trail to a waypoint farther than the firefly wrap radius** — fireflies following targets must not wrap back around the player. Check: Task 5 visual capture of the trail to beat 1 (40 m).

---

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `public/fonts/cinzel.json`, `public/fonts/cinzel.png`, `scripts/fonts/charset-latin-es.txt` | Baked font | 1 |
| `src/story/story-script.ts` (+ `story-script.test.ts`) | Beats as data + charset validation | 2, 3 |
| `src/story/story-machine.ts` (+test) | Pure state machine + `storyPresentation` | 2 |
| `src/text/text-assets.ts` | Font + atlas loading (`use()`), atlas ImageData | 3 |
| `src/text/glyph-points.ts` (+test) | Points inside glyphs from layout + sampler | 4 |
| `src/text/story-texts.tsx` | Firefly line, paladin reply, zone banner meshes | 3 |
| `src/atmosphere/firefly-targets.ts` | Targets buffer + mode/weights, CPU writers | 5 |
| `src/atmosphere/fireflies.tsx` | Compute follows targets; count 800 | 5 |
| `src/story/story-director.tsx` | Runs machine, drives texts/fireflies/live region | 6 |
| `src/story/story-live-region.tsx` | `aria-live` mirror | 6 |
| `src/controls/use-keyboard.ts` | `advancePressed` (E / Enter) | 6 |
| `scripts/blender/build-props.py`, `scripts/blender/send.py`, `public/models/props/*.glb` | Props via Blender socket | 7 |
| `src/story/story-props.tsx` | Props + marker glow on terrain | 7 |
| `e2e/story.spec.ts` | Live region + advance | 6 |

---

### Task 1: Upgrade three to 0.185, add lettra, bake Cinzel

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`
- Create: `scripts/fonts/charset-latin-es.txt`, `public/fonts/cinzel.json`, `public/fonts/cinzel.png`

- [ ] **Step 1: Upgrade and verify the existing app** — Run: `pnpm add three@0.185.1 lettra@0.2.0 && pnpm add -D @types/three@0.185.4`, then `pnpm lint && pnpm test && npx tsc -b && pnpm build && pnpm e2e`. Expected: all green (91 unit, 7 e2e, ~120 fps plugged in). If TSL types changed, fix call sites with the minimal typed change and record a ledger ruling per file. Then `pnpm capture` and compare `test-artifacts/grass-front.png` against the pre-upgrade look (no visual regressions).

- [ ] **Step 2: Charset** — `scripts/fonts/charset-latin-es.txt` contains, on one line, every printable ASCII char (space through `~`) followed by `áéíóúüñÁÉÍÓÚÜÑ¿¡—–“”‘’`. Generate it:
```bash
mkdir -p scripts/fonts
python3 -c "print(''.join(chr(c) for c in range(32,127)) + 'áéíóúüñÁÉÍÓÚÜÑ¿¡—–“”‘’', end='')" > scripts/fonts/charset-latin-es.txt
```

- [ ] **Step 3: Static Cinzel** (variable fonts lose kerning in the bake):
```bash
mkdir -p .font-work && cd .font-work
curl -fsSL -o cinzel-variable.ttf "https://github.com/google/fonts/raw/main/ofl/cinzel/Cinzel%5Bwght%5D.ttf"
python3 -m fontTools.varLib.instancer cinzel-variable.ttf wght=500 -o cinzel.ttf
```
Add `.font-work/` to `.gitignore`.

- [ ] **Step 4: Bake**
```bash
cd .font-work
npx -y -p msdf-bmfont-xml msdf-bmfont -f json -i ../scripts/fonts/charset-latin-es.txt -s 64 -r 8 -p 2 -t msdf --smart-size cinzel.ttf
mkdir -p ../public/fonts && cp cinzel.json ../public/fonts/cinzel.json && cp cinzel.png ../public/fonts/cinzel.png
python3 -c "import json;d=json.load(open('../public/fonts/cinzel.json'));print('pages',len(d['pages']),'chars',len(d['chars']),'kernings',len(d.get('kernings',[])))"
```
Expected: `pages 1`, `chars` ≥ 110, `kernings` > 0. If pages > 1, add `-m 1024,1024` (or 2048) and re-bake. If the CLI fails on this machine, use https://msdf-font-generator.leomouraire.com with the same settings and record a ruling.

- [ ] **Step 5: Verify + no commit** — lint/test/tsc/build green; `git status --short`.

---

### Task 2: Story script + pure state machine

**Files:**
- Create: `src/story/story-script.ts`, `src/story/story-machine.ts`, `src/story/story-machine.test.ts`

**Interfaces:**
- Produces:
  - `type StoryBeat = { id: string; trigger: 'immediate' | 'arrive'; waypoint?: { x: number; z: number }; banner?: string; line: string; reply?: string }`
  - `STORY_SCRIPT: readonly StoryBeat[]`
  - `type StoryPhase = 'waiting' | 'gathering' | 'line' | 'dissolving' | 'pause' | 'reply' | 'replyOut' | 'guiding' | 'finale' | 'done'`
  - `type StoryState = { beatIndex: number; phase: StoryPhase; phaseTime: number; beatTime: number }`
  - `type StoryInput = { playerX: number; playerZ: number; delta: number; advance: boolean }`
  - `STORY_TIMING` (seconds: `gather 2.2, lineHold 3.5, dissolve 1.2, pause 0.6, replyHold 3.8, replyOut 0.8, finale 5, bannerIn 2, bannerHold 3, bannerOut 2`), `TRIGGER_RADIUS = 4`
  - `createStoryState(): StoryState`, `stepStory(state, input, script?): StoryState`
  - `type StoryPresentation = { fireflyMode: 'free' | 'form' | 'trail' | 'rise'; line: string | null; lineWipeIn: number; lineWipeOut: number; reply: string | null; replyReveal: number; replyOpacity: number; banner: string | null; bannerWipeIn: number; bannerWipeOut: number; guideTarget: { x: number; z: number } | null }`
  - `storyPresentation(state, script?): StoryPresentation`

- [ ] **Step 1: Script** — `src/story/story-script.ts`:
```ts
export type Waypoint = { x: number; z: number }

export type StoryBeat = {
  id: string
  /** 'immediate' starts as soon as the previous beat ends (or on load). */
  trigger: 'immediate' | 'arrive'
  /** Where an 'arrive' beat triggers, and where the previous beat's trail points. */
  waypoint?: Waypoint
  banner?: string
  line: string
  reply?: string
}

export const STORY_SCRIPT: readonly StoryBeat[] = [
  { id: 'return', trigger: 'immediate', banner: 'LLANURA DE LOS CAÍDOS', line: 'Volviste.', reply: 'No creí que quedara alguien.' },
  { id: 'follow', trigger: 'immediate', line: 'Síguenos.' },
  { id: 'aldric', trigger: 'arrive', waypoint: { x: 6, z: 38 }, line: 'Aquí cayó Aldric.', reply: 'Me cubrió hasta el final.' },
  {
    id: 'oath',
    trigger: 'arrive',
    waypoint: { x: -6, z: 80 },
    banner: 'LA COLINA DEL JURAMENTO',
    line: '¿Recuerdas el juramento?',
    reply: 'Proteger a quien no puede alzar la espada.',
  },
  { id: 'sword', trigger: 'arrive', waypoint: { x: 4, z: 120 }, line: 'Tu espada te espera.', reply: 'Entonces esto no ha terminado.' },
]
```

- [ ] **Step 2: Failing machine tests** — `src/story/story-machine.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { STORY_SCRIPT } from './story-script'
import { createStoryState, STORY_TIMING, stepStory, storyPresentation, TRIGGER_RADIUS, type StoryInput, type StoryState } from './story-machine'

const FRAME = 1 / 60
const AT_SPAWN = { playerX: 0, playerZ: 0 }

function run(state: StoryState, seconds: number, input: Partial<StoryInput> = {}): StoryState {
  let s = state
  for (let t = 0; t < seconds; t += FRAME) s = stepStory(s, { ...AT_SPAWN, delta: FRAME, advance: false, ...input })
  return s
}

function runUntilPhase(state: StoryState, phase: StoryState['phase'], input: Partial<StoryInput> = {}, limit = 60): StoryState {
  let s = state
  for (let t = 0; t < limit && s.phase !== phase; t += FRAME) s = stepStory(s, { ...AT_SPAWN, delta: FRAME, advance: false, ...input })
  return s
}

describe('stepStory', () => {
  it('starts the first beat immediately with the fireflies gathering', () => {
    const s = stepStory(createStoryState(), { ...AT_SPAWN, delta: FRAME, advance: false })
    expect(s.beatIndex).toBe(0)
    expect(s.phase).toBe('gathering')
  })

  it('walks a beat through line → dissolving → pause → reply → replyOut by time', () => {
    const s = run(createStoryState(), STORY_TIMING.gather + 0.05)
    expect(s.phase).toBe('line')
    expect(run(s, STORY_TIMING.lineHold).phase).toBe('dissolving')
    const replying = runUntilPhase(s, 'reply')
    expect(replying.phase).toBe('reply')
  })

  it('advance cuts the current hold short but never skips a beat', () => {
    let s = runUntilPhase(createStoryState(), 'line')
    s = stepStory(s, { ...AT_SPAWN, delta: FRAME, advance: true })
    expect(s.phase).toBe('dissolving')
    expect(s.beatIndex).toBe(0)
    const mashed = stepStory(s, { ...AT_SPAWN, delta: FRAME, advance: true })
    expect(mashed.beatIndex).toBe(0)
  })

  it('chains immediate beats, then guides until the waypoint is reached', () => {
    const guiding = runUntilPhase(createStoryState(), 'guiding', {}, 120)
    expect(STORY_SCRIPT[guiding.beatIndex + 1].trigger).toBe('arrive')
    expect(run(guiding, 10).phase).toBe('guiding')
    const target = STORY_SCRIPT[guiding.beatIndex + 1].waypoint
    if (!target) throw new Error('next beat has no waypoint')
    const arrived = stepStory(guiding, { playerX: target.x, playerZ: target.z - TRIGGER_RADIUS + 0.5, delta: FRAME, advance: false })
    expect(arrived.beatIndex).toBe(guiding.beatIndex + 1)
    expect(arrived.phase).toBe('gathering')
  })

  it('ignores waypoints of future beats', () => {
    const guiding = runUntilPhase(createStoryState(), 'guiding', {}, 120)
    const far = STORY_SCRIPT[STORY_SCRIPT.length - 1].waypoint
    if (!far) throw new Error('last beat has no waypoint')
    expect(stepStory(guiding, { playerX: far.x, playerZ: far.z, delta: FRAME, advance: false }).phase).toBe('guiding')
  })

  it('keeps advancing phases by time while the player walks away', () => {
    const s = run(createStoryState(), STORY_TIMING.gather + 0.05, { playerX: 50, playerZ: -50 })
    expect(s.phase).toBe('line')
  })

  it('ends with a finale and then done', () => {
    let s = createStoryState()
    for (let i = 0; i < 4000 && s.phase !== 'done'; i++) {
      const next = STORY_SCRIPT[s.beatIndex + 1]?.waypoint
      s = stepStory(s, { playerX: next?.x ?? 0, playerZ: next?.z ?? 0, delta: 0.05, advance: true })
    }
    expect(s.phase).toBe('done')
  })
})

describe('storyPresentation', () => {
  it('shows the line text with the fireflies forming it', () => {
    const p = storyPresentation(runUntilPhase(createStoryState(), 'line'))
    expect(p.line).toBe(STORY_SCRIPT[0].line)
    expect(p.fireflyMode).toBe('form')
  })

  it('shows the reply only during the reply phases', () => {
    const p = storyPresentation(runUntilPhase(createStoryState(), 'reply'))
    expect(p.reply).toBe(STORY_SCRIPT[0].reply)
  })

  it('points the trail at the next waypoint while guiding', () => {
    const guiding = runUntilPhase(createStoryState(), 'guiding', {}, 120)
    expect(storyPresentation(guiding).guideTarget).toEqual(STORY_SCRIPT[guiding.beatIndex + 1].waypoint)
    expect(storyPresentation(guiding).fireflyMode).toBe('trail')
  })

  it('wipes the banner in at the start of a beat that has one', () => {
    const p = storyPresentation(run(createStoryState(), 1))
    expect(p.banner).toBe(STORY_SCRIPT[0].banner)
    expect(p.bannerWipeIn).toBeGreaterThan(0)
  })
})
```
Run `pnpm test -- src/story` — FAIL (module missing).

- [ ] **Step 3: Implement** — `src/story/story-machine.ts`:
```ts
import { STORY_SCRIPT, type StoryBeat, type Waypoint } from './story-script'

export const TRIGGER_RADIUS = 4

export const STORY_TIMING = {
  gather: 2.2,
  lineHold: 3.5,
  dissolve: 1.2,
  pause: 0.6,
  replyHold: 3.8,
  replyOut: 0.8,
  finale: 5,
  bannerIn: 2,
  bannerHold: 3,
  bannerOut: 2,
} as const

export type StoryPhase =
  | 'waiting'
  | 'gathering'
  | 'line'
  | 'dissolving'
  | 'pause'
  | 'reply'
  | 'replyOut'
  | 'guiding'
  | 'finale'
  | 'done'

export type StoryState = { beatIndex: number; phase: StoryPhase; phaseTime: number; beatTime: number }
export type StoryInput = { playerX: number; playerZ: number; delta: number; advance: boolean }

export function createStoryState(): StoryState {
  return { beatIndex: 0, phase: 'waiting', phaseTime: 0, beatTime: 0 }
}

function enter(state: StoryState, phase: StoryPhase): StoryState {
  return { ...state, phase, phaseTime: 0 }
}

function startBeat(beatIndex: number): StoryState {
  return { beatIndex, phase: 'gathering', phaseTime: 0, beatTime: 0 }
}

function reached(waypoint: Waypoint | undefined, input: StoryInput): boolean {
  if (!waypoint) return true
  return Math.hypot(input.playerX - waypoint.x, input.playerZ - waypoint.z) <= TRIGGER_RADIUS
}

// After a beat ends: chain an immediate beat, guide toward the next waypoint, or finish.
function afterBeat(state: StoryState, script: readonly StoryBeat[]): StoryState {
  const next = script[state.beatIndex + 1]
  if (!next) return enter(state, 'finale')
  if (next.trigger === 'immediate') return startBeat(state.beatIndex + 1)
  return enter(state, 'guiding')
}

export function stepStory(state: StoryState, input: StoryInput, script: readonly StoryBeat[] = STORY_SCRIPT): StoryState {
  const s = { ...state, phaseTime: state.phaseTime + input.delta, beatTime: state.beatTime + input.delta }
  const beat = script[s.beatIndex]
  const t = STORY_TIMING
  switch (s.phase) {
    case 'waiting':
      return beat && (beat.trigger === 'immediate' || reached(beat.waypoint, input)) ? startBeat(s.beatIndex) : s
    case 'gathering':
      return s.phaseTime >= t.gather ? enter(s, 'line') : s
    case 'line':
      return input.advance || s.phaseTime >= t.lineHold ? enter(s, 'dissolving') : s
    case 'dissolving':
      return s.phaseTime >= t.dissolve ? enter(s, beat?.reply ? 'pause' : 'replyOut') : s
    case 'pause':
      return s.phaseTime >= t.pause ? enter(s, 'reply') : s
    case 'reply':
      return input.advance || s.phaseTime >= t.replyHold ? enter(s, 'replyOut') : s
    case 'replyOut':
      return s.phaseTime >= (beat?.reply ? t.replyOut : 0) ? afterBeat(s, script) : s
    case 'guiding': {
      const next = script[s.beatIndex + 1]
      return reached(next?.waypoint, input) ? startBeat(s.beatIndex + 1) : s
    }
    case 'finale':
      return s.phaseTime >= t.finale ? enter(s, 'done') : s
    case 'done':
      return s
  }
}

export type FireflyMode = 'free' | 'form' | 'trail' | 'rise'

export type StoryPresentation = {
  fireflyMode: FireflyMode
  line: string | null
  lineWipeIn: number
  lineWipeOut: number
  reply: string | null
  /** 0 → fully scrambled, 1 → decoded. */
  replyReveal: number
  replyOpacity: number
  banner: string | null
  bannerWipeIn: number
  bannerWipeOut: number
  guideTarget: Waypoint | null
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const LINE_WIPE_IN_S = 1.2
const REPLY_DECODE_S = 1.6

export function storyPresentation(state: StoryState, script: readonly StoryBeat[] = STORY_SCRIPT): StoryPresentation {
  const beat = script[state.beatIndex]
  const t = STORY_TIMING
  const { phase, phaseTime } = state
  const lineVisible = phase === 'line' || phase === 'dissolving'
  const replyVisible = phase === 'reply' || phase === 'replyOut'
  const bannerEnd = t.bannerIn + t.bannerHold + t.bannerOut
  const bannerActive = Boolean(beat?.banner) && state.beatTime < bannerEnd && phase !== 'waiting'
  const nextWaypoint = script[state.beatIndex + 1]?.waypoint ?? null

  const fireflyMode: FireflyMode =
    phase === 'gathering' || phase === 'line'
      ? 'form'
      : phase === 'guiding'
        ? 'trail'
        : phase === 'finale' || phase === 'done'
          ? 'rise'
          : 'free'

  return {
    fireflyMode,
    line: lineVisible ? (beat?.line ?? null) : null,
    lineWipeIn: phase === 'line' ? clamp01(phaseTime / LINE_WIPE_IN_S) : lineVisible ? 1 : 0,
    lineWipeOut: phase === 'dissolving' ? clamp01(phaseTime / t.dissolve) : 0,
    reply: replyVisible ? (beat?.reply ?? null) : null,
    replyReveal: phase === 'reply' ? clamp01(phaseTime / REPLY_DECODE_S) : replyVisible ? 1 : 0,
    replyOpacity: phase === 'replyOut' ? 1 - clamp01(phaseTime / t.replyOut) : replyVisible ? 1 : 0,
    banner: bannerActive ? (beat?.banner ?? null) : null,
    bannerWipeIn: bannerActive ? clamp01(state.beatTime / t.bannerIn) : 0,
    bannerWipeOut: bannerActive ? clamp01((state.beatTime - t.bannerIn - t.bannerHold) / t.bannerOut) : 0,
    guideTarget: phase === 'guiding' ? nextWaypoint : null,
  }
}
```
Run — PASS. If a test exposes a timing edge (e.g. `replyOut` of a no-reply beat), fix the machine, not the test.

- [ ] **Step 4: Verify + no commit.**

---

### Task 3: Font assets, charset validation, lettra text meshes

**Files:**
- Create: `src/story/story-script.test.ts`, `src/text/text-assets.ts`, `src/text/story-texts.tsx`
- Modify: `src/experience.tsx` (temporary preview mount, removed in Task 6)

**Interfaces:**
- Consumes: `STORY_SCRIPT`, `storyPresentation` types (Task 2), lettra.
- Produces: `loadStoryFont(): Promise<StoryFont>` where `type StoryFont = { font: MSDFFont; map: Texture; atlas: ImageData }` (memoized promise `storyFontPromise`); `useStoryFont(): StoryFont`; `<StoryTexts presentationRef={RefObject<StoryPresentation>} lineAnchorRef={RefObject<Matrix4>} />` rendering the three texts; module uniforms are owned by each lettra handle.

- [ ] **Step 1: Failing charset test (Review Focus 4)** — `src/story/story-script.test.ts`:
```ts
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GROUND_HALF_EXTENT } from '../grass/grass-layout'
import { STORY_SCRIPT } from './story-script'

type BakedFont = { chars: { char?: string; id: number }[] }
const baked: BakedFont = JSON.parse(readFileSync(join(process.cwd(), 'public/fonts/cinzel.json'), 'utf8'))
const available = new Set(baked.chars.map((c) => c.char ?? String.fromCharCode(c.id)))

describe('story script', () => {
  it('only uses characters present in the baked Cinzel atlas', () => {
    const texts = STORY_SCRIPT.flatMap((beat) => [beat.line, beat.reply ?? '', beat.banner ?? ''])
    const missing = [...new Set(texts.join(''))].filter((char) => !available.has(char))
    expect(missing).toEqual([])
  })

  it('keeps every waypoint on the ground, away from the edge', () => {
    const MARGIN = 20
    for (const beat of STORY_SCRIPT) {
      if (!beat.waypoint) continue
      expect(Math.abs(beat.waypoint.x)).toBeLessThan(GROUND_HALF_EXTENT - MARGIN)
      expect(Math.abs(beat.waypoint.z)).toBeLessThan(GROUND_HALF_EXTENT - MARGIN)
    }
  })
})
```
Run — expect PASS if the bake included the charset (this test guards future copy edits; if it fails, re-bake with the missing chars, never change copy silently).

- [ ] **Step 2: Font assets** — `src/text/text-assets.ts`:
```ts
import { use } from 'react'
import { loadFont, loadFontTexture } from 'lettra/three'
import type { MSDFFont } from 'lettra'
import type { Texture } from 'three/webgpu'

const FONT_JSON_URL = '/fonts/cinzel.json'
const FONT_ATLAS_URL = '/fonts/cinzel.png'

export type StoryFont = { font: MSDFFont; map: Texture; atlas: ImageData }

async function decodeAtlas(url: string): Promise<ImageData> {
  const blob = await (await fetch(url)).blob()
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('[text] 2D context unavailable for atlas decode')
  context.drawImage(bitmap, 0, 0)
  return context.getImageData(0, 0, bitmap.width, bitmap.height)
}

// One fetch per asset for the whole session; rejections are logged here and
// still reach use() so the scene error boundary shows the load error.
export const storyFontPromise: Promise<StoryFont> = Promise.all([
  loadFont(FONT_JSON_URL),
  loadFontTexture(FONT_ATLAS_URL),
  decodeAtlas(FONT_ATLAS_URL),
]).then(([font, map, atlas]) => ({ font, map, atlas }))
storyFontPromise.catch((error: unknown) => console.error('[text] story font failed to load:', error))

export function useStoryFont(): StoryFont {
  return use(storyFontPromise)
}
```
(If `loadFont` returns `MSDFFont` via the `lettra/three` re-export, keep the type import from `lettra`.)

- [ ] **Step 3: Text meshes** — `src/text/story-texts.tsx`:
```tsx
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, type RefObject } from 'react'
import { createText, scramble, wipe } from 'lettra/three'
import { Color, Vector3, type Matrix4 } from 'three/webgpu'
import { prefersReducedMotion } from '../lib/reduced-motion'
import type { StoryPresentation } from '../story/story-machine'
import { useStoryFont } from './text-assets'

const LINE_COLOR = new Color('#ffd58a').multiplyScalar(2.2) // HDR → bloom
const REPLY_COLOR = '#e9e4d8'
const BANNER_COLOR = '#f1e6c8'
const LINE_SIZE = 0.55 // world metres per em
const REPLY_SIZE = 0.16
const BANNER_SIZE = 3.2
const REPLY_HEAD_OFFSET = 2.25
const BANNER_DISTANCE = 45
const BANNER_HEIGHT = 9
const REPLY_SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÑ'

type Props = {
  presentationRef: RefObject<StoryPresentation>
  /** World transform of the firefly line (set by the director at gather start). */
  lineAnchorRef: RefObject<Matrix4>
  /** Paladin root position (feet). */
  headRef: RefObject<Vector3>
}

export function StoryTexts({ presentationRef, lineAnchorRef, headRef }: Props) {
  const { font, map } = useStoryFont()
  const reducedMotion = prefersReducedMotion()

  const line = useMemo(
    () => createText({ font, map, text: ' ', geometry: { scale: LINE_SIZE / 64 }, layout: { align: 'center' }, material: { fill: LINE_COLOR, effect: wipe({ band: 0.25 }) } }),
    [font, map],
  )
  const reply = useMemo(
    () => createText({ font, map, text: ' ', geometry: { scale: REPLY_SIZE / 64 }, layout: { align: 'center', maxWidth: 1400 }, material: { fill: REPLY_COLOR, effect: scramble({ font, chars: REPLY_SCRAMBLE_CHARS }) } }),
    [font, map],
  )
  const banner = useMemo(
    () => createText({ font, map, text: ' ', geometry: { scale: BANNER_SIZE / 64 }, layout: { align: 'center' }, material: { fill: BANNER_COLOR, effect: wipe({ band: 0.4 }) } }),
    [font, map],
  )

  useEffect(() => {
    banner.mesh.material.fog = false
    return () => {
      line.dispose({ map: false })
      reply.dispose({ map: false })
      banner.dispose({ map: false })
    }
  }, [line, reply, banner])

  useFrame(({ camera }) => {
    const p = presentationRef.current
    // Firefly line: placed where the fireflies gathered.
    line.mesh.visible = p.line !== null
    if (p.line !== null) {
      if (line.layout.glyphs.length === 0 || line.mesh.userData.text !== p.line) {
        line.setText(p.line)
        line.mesh.userData.text = p.line
      }
      line.mesh.matrixAutoUpdate = false
      line.mesh.matrix.copy(lineAnchorRef.current)
      line.uniforms.wipeIn.value = p.lineWipeIn
      line.uniforms.wipeOut.value = p.lineWipeOut
    }
    // Paladin reply: billboard above the head.
    reply.mesh.visible = p.reply !== null
    if (p.reply !== null) {
      if (reply.mesh.userData.text !== p.reply) {
        reply.setText(p.reply)
        reply.mesh.userData.text = p.reply
      }
      reply.mesh.position.copy(headRef.current).y += REPLY_HEAD_OFFSET
      reply.mesh.quaternion.copy(camera.quaternion)
      reply.uniforms.scramble.value = reducedMotion ? 0 : 1 - p.replyReveal
      reply.uniforms.opacity.value = p.replyOpacity
    }
    // Zone banner: far ahead of the camera, above the horizon.
    banner.mesh.visible = p.banner !== null
    if (p.banner !== null) {
      if (banner.mesh.userData.text !== p.banner) {
        banner.setText(p.banner)
        banner.mesh.userData.text = p.banner
      }
      const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize()
      banner.mesh.position.copy(camera.position).addScaledVector(forward, BANNER_DISTANCE)
      banner.mesh.position.y += BANNER_HEIGHT
      banner.mesh.lookAt(camera.position.x, banner.mesh.position.y, camera.position.z)
      banner.uniforms.wipeIn.value = p.bannerWipeIn
      banner.uniforms.wipeOut.value = p.bannerWipeOut
    }
  })

  return (
    <>
      <primitive object={line.mesh} />
      <primitive object={reply.mesh} />
      <primitive object={banner.mesh} />
    </>
  )
}
```
Notes for the implementer: lettra geometry `scale` is world units per layout px; the baked size is 64 px, so `size / 64` gives metres per em. Mutating `line.mesh` etc. inside `useFrame` is allowed (callback scope), but if the React Compiler lint flags mutation of `useMemo` values, move the three handles into a `useRef` initialised in an effect and read them from the ref. `userData.text` avoids re-laying out every frame; replace with a ref-held string if lint prefers.

- [ ] **Step 4: Preview** — temporarily mount in `src/experience.tsx` inside `<Suspense>` with a fixed presentation (`line: 'Volviste.'`, wipes at 1/0, `reply: 'No creí que quedara alguien.'`, `replyReveal: 1`, `banner: 'LLANURA DE LOS CAÍDOS'`, `bannerWipeIn: 1`) and a line anchor 6 m in front of spawn at 1.7 m height. `pnpm capture` and check all three are crisp, readable and in Cinzel; the line blooms. Remove the preview after the check (Task 6 mounts the real director).

- [ ] **Step 5: Verify + no commit.**

---

### Task 4: Glyph target points

**Files:**
- Create: `src/text/glyph-points.ts`, `src/text/glyph-points.test.ts`

**Interfaces:**
- Consumes: `layout` from `lettra`, `MSDFFont`.
- Produces: `type GlyphSampler = (u: number, v: number) => boolean` (true when the atlas texel at uv is inside a glyph); `createAtlasSampler(atlas: ImageData): GlyphSampler`; `sampleGlyphPoints(layout: LayoutResult, sampler: GlyphSampler, count: number, random: RandomSource, scale: number): Float32Array` (xy pairs, ink-centred, y-up, world units — same frame as lettra's `buildTextGeometry` with `anchor: 'ink-center'`).

- [ ] **Step 1: Failing tests** — `src/text/glyph-points.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { LayoutResult } from 'lettra'
import { createSeededRandom } from '../lib/seeded-random'
import { sampleGlyphPoints, type GlyphSampler } from './glyph-points'

// One 100×100 px glyph whose atlas rect is u,v ∈ [0, 0.5]; ink is its left half.
const LAYOUT: LayoutResult = {
  glyphs: [{ char: 'A', x: 0, y: 0, w: 100, h: 100, u0: 0, v0: 0, u1: 0.5, v1: 0.5, index: 0, line: 0 }],
  width: 100,
  height: 100,
  inkOrigin: { x: 0, y: 0 },
  metrics: { fontSize: 64, lineCount: 1, lineHeight: 80, baseline: 60, metricWidth: 100, metricHeight: 80 },
}
const LEFT_HALF: GlyphSampler = (u) => u < 0.25
const SCALE = 0.01

describe('sampleGlyphPoints', () => {
  it('returns exactly the requested number of points', () => {
    expect(sampleGlyphPoints(LAYOUT, LEFT_HALF, 50, createSeededRandom(1), SCALE)).toHaveLength(100)
  })

  it('only places points on ink', () => {
    const points = sampleGlyphPoints(LAYOUT, LEFT_HALF, 200, createSeededRandom(2), SCALE)
    for (let i = 0; i < points.length; i += 2) expect(points[i]).toBeLessThanOrEqual(0)
  })

  it('centres the ink box on the origin like lettra geometry', () => {
    const points = sampleGlyphPoints(LAYOUT, () => true, 400, createSeededRandom(3), SCALE)
    let sumX = 0
    let sumY = 0
    for (let i = 0; i < points.length; i += 2) {
      sumX += points[i]
      sumY += points[i + 1]
    }
    expect(Math.abs(sumX / 400)).toBeLessThan(0.05)
    expect(Math.abs(sumY / 400)).toBeLessThan(0.05)
  })

  it('is deterministic for a seed', () => {
    const a = sampleGlyphPoints(LAYOUT, LEFT_HALF, 30, createSeededRandom(9), SCALE)
    const b = sampleGlyphPoints(LAYOUT, LEFT_HALF, 30, createSeededRandom(9), SCALE)
    expect(Array.from(a)).toEqual(Array.from(b))
  })
})
```
Run — FAIL.

- [ ] **Step 2: Implement** — `src/text/glyph-points.ts`:
```ts
import type { LayoutResult } from 'lettra'
import type { RandomSource } from '../lib/seeded-random'

export type GlyphSampler = (u: number, v: number) => boolean

const MSDF_INSIDE = 0.5
const CHANNEL_MAX = 255
const MAX_ATTEMPTS_PER_POINT = 40

function median(a: number, b: number, c: number): number {
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c))
}

// MSDF texel is inside the glyph when the median of RGB passes 0.5.
export function createAtlasSampler(atlas: ImageData): GlyphSampler {
  return (u, v) => {
    const x = Math.min(atlas.width - 1, Math.max(0, Math.floor(u * atlas.width)))
    const y = Math.min(atlas.height - 1, Math.max(0, Math.floor(v * atlas.height)))
    const i = (y * atlas.width + x) * 4
    return median(atlas.data[i], atlas.data[i + 1], atlas.data[i + 2]) / CHANNEL_MAX > MSDF_INSIDE
  }
}

// `count` points inside the glyph ink, as (x, y) pairs in world units,
// ink-centred and y-up — the same frame as lettra's buildTextGeometry.
export function sampleGlyphPoints(
  layout: LayoutResult,
  sampler: GlyphSampler,
  count: number,
  random: RandomSource,
  scale: number,
): Float32Array {
  const points = new Float32Array(count * 2)
  const glyphs = layout.glyphs.filter((g) => g.w > 0 && g.h > 0)
  if (glyphs.length === 0) return points
  const areas = glyphs.map((g) => g.w * g.h)
  const totalArea = areas.reduce((sum, area) => sum + area, 0)
  const centerX = layout.inkOrigin.x + layout.width / 2
  const centerY = layout.inkOrigin.y + layout.height / 2

  for (let p = 0; p < count; p++) {
    let pick = random() * totalArea
    let g = glyphs[0]
    for (let k = 0; k < glyphs.length; k++) {
      pick -= areas[k]
      if (pick <= 0) {
        g = glyphs[k]
        break
      }
    }
    let lx = 0.5
    let ly = 0.5
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_POINT; attempt++) {
      lx = random()
      ly = random()
      if (sampler(g.u0 + lx * (g.u1 - g.u0), g.v0 + ly * (g.v1 - g.v0))) break
    }
    points[p * 2] = (g.x + lx * g.w - centerX) * scale
    points[p * 2 + 1] = (centerY - (g.y + ly * g.h)) * scale
  }
  return points
}
```
Run — PASS. (The "only on ink" test relies on rejection sampling succeeding; with half-ink glyphs 40 attempts never all miss in practice.)

- [ ] **Step 3: Verify + no commit.**

---

### Task 5: Fireflies follow targets (form / trail / rise)

**Files:**
- Create: `src/atmosphere/firefly-targets.ts`
- Modify: `src/atmosphere/fireflies.tsx`

**Interfaces:**
- Produces: `FIREFLY_COUNT = 800`; `fireflyTargets` (`instancedArray(FIREFLY_COUNT, 'vec4')`, xyz target + w weight 0..1); `writeFormTargets(points: Float32Array, anchor: Matrix4): void` (first `points.length / 2` fireflies weighted 1, rest 0); `writeTrailTargets(from: Vector3, to: Vector3, time: number): void` (first `TRAIL_COUNT = 160` along the path, gently bobbing; rest 0); `writeRiseTargets(center: Vector3, time: number): void` (all weighted, spiralling up); `clearTargets(): void`.

- [ ] **Step 1: Targets module** — `src/atmosphere/firefly-targets.ts`:
```ts
import { instancedArray } from 'three/tsl'
import { Vector3, type Matrix4, type StorageInstancedBufferAttribute } from 'three/webgpu'
import { terrainHeight } from '../lib/terrain'

export const FIREFLY_COUNT = 800
export const TRAIL_COUNT = 160
const TRAIL_HEIGHT = 1.6
const TRAIL_BOB = 0.25
const TRAIL_SWAY = 0.35
const RISE_RADIUS = 3
const RISE_SPEED = 1.5
const RISE_MAX = 60
const VEC4 = 4

export const fireflyTargets = instancedArray(FIREFLY_COUNT, 'vec4')

function targetArray(): Float32Array {
  const attribute: StorageInstancedBufferAttribute = fireflyTargets.value
  if (!(attribute.array instanceof Float32Array)) throw new Error('[fireflies] targets must be Float32Array')
  return attribute.array
}

function commit(): void {
  fireflyTargets.value.needsUpdate = true
}

export function clearTargets(): void {
  targetArray().fill(0)
  commit()
}

const scratch = new Vector3()

export function writeFormTargets(points: Float32Array, anchor: Matrix4): void {
  const array = targetArray()
  array.fill(0)
  const used = Math.min(FIREFLY_COUNT, points.length / 2)
  for (let i = 0; i < used; i++) {
    scratch.set(points[i * 2], points[i * 2 + 1], 0).applyMatrix4(anchor)
    array.set([scratch.x, scratch.y, scratch.z, 1], i * VEC4)
  }
  commit()
}

export function writeTrailTargets(from: Vector3, to: Vector3, time: number): void {
  const array = targetArray()
  array.fill(0)
  for (let i = 0; i < TRAIL_COUNT; i++) {
    const t = (i + 0.5) / TRAIL_COUNT
    const x = from.x + (to.x - from.x) * t + Math.sin(time * 0.8 + i) * TRAIL_SWAY
    const z = from.z + (to.z - from.z) * t + Math.cos(time * 0.7 + i * 1.3) * TRAIL_SWAY
    const y = terrainHeight(x, z) + TRAIL_HEIGHT + Math.sin(time * 1.4 + i * 0.6) * TRAIL_BOB
    array.set([x, y, z, 1], i * VEC4)
  }
  commit()
}

export function writeRiseTargets(center: Vector3, time: number): void {
  const array = targetArray()
  for (let i = 0; i < FIREFLY_COUNT; i++) {
    const angle = (i / FIREFLY_COUNT) * Math.PI * 2 + time * 0.3
    const radius = RISE_RADIUS + (i % 7)
    const height = Math.min(RISE_MAX, (time * RISE_SPEED + (i % 40)) * 1.2)
    array.set([center.x + Math.cos(angle) * radius, center.y + height, center.z + Math.sin(angle) * radius, 1], i * VEC4)
  }
  commit()
}
```
If `StorageInstancedBufferAttribute` is not exported as a type from `three/webgpu` in 0.185, read `.array` through an `instanceof Float32Array` guard on `fireflyTargets.value.array` without the annotation.

- [ ] **Step 2: Compute follows targets** — in `src/atmosphere/fireflies.tsx`: import `FIREFLY_COUNT, fireflyTargets` from `./firefly-targets` and delete the local `FIREFLY_COUNT`. Add constant `const TARGET_PULL = 3.5`. Replace the end of `updateCompute` (from `const banded = …`) with:
```ts
  const banded = vec3(xz.x, clamp(p.y, ground.add(MIN_HEIGHT), ground.add(MAX_HEIGHT)), xz.y)
  // Story targets: weighted fireflies fly to their target (no wrap, no band).
  const target = fireflyTargets.element(instanceIndex)
  const pull = oneMinus(exp(frameDelta.mul(TARGET_PULL).negate()))
  const chasing = mix(p, target.xyz, pull)
  const settled = select(target.w.greaterThan(0.5), chasing, banded)
  // Never fly through the paladin: slide out of every body capsule.
  p.assign(settled.add(capsuleVolumePushNode(settled, BODY_CLEARANCE)))
```
Imports: add `exp, mix, oneMinus, select` from `three/tsl`. The free-drift `drift` still applies before (fine: gives life while gathering).

- [ ] **Step 3: Visual check (Review Focus 5)** — temporary debug: in a throwaway effect, `writeTrailTargets(spawn, waypoint(6, 38), 0)` every frame and `writeFormTargets` with a grid of points 6 m ahead. `pnpm capture`: trail visible reaching ~40 m without wrapping back; form grid filled. Remove the debug.

- [ ] **Step 4: Verify + no commit.**

---

### Task 6: Director, live region, E/Enter advance, e2e

**Files:**
- Create: `src/story/story-director.tsx`, `src/story/story-live-region.tsx`, `e2e/story.spec.ts`
- Modify: `src/controls/use-keyboard.ts`, `src/experience.tsx`, `src/index.css`

**Interfaces:**
- Consumes: Tasks 2–5; `characterRef` (`CharacterHandle`), `movementRef` (`advancePressed`).
- Produces: `<StoryDirector characterRef movementRef onAnnounce />`, `<StoryLiveRegion messages />`, `MovementState.advancePressed`.

- [ ] **Step 1: Keyboard** — in `use-keyboard.ts` add `advancePressed: boolean` to `MovementState` and `createMovementState`, extend `PressAction` with `'advancePressed'`, and add `KeyE: 'advancePressed'`, `Enter: 'advancePressed'`, `NumpadEnter: 'advancePressed'` to `PRESS_KEYS`. Add to `use-keyboard.test.ts`:
```ts
  it('advances the story with E or Enter, but not on a focused button', () => {
    const state = createMovementState()
    detach = attachKeyboardControls(state, window)
    press(document.body, 'KeyE')
    expect(state.advancePressed).toBe(true)
    state.advancePressed = false
    const button = document.createElement('button')
    document.body.append(button)
    press(button, 'Enter')
    expect(state.advancePressed).toBe(false)
  })
```
Run — FAIL first, then PASS after the key map change. Add `<li><kbd>E</kbd>/<kbd>Enter</kbd> next line</li>` to the HUD.

- [ ] **Step 2: Live region** — `src/story/story-live-region.tsx`:
```tsx
export function StoryLiveRegion({ message }: { message: string }) {
  return (
    <div className="visually-hidden" role="status" aria-live="polite" data-testid="story-live">
      {message}
    </div>
  )
}
```
`src/index.css`:
```css
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 3: Director** — `src/story/story-director.tsx`:
```tsx
import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import { layout } from 'lettra'
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu'
import { clearTargets, FIREFLY_COUNT, writeFormTargets, writeRiseTargets, writeTrailTargets } from '../atmosphere/firefly-targets'
import type { MovementState } from '../controls/use-keyboard'
import { createSeededRandom } from '../lib/seeded-random'
import { terrainHeight } from '../lib/terrain'
import type { CharacterHandle } from '../scene/character'
import { createAtlasSampler, sampleGlyphPoints } from '../text/glyph-points'
import { StoryTexts } from '../text/story-texts'
import { useStoryFont } from '../text/text-assets'
import { createStoryState, stepStory, storyPresentation, type StoryPresentation, type StoryState } from './story-machine'

const LINE_DISTANCE = 6
const LINE_HEIGHT = 1.7
const LINE_SIZE = 0.55
const BAKED_FONT_SIZE = 64
const GLYPH_POINT_SEED = 77

type Props = {
  characterRef: RefObject<CharacterHandle | null>
  movementRef: RefObject<MovementState>
  onAnnounce: (message: string) => void
}

export function StoryDirector({ characterRef, movementRef, onAnnounce }: Props) {
  const { font, atlas } = useStoryFont()
  const stateRef = useRef<StoryState>(createStoryState())
  const presentationRef = useRef<StoryPresentation>(storyPresentation(stateRef.current))
  const lineAnchorRef = useRef(new Matrix4())
  const headRef = useRef(new Vector3())
  const samplerRef = useRef(createAtlasSampler(atlas))
  const lastAnnouncedRef = useRef('')

  useFrame(({ camera, clock }, delta) => {
    const character = characterRef.current
    if (!character) return
    const player = character.getPosition()
    headRef.current.copy(player)
    const movement = movementRef.current
    const advance = movement.advancePressed
    movement.advancePressed = false

    const previous = stateRef.current
    const next = stepStory(previous, { playerX: player.x, playerZ: player.z, delta, advance })
    stateRef.current = next
    const presentation = storyPresentation(next)
    presentationRef.current = presentation

    // A new beat starts gathering: place the phrase and send fireflies to its letters.
    const startedGathering = next.phase === 'gathering' && (previous.phase !== 'gathering' || previous.beatIndex !== next.beatIndex)
    if (startedGathering) {
      const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize()
      const position = player.clone().addScaledVector(forward, LINE_DISTANCE)
      position.y = terrainHeight(position.x, position.z) + LINE_HEIGHT
      const facing = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), forward.clone().negate())
      lineAnchorRef.current.compose(position, facing, new Vector3(1, 1, 1))
      const text = storyPresentationLine(next)
      const result = layout(font, text, { align: 'center' })
      const points = sampleGlyphPoints(result, samplerRef.current, FIREFLY_COUNT, createSeededRandom(GLYPH_POINT_SEED), LINE_SIZE / BAKED_FONT_SIZE)
      writeFormTargets(points, lineAnchorRef.current)
    }

    if (presentation.fireflyMode === 'trail' && presentation.guideTarget) {
      writeTrailTargets(player, new Vector3(presentation.guideTarget.x, 0, presentation.guideTarget.z), clock.elapsedTime)
    } else if (presentation.fireflyMode === 'rise') {
      writeRiseTargets(player, next.phaseTime)
    } else if (presentation.fireflyMode === 'free' && previous.phase !== next.phase) {
      clearTargets()
    }

    const announcement = presentation.line ?? presentation.reply ?? presentation.banner ?? ''
    if (announcement && announcement !== lastAnnouncedRef.current) {
      lastAnnouncedRef.current = announcement
      onAnnounce(presentation.reply === announcement ? `Paladín: ${announcement}` : presentation.banner === announcement ? announcement : `Luciérnagas: ${announcement}`)
    }
  })

  return <StoryTexts presentationRef={presentationRef} lineAnchorRef={lineAnchorRef} headRef={headRef} />
}

function storyPresentationLine(state: StoryState): string {
  return storyPresentation({ ...state, phase: 'line' }).line ?? ''
}
```
Notes: `writeTrailTargets` every frame is ~2.5 KB upload — fine. If the React Compiler flags `movement.advancePressed = false`, the prop name already ends in `Ref`; mutation goes through `movementRef.current` which is allowed. Banner announcement should fire once per beat at banner start (current logic announces whichever text is newest; acceptable).

- [ ] **Step 4: Mount** — `src/experience.tsx`: hold `const [storyMessage, setStoryMessage] = useState('')`; inside `<Suspense>` after `<Grass />`: `<StoryDirector characterRef={characterRef} movementRef={movementRef} onAnnounce={setStoryMessage} />`; after `<Curtain />`: `<StoryLiveRegion message={storyMessage} />`. Remove the Task 3 preview.

- [ ] **Step 5: E2E** — `e2e/story.spec.ts`:
```ts
import { expect, test } from '@playwright/test'

test('story speaks through the live region and E advances it', async ({ page }) => {
  await page.goto('/')
  await page.locator('.curtain').waitFor({ state: 'detached', timeout: 60_000 })
  const live = page.getByTestId('story-live')
  await expect(live).toContainText('Volviste.', { timeout: 15_000 })
  await page.keyboard.press('KeyE')
  await expect(live).toContainText('Paladín: No creí que quedara alguien.', { timeout: 10_000 })
})
```
Run `pnpm e2e` — PASS (8 tests).

- [ ] **Step 6: Visual check** — `pnpm capture` plus a throwaway script that waits 2.5 s (fireflies gathered + line), 7 s (reply), then walks toward waypoint 1 capturing the trail. Check readability, bloom, and that the reply scrambles then decodes.

- [ ] **Step 7: Verify + no commit.**

---

### Task 7: Props from Blender + waypoint markers

**Files:**
- Create: `scripts/blender/send.py`, `scripts/blender/build-props.py`, `public/models/props/shield.glb`, `public/models/props/stones.glb`, `public/models/props/sword.glb`, `src/story/story-props.tsx`
- Modify: `src/experience.tsx`

- [ ] **Step 1: Socket client** — `scripts/blender/send.py`:
```python
"""Send a Python file to the running Blender MCP addon (port 9876) and print the reply."""
import json
import socket
import sys

HOST, PORT, TIMEOUT_S = "localhost", 9876, 120

code = open(sys.argv[1], encoding="utf-8").read()
with socket.create_connection((HOST, PORT), timeout=TIMEOUT_S) as conn:
    conn.sendall(json.dumps({"type": "execute_code", "params": {"code": code}}).encode())
    buffer = b""
    while True:
        chunk = conn.recv(65536)
        if not chunk:
            break
        buffer += chunk
        try:
            print(json.dumps(json.loads(buffer), indent=2)[:2000])
            break
        except ValueError:
            continue
```

- [ ] **Step 2: Props script** — `scripts/blender/build-props.py` (runs inside Blender; `OUT_DIR` absolute):
```python
import bpy, math, os, random

OUT_DIR = "/Users/alejopequeno/Documents/Projects/Labs/walk-grass/public/models/props"
os.makedirs(OUT_DIR, exist_ok=True)
random.seed(7)

def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

def material(name, rgb, roughness=0.8, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return m

def export(name):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT_DIR, f"{name}.glb"), use_selection=True, export_apply=True)

STEEL = (0.32, 0.33, 0.35)
WOOD = (0.22, 0.14, 0.08)
STONE = (0.30, 0.30, 0.28)
CLOTH = (0.35, 0.06, 0.05)

# Broken shield: kite-ish plate tilted into the ground, with a boss.
clear()
bpy.ops.mesh.primitive_cylinder_add(vertices=7, radius=0.45, depth=0.05, location=(0, 0, 0.32), rotation=(math.radians(75), 0, math.radians(12)))
shield = bpy.context.object
shield.scale = (1, 1.35, 1)
shield.data.materials.append(material("shield", WOOD))
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.09, location=(0, -0.05, 0.36))
bpy.context.object.data.materials.append(material("boss", STEEL, 0.4, 0.8))
export("shield")

# Circle of broken standing stones.
clear()
stone_mat = material("stone", STONE, 0.95)
for i in range(7):
    angle = i / 7 * math.tau
    height = random.uniform(0.6, 1.6)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(math.cos(angle) * 2.6, math.sin(angle) * 2.6, height / 2))
    stone = bpy.context.object
    stone.scale = (0.35, 0.25, height)
    stone.rotation_euler = (random.uniform(-0.12, 0.12), random.uniform(-0.12, 0.12), angle + random.uniform(-0.3, 0.3))
    bevel = stone.modifiers.new("bevel", "BEVEL")
    bevel.width = 0.06
    stone.data.materials.append(stone_mat)
export("stones")

# Sword driven into a rock.
clear()
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.7, location=(0, 0, 0.25))
rock = bpy.context.object
rock.scale = (1.2, 1, 0.6)
rock.data.materials.append(material("rock", STONE, 0.95))
steel = material("blade", STEEL, 0.3, 0.9)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1.15))
blade = bpy.context.object
blade.scale = (0.07, 0.015, 1.1)
blade.data.materials.append(steel)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1.72))
bpy.context.object.scale = (0.38, 0.05, 0.05)
bpy.context.object.data.materials.append(steel)
bpy.ops.mesh.primitive_cylinder_add(radius=0.03, depth=0.32, location=(0, 0, 1.92))
bpy.context.object.data.materials.append(material("grip", CLOTH, 0.9))
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.05, location=(0, 0, 2.1))
bpy.context.object.data.materials.append(steel)
export("sword")
print("props exported to", OUT_DIR)
```
Run: `python3 scripts/blender/send.py scripts/blender/build-props.py`. Expected: success response; `ls -la public/models/props` lists three non-empty `.glb`. (Blender Z-up exports to glTF Y-up automatically.) The script clears the open Blender scene — tell the user before running.

- [ ] **Step 3: Props + markers** — `src/story/story-props.tsx`:
```tsx
import { useLoader } from '@react-three/fiber'
import { useMemo } from 'react'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { AdditiveBlending, Sprite, SpriteNodeMaterial } from 'three/webgpu'
import { float, length, smoothstep, sin, time, uv, vec4, color } from 'three/tsl'
import { terrainHeight } from '../lib/terrain'
import { STORY_SCRIPT } from './story-script'

const PROP_URLS: Record<string, string> = {
  aldric: '/models/props/shield.glb',
  oath: '/models/props/stones.glb',
  sword: '/models/props/sword.glb',
}
const MARKER_HEIGHT = 2.4
const MARKER_SIZE = 3
const MARKER_COLOR = '#ffd58a'
const MARKER_INTENSITY = 1.6

function createMarker(): Sprite {
  const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending })
  const glow = smoothstep(0.5, 0, length(uv().sub(0.5)))
  const breathe = sin(time.mul(1.2)).mul(0.25).add(0.75)
  material.colorNode = vec4(color(MARKER_COLOR).mul(MARKER_INTENSITY).mul(breathe).mul(glow), glow)
  material.scaleNode = float(MARKER_SIZE)
  return new Sprite(material)
}

export function StoryProps() {
  const beats = STORY_SCRIPT.filter((beat) => beat.waypoint && PROP_URLS[beat.id])
  const gltfs = useLoader(GLTFLoader, beats.map((beat) => PROP_URLS[beat.id]))
  const markers = useMemo(() => beats.map(() => createMarker()), [beats.length])

  return (
    <>
      {beats.map((beat, index) => {
        const waypoint = beat.waypoint
        if (!waypoint) return null
        const ground = terrainHeight(waypoint.x, waypoint.z)
        return (
          <group key={beat.id} position={[waypoint.x, ground, waypoint.z]}>
            <primitive object={gltfs[index].scene} />
            <primitive object={markers[index]} position={[0, MARKER_HEIGHT, 0]} />
          </group>
        )
      })}
    </>
  )
}
```
Fix the `useMemo` dependency lint by depending on `beats` defined at module scope (move the `beats` filter outside the component). Mount `<StoryProps />` in `src/experience.tsx` inside `<Suspense>`.

- [ ] **Step 4: Verify** — lint/test/tsc/build/e2e green; capture at each waypoint (walk there via a throwaway script or set spawn temporarily); props sit on the ground, read as shield / stones / sword, markers visible from the previous beat.

- [ ] **Step 5: No commit.**

---

### Task 8: Pacing, reduced motion, captures, performance, README

**Files:**
- Modify: `e2e/capture.spec.ts`, `README.md`, `src/story/story-machine.ts` (timing tweaks only), `src/text/story-texts.tsx`

- [ ] **Step 1: Reduced motion** — `story-texts.tsx` already zeroes scramble under reduced motion; additionally scale line/banner wipe progress so they complete in half the time (`Math.min(1, value * 2)`) when `prefersReducedMotion()`; fireflies already stop pulsing via `motionScale`.

- [ ] **Step 2: Story captures** — append to `e2e/capture.spec.ts` a `@capture story beats` test: wait for curtain, screenshot at 1.5 s (gathering), 3.5 s (line), 8 s (reply), then hold `KeyW` toward waypoint 1 for 4 s and screenshot (trail). Review legibility and pacing; adjust `STORY_TIMING` if lines feel rushed (keep tests green).

- [ ] **Step 3: Performance** — `pnpm e2e -- e2e/perf.spec.ts` plugged in: ≥ 55 fps. If not: `FIREFLY_COUNT` 800 → 600, `TRAIL_COUNT` 160 → 120.

- [ ] **Step 4: README** — add a "Story" section: the guided story, controls (`E`/`Enter` next line), lettra + Cinzel bake recipe (`scripts/fonts`, `.font-work`), props via `scripts/blender/*` and the Blender MCP addon socket.

- [ ] **Step 5: Final verification** — `pnpm lint && pnpm test && npx tsc -b && pnpm build && pnpm e2e` all green; no commit; `git status --short`.
