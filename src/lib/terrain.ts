import { cos, float, sin } from 'three/tsl'
import type { Node } from 'three/webgpu'

// Smooth rolling-hill heightfield: a sum of sin·cos octaves. The same octave
// table generates both the CPU function (ground mesh, physics, grounding) and
// the TSL node used on the GPU (grass, fog, fireflies), so they never diverge.
type TerrainOctave = {
  frequencyX: number
  frequencyZ: number
  phaseX: number
  phaseZ: number
  amplitude: number
}

const TERRAIN_OCTAVES: readonly TerrainOctave[] = [
  { frequencyX: 0.04, frequencyZ: 0.04, phaseX: 0, phaseZ: 0, amplitude: 1.5 },
  { frequencyX: 0.13, frequencyZ: 0.11, phaseX: 2, phaseZ: 1, amplitude: 0.6 },
  { frequencyX: 0.28, frequencyZ: 0.31, phaseX: -1, phaseZ: -2, amplitude: 0.25 },
]

export function terrainHeight(x: number, z: number): number {
  let height = 0
  for (const octave of TERRAIN_OCTAVES) {
    height +=
      Math.sin(x * octave.frequencyX + octave.phaseX) *
      Math.cos(z * octave.frequencyZ + octave.phaseZ) *
      octave.amplitude
  }
  return height
}

// TSL twin of terrainHeight, generated from the same octave table.
export function terrainHeightNode(p: Node<'vec2'>): Node<'float'> {
  let height: Node<'float'> = float(0)
  for (const octave of TERRAIN_OCTAVES) {
    const wave = sin(p.x.mul(octave.frequencyX).add(octave.phaseX))
      .mul(cos(p.y.mul(octave.frequencyZ).add(octave.phaseZ)))
      .mul(octave.amplitude)
    height = height.add(wave)
  }
  return height
}

// Height of a world-space point above the ground under it. Fog bands and
// grass shading use this so valleys and hills read the same.
export function heightAboveTerrainNode(position: Node<'vec3'>): Node<'float'> {
  return position.y.sub(terrainHeightNode(position.xz))
}
