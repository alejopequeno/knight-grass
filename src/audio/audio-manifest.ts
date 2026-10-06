export const AUDIO_KEYS = {
  wind: 'wind',
} as const

type AudioEntry = { src: string; loop: boolean; volume: number }

// One-shot grass footsteps, sliced from a recorded walk loop. A random one
// plays on every detected foot plant.
export const FOOTSTEP_KEYS = ['step1', 'step2', 'step3', 'step4', 'step5', 'step6'] as const
export type FootstepKey = (typeof FOOTSTEP_KEYS)[number]

const FOOTSTEP_VOLUME = 0.8

const footstepEntries = Object.fromEntries(
  FOOTSTEP_KEYS.map((key, index) => [key, { src: `/sounds/steps/step-${index + 1}.wav`, loop: false, volume: FOOTSTEP_VOLUME }]),
)

export const AUDIO_MANIFEST: Record<string, AudioEntry> = {
  [AUDIO_KEYS.wind]: { src: '/sounds/wind.mp3', loop: true, volume: 0.45 },
  ...footstepEntries,
}
