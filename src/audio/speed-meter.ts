// Exponential smoothing rate (1/s) for the measured ground speed.
const SPEED_SMOOTHING = 8
const MIN_DELTA_S = 0.0001

export type SpeedMeter = {
  /** Feed the current ground position; returns the smoothed speed (m/s). */
  update: (x: number, z: number, deltaSeconds: number) => number
}

// Physics steps at a fixed rate while frames render faster, so raw
// per-frame speed alternates between 0 and a spike; smoothing recovers it.
export function createSpeedMeter(): SpeedMeter {
  let previous: { x: number; z: number } | null = null
  let smoothed = 0
  return {
    update: (x, z, deltaSeconds) => {
      const delta = Math.max(deltaSeconds, MIN_DELTA_S)
      const raw = previous ? Math.hypot(x - previous.x, z - previous.z) / delta : 0
      previous = { x, z }
      smoothed += (raw - smoothed) * (1 - Math.exp(-SPEED_SMOOTHING * delta))
      return smoothed
    },
  }
}
