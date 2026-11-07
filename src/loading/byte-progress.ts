export type ByteSample = {
  loaded: number
  /** 0 when the size is unknown (no Content-Length yet, or ever). */
  total: number
  settled: boolean
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function fractionOf(sample: ByteSample): number {
  if (sample.settled) return 1
  if (sample.total <= 0) return 0
  return Math.min(sample.loaded / sample.total, 1)
}

/**
 * Overall load fraction (0..1), weighted by file size. A file whose size is
 * still unknown weighs as much as the average known file, so it neither
 * vanishes from the bar nor dominates it.
 */
export function byteProgress(samples: readonly ByteSample[]): number {
  if (samples.length === 0) return 1
  const knownTotals = samples.map((sample) => sample.total).filter((total) => total > 0)
  const fallbackWeight = knownTotals.length > 0 ? sum(knownTotals) / knownTotals.length : 1
  const weights = samples.map((sample) => (sample.total > 0 ? sample.total : fallbackWeight))
  const weighted = samples.map((sample, index) => fractionOf(sample) * weights[index])
  return sum(weighted) / sum(weights)
}
