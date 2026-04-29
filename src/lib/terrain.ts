// Smooth rolling-hill heightfield. Same math is implemented in grass.vert.glsl
// so that the grass blade bases follow exactly the deformed ground.
export function terrainHeight(x: number, z: number): number {
  const a = Math.sin(x * 0.04) * Math.cos(z * 0.04) * 1.5
  const b = Math.sin(x * 0.13 + 2) * Math.cos(z * 0.11 + 1) * 0.6
  const c = Math.sin(x * 0.28 - 1) * Math.cos(z * 0.31 - 2) * 0.25
  return a + b + c
}

export const TERRAIN_MAX_HEIGHT = 1.5 + 0.6 + 0.25
