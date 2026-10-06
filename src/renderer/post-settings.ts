export const DEFAULT_GRAIN = 0.12

// Animated grain is motion; drop it entirely for reduced-motion users.
export function grainIntensityFor(reducedMotion: boolean): number {
  return reducedMotion ? 0 : DEFAULT_GRAIN
}
