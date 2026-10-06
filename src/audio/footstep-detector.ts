export type FootThresholds = {
  /** Height above the foot's baseline (m) under which it counts as planted. */
  plantAbove: number
  /** Height above the baseline it must rise past before another plant fires. */
  liftAbove: number
  /** How fast the baseline drifts up when the foot stays high (m/s). */
  baselineRisePerSecond: number
}

export type FootTracker = {
  /** Feed the foot's current height; returns true on the frame it lands. */
  update: (height: number, deltaSeconds: number) => boolean
}

// The ankle's planted height changes with gait and slope, so landings are
// detected relative to an adaptive baseline (the recent lowest height, slowly
// rising). Hysteresis between plant and lift heights stops jitter from
// double-firing; a foot that starts planted must lift before it can fire.
export function createFootTracker({ plantAbove, liftAbove, baselineRisePerSecond }: FootThresholds): FootTracker {
  let baseline = Number.POSITIVE_INFINITY
  let lifted = false
  return {
    update: (height, deltaSeconds) => {
      baseline = Math.min(height, baseline + baselineRisePerSecond * deltaSeconds)
      const above = height - baseline
      if (above > liftAbove) {
        lifted = true
        return false
      }
      if (lifted && above < plantAbove) {
        lifted = false
        return true
      }
      return false
    },
  }
}

export type StepGate = {
  /** Returns true if a step at `timeSeconds` may sound (and records it). */
  tryStep: (timeSeconds: number) => boolean
}

// Real cadence never puts two plants closer than ~0.35 s; anything faster is
// an animation blend artefact and would sound like a double step.
export function createStepGate(minIntervalSeconds: number): StepGate {
  let lastStep = Number.NEGATIVE_INFINITY
  return {
    tryStep: (timeSeconds) => {
      if (timeSeconds - lastStep < minIntervalSeconds) return false
      lastStep = timeSeconds
      return true
    },
  }
}
