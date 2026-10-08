import { useMemo } from 'react'
import { colliderFor, fieldPropInstances } from './field-props-layout'
import { ScatteredProps } from './scattered-props'

const FIELD_URL = '/models/props/field.glb'
// Bed each one into the ground; the scans have uneven bases.
const EMBED_DEPTH = 0.18

/**
 * Fallen trunks and erratic boulders in the field itself. These are the props
 * the player walks right past, so unlike the horizon set they cast and receive
 * shadows — a boulder with no shadow sitting a metre away reads as a sticker.
 */
export function FieldProps() {
  const instances = useMemo(() => fieldPropInstances(), [])
  return (
    <ScatteredProps
      url={FIELD_URL}
      instances={instances}
      colliderFor={colliderFor}
      embedDepth={EMBED_DEPTH}
      castShadow
      receiveShadow
    />
  )
}
