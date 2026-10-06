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
  { id: 'follow', trigger: 'immediate', banner: 'LLANURA DE LOS CAÍDOS', line: 'Síguenos.' },
  {
    id: 'fabroos',
    trigger: 'arrive',
    waypoint: { x: 6, z: 38 },
    line: 'Aquí yace Sir Fabroos.',
    reply: 'Me protegió hasta el final.',
  },
  {
    id: 'oath',
    trigger: 'arrive',
    waypoint: { x: -6, z: 80 },
    banner: 'COLINA DEL JURAMENTO',
    line: '¿Recuerdas el juramento?',
    reply: 'Proteger a quienes no pueden alzar una espada.',
  },
  {
    id: 'standard',
    trigger: 'arrive',
    waypoint: { x: 4, z: 120 },
    line: 'Nuestro estandarte aún flamea.',
    reply: 'Entonces esto no ha terminado.',
  },
]

// Grass is cut around each prop so it reads from afar (radius in metres).
const PROP_CLEARING_RADIUS: Readonly<Record<string, number>> = { fabroos: 4, oath: 5, standard: 3.5 }

export const STORY_CLEARINGS = STORY_SCRIPT.flatMap((beat) =>
  beat.waypoint && PROP_CLEARING_RADIUS[beat.id] !== undefined
    ? [{ x: beat.waypoint.x, z: beat.waypoint.z, radius: PROP_CLEARING_RADIUS[beat.id] }]
    : [],
)
