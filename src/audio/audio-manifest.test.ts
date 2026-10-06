/// <reference types="node" />
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AUDIO_MANIFEST, FOOTSTEP_KEYS } from './audio-manifest'

const PUBLIC_DIR = join(process.cwd(), 'public')
const MIN_SAMPLE_BYTES = 1000

describe('audio manifest', () => {
  it('has several one-shot footstep samples', () => {
    expect(FOOTSTEP_KEYS.length).toBeGreaterThanOrEqual(4)
    for (const key of FOOTSTEP_KEYS) expect(AUDIO_MANIFEST[key].loop).toBe(false)
  })

  it('points every entry at a non-empty file in public/', () => {
    for (const entry of Object.values(AUDIO_MANIFEST)) {
      const path = join(PUBLIC_DIR, entry.src)
      expect(existsSync(path)).toBe(true)
      expect(statSync(path).size).toBeGreaterThan(MIN_SAMPLE_BYTES)
    }
  })
})
