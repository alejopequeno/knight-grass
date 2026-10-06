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
  { id: 'follow', trigger: 'immediate', banner: 'PLAINS OF THE FALLEN', line: 'Follow us.' },
  {
    id: 'fabroos',
    trigger: 'arrive',
    waypoint: { x: 6, z: 38 },
    line: 'Here lies Sir Fabroos.',
    reply: 'He shielded me until the end.',
  },
  {
    id: 'oath',
    trigger: 'arrive',
    waypoint: { x: -6, z: 80 },
    banner: 'HILL OF THE OATH',
    line: 'Do you remember the oath?',
    reply: 'To protect those who cannot raise a sword.',
  },
  {
    id: 'standard',
    trigger: 'arrive',
    waypoint: { x: 4, z: 120 },
    line: 'Our banner still flies.',
    reply: 'Then this is not over.',
  },
]

// Grass is cut around each prop so it reads from afar (radius in metres).
const PROP_CLEARING_RADIUS: Readonly<Record<string, number>> = { fabroos: 4, oath: 5, standard: 3.5 }

export const STORY_CLEARINGS = STORY_SCRIPT.flatMap((beat) =>
  beat.waypoint && PROP_CLEARING_RADIUS[beat.id] !== undefined
    ? [{ x: beat.waypoint.x, z: beat.waypoint.z, radius: PROP_CLEARING_RADIUS[beat.id] }]
    : [],
)
