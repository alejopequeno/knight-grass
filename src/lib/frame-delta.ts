// After a hidden tab, R3F can report a multi-second delta; simulations that
// integrate velocity would jump. Cap it to a few frames' worth.
export const MAX_FRAME_DELTA_S = 0.1

export function clampFrameDelta(delta: number): number {
  if (!Number.isFinite(delta) || delta < 0) return 0
  return Math.min(delta, MAX_FRAME_DELTA_S)
}
