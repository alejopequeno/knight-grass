import { STORY_SCRIPT, type StoryBeat, type Waypoint } from './story-script'

export const TRIGGER_RADIUS = 4

export const STORY_TIMING = {
  lineHold: 3.5,
  dissolve: 1.2,
  pause: 0.6,
  replyHold: 3.8,
  replyOut: 0.8,
  finale: 5,
  bannerIn: 1.2,
  bannerHold: 1.6,
  bannerOut: 1,
} as const

export type StoryPhase =
  | 'waiting'
  | 'title'
  | 'line'
  | 'dissolving'
  | 'pause'
  | 'reply'
  | 'replyOut'
  | 'guiding'
  | 'finale'
  | 'done'

export type StoryState = { beatIndex: number; phase: StoryPhase; phaseTime: number }
export type StoryInput = { playerX: number; playerZ: number; delta: number }

export function createStoryState(): StoryState {
  return { beatIndex: 0, phase: 'waiting', phaseTime: 0 }
}

function enter(state: StoryState, phase: StoryPhase): StoryState {
  return { ...state, phase, phaseTime: 0 }
}

// A beat with a zone title shows it alone first; the line follows.
function startBeat(beatIndex: number, script: readonly StoryBeat[]): StoryState {
  const phase: StoryPhase = script[beatIndex]?.banner ? 'title' : 'line'
  return { beatIndex, phase, phaseTime: 0 }
}

const TITLE_DURATION = STORY_TIMING.bannerIn + STORY_TIMING.bannerHold + STORY_TIMING.bannerOut

function reached(waypoint: Waypoint | undefined, input: StoryInput): boolean {
  if (!waypoint) return true
  return Math.hypot(input.playerX - waypoint.x, input.playerZ - waypoint.z) <= TRIGGER_RADIUS
}

// After a beat ends: chain an immediate beat, guide toward the next waypoint, or finish.
function afterBeat(state: StoryState, script: readonly StoryBeat[]): StoryState {
  const next = script[state.beatIndex + 1]
  if (!next) return enter(state, 'finale')
  if (next.trigger === 'immediate') return startBeat(state.beatIndex + 1, script)
  return enter(state, 'guiding')
}

export function stepStory(state: StoryState, input: StoryInput, script: readonly StoryBeat[] = STORY_SCRIPT): StoryState {
  const s = { ...state, phaseTime: state.phaseTime + input.delta }
  const beat = script[s.beatIndex]
  const t = STORY_TIMING
  switch (s.phase) {
    case 'waiting':
      return beat && (beat.trigger === 'immediate' || reached(beat.waypoint, input)) ? startBeat(s.beatIndex, script) : s
    case 'title':
      return s.phaseTime >= TITLE_DURATION ? enter(s, 'line') : s
    case 'line':
      return s.phaseTime >= t.lineHold ? enter(s, 'dissolving') : s
    case 'dissolving':
      return s.phaseTime >= t.dissolve ? enter(s, beat?.reply ? 'pause' : 'replyOut') : s
    case 'pause':
      return s.phaseTime >= t.pause ? enter(s, 'reply') : s
    case 'reply':
      return s.phaseTime >= t.replyHold ? enter(s, 'replyOut') : s
    case 'replyOut':
      return s.phaseTime >= (beat?.reply ? t.replyOut : 0) ? afterBeat(s, script) : s
    case 'guiding': {
      const next = script[s.beatIndex + 1]
      return reached(next?.waypoint, input) ? startBeat(s.beatIndex + 1, script) : s
    }
    case 'finale':
      return s.phaseTime >= t.finale ? enter(s, 'done') : s
    case 'done':
      return s
  }
}

export type FireflyMode = 'free' | 'trail' | 'rise'

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
  /** Waypoint the camera frames while its beat plays (cinematic shot). */
  shot: Waypoint | null
  /** Seconds since the finale began; keeps growing through 'done'. */
  riseTime: number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const LINE_WIPE_IN_S = 1.2
const SHOT_PHASES: ReadonlySet<StoryPhase> = new Set(['title', 'line', 'dissolving', 'pause', 'reply', 'replyOut'])
const REPLY_DECODE_S = 1.6

export function storyPresentation(state: StoryState, script: readonly StoryBeat[] = STORY_SCRIPT): StoryPresentation {
  const beat = script[state.beatIndex]
  const t = STORY_TIMING
  const { phase, phaseTime } = state
  const lineVisible = phase === 'line' || phase === 'dissolving'
  const replyVisible = phase === 'reply' || phase === 'replyOut'
    const bannerActive = Boolean(beat?.banner) && phase === 'title'
  const nextWaypoint = script[state.beatIndex + 1]?.waypoint ?? null

  const fireflyMode: FireflyMode =
    phase === 'guiding'
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
    bannerWipeIn: bannerActive ? clamp01(phaseTime / t.bannerIn) : 0,
    bannerWipeOut: bannerActive ? clamp01((phaseTime - t.bannerIn - t.bannerHold) / t.bannerOut) : 0,
    guideTarget: phase === 'guiding' ? nextWaypoint : null,
    shot: beat?.waypoint && SHOT_PHASES.has(phase) ? beat.waypoint : null,
    riseTime: phase === 'finale' ? phaseTime : phase === 'done' ? t.finale + phaseTime : 0,
  }
}

// New screen-reader messages for this frame. `said` remembers what was
// already announced (per beat), so a banner still on screen between a line
// and its reply is never read twice.
export function storyAnnouncements(
  state: StoryState,
  presentation: StoryPresentation,
  said: Set<string>,
): string[] {
  const candidates: [kind: string, message: string | null][] = [
    ['banner', presentation.banner],
    ['line', presentation.line && `Luciérnagas: ${presentation.line}`],
    ['reply', presentation.reply && `Paladín: ${presentation.reply}`],
  ]
  const fresh: string[] = []
  for (const [kind, message] of candidates) {
    if (!message) continue
    const key = `${state.beatIndex}:${kind}`
    if (said.has(key)) continue
    said.add(key)
    fresh.push(message)
  }
  return fresh
}

// The player may move only when there is a path to follow (or nothing left
// to say, finale included): while the story talks, body and camera hold still.
const FREE_PHASES: ReadonlySet<StoryPhase> = new Set(['waiting', 'guiding', 'finale', 'done'])

export function isPlayerLocked(phase: StoryPhase): boolean {
  return !FREE_PHASES.has(phase)
}
