import { describe, expect, it } from 'vitest'
import type { StoryBeat } from './story-script'
import {
  createStoryState,
  isPlayerLocked,
  STORY_TIMING,
  stepStory as stepWithScript,
  storyAnnouncements as announceWithScript,
  storyPresentation as presentWithScript,
  TRIGGER_RADIUS,
  type StoryInput,
  type StoryState,
} from './story-machine'

// Fixed fixture so editing the real copy never breaks the machine tests.
const STORY_SCRIPT: readonly StoryBeat[] = [
  { id: 'intro', trigger: 'immediate', banner: 'BANNER', line: 'First.', reply: 'Answer.' },
  { id: 'follow', trigger: 'immediate', line: 'Follow.' },
  { id: 'a', trigger: 'arrive', waypoint: { x: 6, z: 38 }, line: 'At A.', reply: 'Reply A.' },
  { id: 'b', trigger: 'arrive', waypoint: { x: 4, z: 120 }, line: 'At B.' },
]
const stepStory = (state: StoryState, input: StoryInput) => stepWithScript(state, input, STORY_SCRIPT)
const storyPresentation = (state: StoryState) => presentWithScript(state, STORY_SCRIPT)
const storyAnnouncements = (state: StoryState, p: ReturnType<typeof storyPresentation>, said: Set<string>) =>
  announceWithScript(state, p, said)

const FRAME = 1 / 60
const AT_SPAWN = { playerX: 0, playerZ: 0 }

function run(state: StoryState, seconds: number, input: Partial<StoryInput> = {}): StoryState {
  let s = state
  for (let t = 0; t < seconds; t += FRAME) s = stepStory(s, { ...AT_SPAWN, delta: FRAME, ...input })
  return s
}

function runUntilPhase(state: StoryState, phase: StoryState['phase'], input: Partial<StoryInput> = {}, limit = 60): StoryState {
  let s = state
  for (let t = 0; t < limit && s.phase !== phase; t += FRAME) s = stepStory(s, { ...AT_SPAWN, delta: FRAME, ...input })
  return s
}

describe('stepStory', () => {
  it('starts the first beat immediately, with its zone title first', () => {
    const s = stepStory(createStoryState(), { ...AT_SPAWN, delta: FRAME })
    expect(s.beatIndex).toBe(0)
    expect(s.phase).toBe('title')
  })

  it('walks a beat through line → dissolving → pause → reply → replyOut by time', () => {
    const s = runUntilPhase(createStoryState(), 'line')
    expect(s.phase).toBe('line')
    expect(run(s, STORY_TIMING.lineHold).phase).toBe('dissolving')
    const replying = runUntilPhase(s, 'reply')
    expect(replying.phase).toBe('reply')
  })

  it('chains immediate beats, then guides until the waypoint is reached', () => {
    const guiding = runUntilPhase(createStoryState(), 'guiding', {}, 120)
    expect(STORY_SCRIPT[guiding.beatIndex + 1].trigger).toBe('arrive')
    expect(run(guiding, 10).phase).toBe('guiding')
    const target = STORY_SCRIPT[guiding.beatIndex + 1].waypoint
    if (!target) throw new Error('next beat has no waypoint')
    const arrived = stepStory(guiding, { playerX: target.x, playerZ: target.z - TRIGGER_RADIUS + 0.5, delta: FRAME })
    expect(arrived.beatIndex).toBe(guiding.beatIndex + 1)
    expect(arrived.phase).toBe('line')
  })

  it('ignores waypoints of future beats', () => {
    const guiding = runUntilPhase(createStoryState(), 'guiding', {}, 120)
    const far = STORY_SCRIPT[STORY_SCRIPT.length - 1].waypoint
    if (!far) throw new Error('last beat has no waypoint')
    expect(stepStory(guiding, { playerX: far.x, playerZ: far.z, delta: FRAME }).phase).toBe('guiding')
  })

  it('keeps advancing phases by time while the player walks away', () => {
    const s = run(runUntilPhase(createStoryState(), 'line'), STORY_TIMING.lineHold + 0.05, { playerX: 50, playerZ: -50 })
    expect(s.phase).toBe('dissolving')
  })

  it('ends with a finale and then done', () => {
    let s = createStoryState()
    for (let i = 0; i < 4000 && s.phase !== 'done'; i++) {
      const next = STORY_SCRIPT[s.beatIndex + 1]?.waypoint
      s = stepStory(s, { playerX: next?.x ?? 0, playerZ: next?.z ?? 0, delta: 0.05 })
    }
    expect(s.phase).toBe('done')
  })
})

describe('storyPresentation', () => {
  it('shows the line text while the fireflies stay free', () => {
    const p = storyPresentation(runUntilPhase(createStoryState(), 'line'))
    expect(p.line).toBe(STORY_SCRIPT[0].line)
    expect(p.fireflyMode).toBe('free')
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

  it('never shows the zone title and the line at the same time', () => {
    let s = createStoryState()
    for (let i = 0; i < 1200; i++) {
      s = stepStory(s, { ...AT_SPAWN, delta: FRAME })
      const p = storyPresentation(s)
      expect(p.banner !== null && p.line !== null).toBe(false)
    }
  })
})

describe('finale', () => {
  it('keeps the rise clock moving forward from finale into done', () => {
    // Walk to each next waypoint until the story reaches its finale.
    const follow = (state: StoryState): StoryInput => {
      const next = STORY_SCRIPT[state.beatIndex + 1]?.waypoint
      return { playerX: next?.x ?? 0, playerZ: next?.z ?? 0, delta: FRAME }
    }
    let s = createStoryState()
    for (let i = 0; i < 20000 && s.phase !== 'finale'; i++) s = stepStory(s, follow(s))
    expect(s.phase).toBe('finale')
    let previous = -1
    for (let t = 0; t < STORY_TIMING.finale + 2; t += FRAME) {
      s = stepStory(s, follow(s))
      const rise = storyPresentation(s).riseTime
      expect(rise).toBeGreaterThanOrEqual(previous)
      previous = rise
    }
    expect(s.phase).toBe('done')
  })
})

describe('storyAnnouncements', () => {
  it('announces each banner, line and reply exactly once per beat', () => {
    let s = createStoryState()
    const said = new Set<string>()
    const heard: string[] = []
    for (let i = 0; i < 1200; i++) {
      s = stepStory(s, { ...AT_SPAWN, delta: FRAME })
      heard.push(...storyAnnouncements(s, storyPresentation(s), said))
    }
    expect(heard).toEqual(['BANNER', 'Fireflies: First.', 'Paladin: Answer.', 'Fireflies: Follow.'])
  })
})

describe('isPlayerLocked', () => {
  it('locks the player while the story is talking', () => {
    for (const phase of ['line', 'dissolving', 'pause', 'reply', 'replyOut'] as const) {
      expect(isPlayerLocked(phase)).toBe(true)
    }
  })

  it('frees the player when there is a path to follow or the story is over', () => {
    for (const phase of ['waiting', 'guiding', 'done'] as const) expect(isPlayerLocked(phase)).toBe(false)
  })

  it('frees the player as soon as the last reply fades, not after the finale', () => {
    expect(isPlayerLocked('finale')).toBe(false)
  })
})

describe('cinematic shot', () => {
  it('frames the waypoint while a waypoint beat is playing', () => {
    let s = createStoryState()
    for (let i = 0; i < 20000 && !(s.beatIndex === 2 && s.phase === 'line'); i++) {
      const next = STORY_SCRIPT[s.beatIndex + 1]?.waypoint
      s = stepStory(s, { playerX: next?.x ?? 6, playerZ: next?.z ?? 38, delta: FRAME })
    }
    expect(storyPresentation(s).shot).toEqual(STORY_SCRIPT[2].waypoint)
  })

  it('has no shot for beats without a waypoint or while guiding', () => {
    expect(storyPresentation(runUntilPhase(createStoryState(), 'line')).shot).toBeNull()
    expect(storyPresentation(runUntilPhase(createStoryState(), 'guiding', {}, 120)).shot).toBeNull()
  })
})
