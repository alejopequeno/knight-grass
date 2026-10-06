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
