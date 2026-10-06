import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, type RefObject } from 'react'
import {
  composeEffects,
  createText,
  scramble,
  wipe,
  type ComposedEffect,
  type ScrambleEffect,
  type TextEffect,
  type TextHandle,
  type WipeEffect,
} from 'lettra/three'
import { Color, Group, MeshBasicNodeMaterial, Vector3, type Matrix4 } from 'three/webgpu'
import { useReducedMotion } from '../lib/reduced-motion'
import type { StoryPresentation } from '../story/story-machine'
import { emberEdge } from './ember-edge'
import { useStoryFont, type StoryFont } from './text-assets'

// Phrase the fireflies write: warm and above 1.0 so the bloom picks it up.
const LINE_COLOR = new Color('#ffd58a').multiplyScalar(2.2)
const REPLY_COLOR = '#e9e4d8'
const BANNER_COLOR = '#f1e6c8'
// Hot front of the burning wipe (HDR so the bloom flares it).
const LINE_EMBER = new Color('#ff7a1f').multiplyScalar(4)
const BANNER_EMBER = new Color('#ff9a3c').multiplyScalar(2.5)
/** World metres per em. */
export const LINE_SIZE = 0.55
// Long phrases wrap into an inscription instead of running off the frame.
const LINE_MAX_WIDTH_EM = 14
const REPLY_SIZE = 0.12
const BANNER_SIZE = 3.4
const REPLY_MAX_WIDTH_EM = 22
const REPLY_HEAD_OFFSET = 2.3
// The paladin's reply is drawn after the scene, never hidden by his own body.
const REPLY_RENDER_ORDER = 10
const LINE_WIPE_BAND = 0.25
const BANNER_WIPE_BAND = 0.4
const REPLY_SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÑ'
// Reduced motion: wipes finish twice as fast.
const REDUCED_MOTION_WIPE_SPEED = 2
const EMPTY_TEXT = ' '

type BurningEffect = ComposedEffect<[WipeEffect, TextEffect]>

type StoryTextHandles = {
  line: TextHandle<BurningEffect>
  reply: TextHandle<ScrambleEffect>
  banner: TextHandle<BurningEffect>
}

function burning(band: number, ember: Color): BurningEffect {
  return composeEffects(wipe({ band }), emberEdge(ember))
}

function createHandles({ font, map }: StoryFont): StoryTextHandles {
  const metresPerPx = (size: number) => size / font.size
  const line = createText({
    font,
    map,
    text: EMPTY_TEXT,
    geometry: { scale: metresPerPx(LINE_SIZE) },
    layout: { align: 'center', maxWidth: font.size * LINE_MAX_WIDTH_EM },
    material: { fill: LINE_COLOR, effect: burning(LINE_WIPE_BAND, LINE_EMBER) },
  })
  const reply = createText({
    font,
    map,
    text: EMPTY_TEXT,
    geometry: { scale: metresPerPx(REPLY_SIZE) },
    layout: { align: 'center', maxWidth: font.size * REPLY_MAX_WIDTH_EM },
    material: { fill: REPLY_COLOR, effect: scramble({ font, chars: REPLY_SCRAMBLE_CHARS }) },
  })
  const banner = createText({
    font,
    map,
    text: EMPTY_TEXT,
    geometry: { scale: metresPerPx(BANNER_SIZE) },
    layout: { align: 'center' },
    material: { fill: BANNER_COLOR, effect: burning(BANNER_WIPE_BAND, BANNER_EMBER) },
  })
  // The banner sits far away on the horizon; fog would swallow it.
  if (banner.mesh.material instanceof MeshBasicNodeMaterial) banner.mesh.material.fog = false
  line.mesh.matrixAutoUpdate = false
  banner.mesh.matrixAutoUpdate = false
  if (reply.mesh.material instanceof MeshBasicNodeMaterial) reply.mesh.material.depthTest = false
  reply.mesh.renderOrder = REPLY_RENDER_ORDER
  return { line, reply, banner }
}

// Re-lays out only when the string actually changes.
function syncText<E extends TextEffect>(handle: TextHandle<E>, shown: Map<TextHandle<E>, string>, text: string): void {
  if (shown.get(handle) === text) return
  handle.setText(text)
  shown.set(handle, text)
}

type Props = {
  presentationRef: RefObject<StoryPresentation>
  /** World transform of the firefly line (set by the director at gather start). */
  lineAnchorRef: RefObject<Matrix4>
  /** World transform of the zone title (pinned on the horizon per beat). */
  titleAnchorRef: RefObject<Matrix4>
  /** Paladin root position (feet). */
  headRef: RefObject<Vector3>
}

export function StoryTexts({ presentationRef, lineAnchorRef, titleAnchorRef, headRef }: Props) {
  const storyFont = useStoryFont()
  const reducedMotion = useReducedMotion()
  const groupRef = useRef<Group>(null)
  const handlesRef = useRef<StoryTextHandles | null>(null)
  const shownLineRef = useRef(new Map<TextHandle<BurningEffect>, string>())
  const shownReplyRef = useRef(new Map<TextHandle<ScrambleEffect>, string>())

  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    const handles = createHandles(storyFont)
    handlesRef.current = handles
    group.add(handles.line.mesh, handles.reply.mesh, handles.banner.mesh)
    const shownLine = shownLineRef.current
    const shownReply = shownReplyRef.current
    return () => {
      group.remove(handles.line.mesh, handles.reply.mesh, handles.banner.mesh)
      handles.line.dispose({ map: false })
      handles.reply.dispose({ map: false })
      handles.banner.dispose({ map: false })
      shownLine.clear()
      shownReply.clear()
      handlesRef.current = null
    }
  }, [storyFont])

  useFrame(({ camera }) => {
    const handles = handlesRef.current
    if (!handles) return
    const p = presentationRef.current
    const wipeSpeed = reducedMotion ? REDUCED_MOTION_WIPE_SPEED : 1
    const { line, reply, banner } = handles

    line.mesh.visible = p.line !== null
    if (p.line !== null) {
      syncText(line, shownLineRef.current, p.line)
      line.mesh.matrix.copy(lineAnchorRef.current)
      line.mesh.matrixWorldNeedsUpdate = true
      line.uniforms.wipeIn.value = Math.min(1, p.lineWipeIn * wipeSpeed)
      line.uniforms.wipeOut.value = Math.min(1, p.lineWipeOut * wipeSpeed)
    }

    reply.mesh.visible = p.reply !== null
    if (p.reply !== null) {
      syncText(reply, shownReplyRef.current, p.reply)
      reply.mesh.position.copy(headRef.current)
      reply.mesh.position.y += REPLY_HEAD_OFFSET
      reply.mesh.quaternion.copy(camera.quaternion)
      reply.uniforms.scramble.value = reducedMotion ? 0 : 1 - p.replyReveal
      reply.uniforms.opacity.value = p.replyOpacity
    }

    banner.mesh.visible = p.banner !== null
    if (p.banner !== null) {
      syncText(banner, shownLineRef.current, p.banner)
      banner.mesh.matrix.copy(titleAnchorRef.current)
      banner.mesh.matrixWorldNeedsUpdate = true
      banner.uniforms.wipeIn.value = Math.min(1, p.bannerWipeIn * wipeSpeed)
      banner.uniforms.wipeOut.value = Math.min(1, p.bannerWipeOut * wipeSpeed)
    }
  })

  return <group ref={groupRef} />
}
