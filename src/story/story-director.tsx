import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu'
import { clearTargets, writeHaloTargets, writeRiseTargets, writeTrailTargets } from '../atmosphere/firefly-targets'
import { terrainHeight } from '../lib/terrain'
import type { CharacterHandle } from '../scene/character'
import { StoryTexts } from '../text/story-texts'
import { composeShot, lensScale, setCameraShot } from '../lib/camera-shot'
import { setControlLock } from '../lib/control-lock'
import { isSceneRevealed } from '../lib/load-state'
import { clampFrameDelta } from '../lib/frame-delta'
import { announceStory } from './story-announcer'
import {
  createStoryState,
  isPlayerLocked,
  stepStory,
  storyAnnouncements,
  storyPresentation,
  type StoryPresentation,
  type StoryState,
} from './story-machine'
import { STORY_CLEARINGS, STORY_SCRIPT, type Waypoint } from './story-script'
import { placeTitle } from './title-anchor'

// The phrase hangs ahead of the player, above the over-the-shoulder camera's
// view of the paladin.
const LINE_DISTANCE = 7
const LINE_HEIGHT = 2.8
const UNIT_SCALE = new Vector3(1, 1, 1)
// Follow camera eye above the paladin, for titles placed outside a shot.
const FOLLOW_EYE_HEIGHT = 3
const FACING_AXIS = new Vector3(0, 0, 1)
const INITIAL_PRESENTATION = storyPresentation(createStoryState())
const ANNOUNCEMENT_SEPARATOR = '. '

type Props = {
  characterRef: RefObject<CharacterHandle | null>
  /** Follow-camera yaw: where the camera is heading, even before it settles. */
  cameraYawRef: RefObject<number>
}

// The trail stops at the edge of the waypoint's grass clearing, if it has one.
function clearingRadius(waypoint: Waypoint): number {
  return STORY_CLEARINGS.find((c) => c.x === waypoint.x && c.z === waypoint.z)?.radius ?? 0
}

// A beat begins with its first phase: the zone title, or the line.
function startedBeat(previous: StoryState, next: StoryState): boolean {
  if (next.beatIndex !== previous.beatIndex) return next.phase === 'title' || next.phase === 'line'
  return previous.phase === 'waiting' && next.phase !== 'waiting'
}

// Height of the phrase above each prop (taller props hold it higher).
const TEXT_HEIGHT_BY_BEAT: Readonly<Record<string, number>> = { fabroos: 2.1, oath: 2.3, standard: 3.7 }
// The cinematic long lens magnifies: phrases at a place are scaled down so
// they read as an inscription, not a wall of text.
const SHOT_TEXT_SCALE = new Vector3(0.55, 0.55, 0.55)
const DEFAULT_TEXT_HEIGHT = 2.6
// Halo of souls circling the prop (metres): well inside the trigger radius,
// so it never wraps the paladin.
const HALO_RADIUS = 1.8

function textHeightFor(beatIndex: number): number {
  return TEXT_HEIGHT_BY_BEAT[STORY_SCRIPT[beatIndex]?.id ?? ''] ?? DEFAULT_TEXT_HEIGHT
}

const placeScratch = { position: new Vector3(), facing: new Quaternion(), toCamera: new Vector3() }

// Anchor `matrix` above `point`, turned (yaw only) to face `camera`.
function placeFacing(matrix: Matrix4, point: Waypoint, height: number, camera: Vector3, scale: Vector3): void {
  const { position, facing, toCamera } = placeScratch
  position.set(point.x, terrainHeight(point.x, point.z) + height, point.z)
  toCamera.set(camera.x - position.x, 0, camera.z - position.z).normalize()
  facing.setFromUnitVectors(FACING_AXIS, toCamera)
  matrix.compose(position, facing, scale)
}

export function StoryDirector({ characterRef, cameraYawRef }: Props) {
  const stateRef = useRef<StoryState>(createStoryState())
  const presentationRef = useRef<StoryPresentation>(INITIAL_PRESENTATION)
  const lineAnchorRef = useRef(new Matrix4())
  const titleAnchorRef = useRef(new Matrix4())
  const headRef = useRef(new Vector3())
  const announcedRef = useRef(new Set<string>())
  const scratchRef = useRef({ forward: new Vector3(), position: new Vector3(), target: new Vector3(), facing: new Quaternion() })

  useFrame(({ clock }, delta) => {
    const character = characterRef.current
    // The story begins with the scene on screen, never under the curtain.
    if (!character || !isSceneRevealed()) return
    const player = character.getPosition()

    const previous = stateRef.current
    // Clamp: a long hidden-tab frame must not skip lines the player never saw.
    const next = stepStory(previous, { playerX: player.x, playerZ: player.z, delta: clampFrameDelta(delta) })
    stateRef.current = next
    const presentation = storyPresentation(next)
    presentationRef.current = presentation
    setControlLock(isPlayerLocked(next.phase))
    const { forward, position, target, facing } = scratchRef.current

    // A beat starts: frame it and place its title and line. Directions come
    // from where the camera is going (shot or follow yaw), not where it is
    // this frame — on load it has not settled behind the paladin yet.
    if (startedBeat(previous, next)) {
      const waypoint = STORY_SCRIPT[next.beatIndex]?.waypoint
      if (waypoint) {
        const shot = composeShot(player, waypoint, terrainHeight)
        setCameraShot(shot)
        placeFacing(lineAnchorRef.current, waypoint, textHeightFor(next.beatIndex), shot.position, SHOT_TEXT_SCALE)
        placeTitle(titleAnchorRef.current, shot.position, forward.subVectors(shot.target, shot.position), lensScale(shot.fov))
      } else {
        // No waypoint: hang the phrase ahead of the player, facing the camera.
        // The follow camera sits behind the player along -(sin yaw, cos yaw).
        const yaw = cameraYawRef.current
        forward.set(Math.sin(yaw), 0, Math.cos(yaw))
        position.copy(player).addScaledVector(forward, LINE_DISTANCE)
        position.y = terrainHeight(position.x, position.z) + LINE_HEIGHT
        facing.setFromUnitVectors(FACING_AXIS, forward.clone().negate())
        lineAnchorRef.current.compose(position, facing, UNIT_SCALE)
        position.copy(player)
        position.y += FOLLOW_EYE_HEIGHT
        placeTitle(titleAnchorRef.current, position, forward)
      }
    }
    if (!presentation.shot && previous.phase !== next.phase) setCameraShot(null)

    // The reply is the paladin speaking: it hangs right over his head.
    headRef.current.copy(player)

    if (presentation.shot) {
      // While a waypoint beat plays, the souls circle the place.
      writeHaloTargets(presentation.shot, HALO_RADIUS, clock.elapsedTime)
    } else if (presentation.fireflyMode === 'trail' && presentation.guideTarget) {
      target.set(presentation.guideTarget.x, 0, presentation.guideTarget.z)
      writeTrailTargets(player, target, clock.elapsedTime, clearingRadius(presentation.guideTarget))
    } else if (presentation.fireflyMode === 'rise') {
      writeRiseTargets(player, presentation.riseTime)
    } else if (presentation.fireflyMode === 'free' && previous.phase !== next.phase) {
      // Nothing to show: the fireflies go back to drifting freely.
      clearTargets()
    }

    // Texts that appear on the same frame (a banner and its line) are read as
    // one message, otherwise the second would replace the first unread.
    const fresh = storyAnnouncements(next, presentation, announcedRef.current)
    if (fresh.length > 0) announceStory(fresh.join(ANNOUNCEMENT_SEPARATOR))
  })

  return (
    <StoryTexts
      presentationRef={presentationRef}
      lineAnchorRef={lineAnchorRef}
      titleAnchorRef={titleAnchorRef}
      headRef={headRef}
    />
  )
}
