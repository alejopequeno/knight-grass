import { useFrame } from '@react-three/fiber'
import { createText, type TextHandle } from 'lettra/three'
import { useEffect, useRef } from 'react'
import { Color, MeshBasicNodeMaterial, Object3D, Vector3 } from 'three/webgpu'
import { burning, type BurningEffect } from '../text/ember-edge'
import { useStoryFont } from '../text/text-assets'
import { epitaphReveal, fitScale } from './epitaph-fit'

/** Mesh the inscription is carved into. */
const HEADSTONE_NODE = 'headstone'
// The stone already has a cross and the name cut into it, and that carving
// occupies y 0.526 → 1.15 in headstone-local metres. This is the clear band
// left underneath it; writing over the carving stacks two inscriptions.
const PANEL = { width: 0.52, height: 0.34 }
const PANEL_CENTRE_Y = 0.33
// Stand the glyphs just off the stone face (local z = 0) so they never z-fight.
const PANEL_STANDOFF = 0.006

// Warm enough to read as light caught in the grooves, HDR so bloom finds it.
const EPITAPH_COLOR = new Color('#f3e2b4').multiplyScalar(1.7)
const EPITAPH_EMBER = new Color('#ff8a2a').multiplyScalar(3)
const EPITAPH_WIPE_BAND = 0.3

type Props = {
  /** The loaded tomb scene; the inscription mounts onto its headstone. */
  root: Object3D
  text: string
}

/**
 * The epitaph carved into Sir Fabroos' headstone. It is part of the world
 * rather than part of the story beat: always there, revealing as the player
 * walks close enough to read it, with the same burning wipe the fireflies use
 * so the carving reads as the order's own hand.
 */
export function TombEpitaph({ root, text }: Props) {
  const { font, map } = useStoryFont()
  const handleRef = useRef<TextHandle<BurningEffect> | null>(null)
  const worldPosition = useRef(new Vector3())

  useEffect(() => {
    const headstone = root.getObjectByName(HEADSTONE_NODE)
    if (!headstone) {
      console.error(`[epitaph] tomb has no '${HEADSTONE_NODE}' node to carve`)
      return
    }

    const handle = createText({
      font,
      map,
      text,
      layout: { align: 'center' },
      material: { fill: EPITAPH_COLOR, effect: burning(EPITAPH_WIPE_BAND, EPITAPH_EMBER) },
    })
    // Measure the laid-out ink into the recess instead of guessing a size, so
    // changing the wording can never overflow the stone.
    const { metricWidth, metricHeight } = handle.layout.metrics
    handle.mesh.scale.setScalar(fitScale({ width: metricWidth, height: metricHeight }, PANEL) * font.size)
    handle.mesh.position.set(0, PANEL_CENTRE_Y, PANEL_STANDOFF)
    if (handle.mesh.material instanceof MeshBasicNodeMaterial) handle.mesh.material.fog = false

    headstone.add(handle.mesh)
    handleRef.current = handle
    return () => {
      headstone.remove(handle.mesh)
      handle.dispose({ map: false })
      handleRef.current = null
    }
  }, [root, text, font, map])

  useFrame(({ camera }) => {
    const handle = handleRef.current
    if (!handle) return
    handle.mesh.getWorldPosition(worldPosition.current)
    handle.uniforms.wipeIn.value = epitaphReveal(camera.position.distanceTo(worldPosition.current))
  })

  return null
}
