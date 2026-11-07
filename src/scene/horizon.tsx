import { useMemo } from 'react'
import { HORIZON_URL } from '../loading/asset-manifest'
import { colliderFor, horizonInstances } from './horizon-layout'
import { ScatteredProps } from './scattered-props'

// Sink each base so no silhouette hovers over a slope it straddles.
const EMBED_DEPTH = 0.3

/**
 * Dead trees and broken ruins on the far hills. They exist as shapes against
 * the blue hour, so they never cast or receive shadows.
 */
export function Horizon() {
  const instances = useMemo(() => horizonInstances(), [])
  return (
    <ScatteredProps
      url={HORIZON_URL}
      instances={instances}
      colliderFor={colliderFor}
      embedDepth={EMBED_DEPTH}
    />
  )
}
