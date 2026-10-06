import type { PaladinState } from './paladin-animator'

// Builds a complete per-state record with full type safety: adding a state
// to PALADIN_STATES makes this literal fail to compile until it is handled.
export function mapPaladinStates<T>(build: (state: PaladinState) => T): Record<PaladinState, T> {
  return {
    idle: build('idle'),
    idle2: build('idle2'),
    walk: build('walk'),
    run: build('run'),
    strafeLeft: build('strafeLeft'),
    strafeRight: build('strafeRight'),
    jump: build('jump'),
    attack: build('attack'),
    block: build('block'),
  }
}
