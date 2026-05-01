import { useFrame, useLoader } from '@react-three/fiber'
import { useControls } from 'leva'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import grassFrag from '../shaders/grass.frag.glsl?raw'
import grassVert from '../shaders/grass.vert.glsl?raw'
import { sceneState } from '../lib/scene-state'
import type { CharacterHandle } from './character'

const CARD_WIDTH = 0.45
const CARD_HEIGHT = 1.0
const HEIGHT_SEGMENTS = 5
const BLADE_BASE_HEIGHT = 0.9
const BLADE_HEIGHT_VARIATION = 0.7

type GrassProps = {
  characterRef: RefObject<CharacterHandle | null>
}

// Procedurally paint a grass card: several tapered strands with vertical
// gradients on a transparent background. Each instance carries this whole
// texture, so a single card visually contributes ~7 blades.
function buildGrassCardTexture(): THREE.CanvasTexture {
  const w = 256
  const h = 512
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, w, h)

  // Fewer but THICKER strands — chunkier silhouette reads better at distance
  // than many thin needles. Each strand also gets a soft outer glow so the
  // alpha test doesn't produce hard edges.
  const NUM_STRANDS = 4
  for (let i = 0; i < NUM_STRANDS; i++) {
    const baseX =
      (w / (NUM_STRANDS + 1)) * (i + 1) + (Math.random() - 0.5) * 18
    const tipX = baseX + (Math.random() - 0.5) * 50
    const baseHalf = 8 + Math.random() * 8
    const tipHalf = 1.5 + Math.random() * 2.5
    const heightFrac = 0.65 + Math.random() * 0.35
    const tipY = h * (1 - heightFrac)
    const midX = (baseX + tipX) / 2

    // soft outer halo — wider, lower opacity, gives a feathered alpha edge
    ctx.fillStyle = `hsla(105, 8%, 35%, 0.5)`
    ctx.beginPath()
    ctx.moveTo(baseX - baseHalf - 3, h)
    ctx.quadraticCurveTo(midX - 4, h * 0.5, tipX - tipHalf - 1.5, tipY)
    ctx.lineTo(tipX + tipHalf + 1.5, tipY)
    ctx.quadraticCurveTo(midX + 4, h * 0.5, baseX + baseHalf + 3, h)
    ctx.closePath()
    ctx.fill()

    // main blade body — desaturated grays, base→tip gradient
    const baseLight = 22 + Math.random() * 10
    const tipLight = 60 + Math.random() * 18
    const grad = ctx.createLinearGradient(0, h, 0, tipY)
    grad.addColorStop(0, `hsl(110, 6%, ${baseLight}%)`)
    grad.addColorStop(1, `hsl(95, 8%, ${tipLight}%)`)
    ctx.fillStyle = grad

    ctx.beginPath()
    ctx.moveTo(baseX - baseHalf, h)
    ctx.quadraticCurveTo(midX - 2, h * 0.5, tipX - tipHalf, tipY)
    ctx.lineTo(tipX + tipHalf, tipY)
    ctx.quadraticCurveTo(midX + 2, h * 0.5, baseX + baseHalf, h)
    ctx.closePath()
    ctx.fill()

    // bright spine — the centre line catches "specular" later via texLum
    const spineGrad = ctx.createLinearGradient(0, h, 0, tipY)
    spineGrad.addColorStop(0, `hsla(95, 6%, ${baseLight + 12}%, 0.55)`)
    spineGrad.addColorStop(1, `hsla(85, 10%, ${tipLight + 18}%, 0.7)`)
    ctx.fillStyle = spineGrad
    ctx.beginPath()
    ctx.moveTo(baseX - 1.5, h)
    ctx.quadraticCurveTo(midX, h * 0.5, tipX - 0.6, tipY)
    ctx.lineTo(tipX + 0.6, tipY)
    ctx.quadraticCurveTo(midX, h * 0.5, baseX + 1.5, h)
    ctx.closePath()
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.anisotropy = 4
  return texture
}

export function Grass({ characterRef }: GrassProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const materialRef = useRef<THREE.ShaderMaterial>(null)

  const {
    count,
    patchSize,
    bendStrength,
    windAmount,
    trampleRadius,
    trampleStrength,
    fogNear,
    fogFar,
    fogColor,
    groundFogTop,
    groundFogBottom,
    groundFogDensity,
    baseColor,
    tipColor,
    specStrength,
    specShininess,
    rimStrength,
    specColor,
    skyAmbient,
    groundAmbient,
    ambientStrength,
    tintStrength,
  } = useControls('grass', {
    count: { value: 197000, min: 5000, max: 400000, step: 1000 },
    patchSize: { value: 100, min: 20, max: 200, step: 5 },
    bendStrength: { value: 0.45, min: 0, max: 2, step: 0.05 },
    windAmount: { value: 0.4, min: 0, max: 2.5, step: 0.01 },
    trampleRadius: { value: 1.8, min: 0, max: 5, step: 0.1 },
    trampleStrength: { value: 0.9, min: 0, max: 5, step: 0.1 },
    fogNear: { value: 25, min: 0, max: 100, step: 1 },
    fogFar: { value: 70, min: 5, max: 200, step: 1 },
    fogColor: '#1a1f2c',
    groundFogTop: { value: 1.4, min: 0, max: 5, step: 0.05 },
    groundFogBottom: { value: -0.5, min: -3, max: 3, step: 0.05 },
    groundFogDensity: { value: 0.55, min: 0, max: 1, step: 0.05 },
    baseColor: '#1c2436',
    tipColor: '#5a7a4a',
    specStrength: { value: 1.4, min: 0, max: 4, step: 0.05 },
    specShininess: { value: 24, min: 1, max: 200, step: 1 },
    rimStrength: { value: 0.6, min: 0, max: 3, step: 0.05 },
    specColor: '#d8b070',
    skyAmbient: '#3e4a5c',
    groundAmbient: '#0a0f1a',
    ambientStrength: { value: 0.18, min: 0, max: 1.5, step: 0.05 },
    tintStrength: { value: 0.95, min: 0, max: 1, step: 0.05 },
  })

  // Card geometry: thin double-sided plane standing on Y, base at y=0, tip at y=1
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(
      CARD_WIDTH,
      CARD_HEIGHT,
      1,
      HEIGHT_SEGMENTS,
    )
    g.translate(0, CARD_HEIGHT / 2, 0)
    g.computeVertexNormals()
    return g
  }, [])

  const cloudTexture = useLoader(THREE.TextureLoader, '/cloud.jpg')
  useEffect(() => {
    cloudTexture.wrapS = cloudTexture.wrapT = THREE.RepeatWrapping
    cloudTexture.colorSpace = THREE.SRGBColorSpace
  }, [cloudTexture])

  const grassCard = useMemo(() => buildGrassCardTexture(), [])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCloud: { value: cloudTexture },
      uGrassMap: { value: grassCard },
      uPlayerPos: { value: new THREE.Vector3() },
      uPatchSize: { value: patchSize },
      uBendStrength: { value: bendStrength },
      uWindAmount: { value: windAmount },
      uTrampleRadius: { value: trampleRadius },
      uTrampleStrength: { value: trampleStrength },
      uFogColor: { value: new THREE.Color(fogColor) },
      uFogNear: { value: fogNear },
      uFogFar: { value: fogFar },
      uGroundFogTop: { value: groundFogTop },
      uGroundFogBottom: { value: groundFogBottom },
      uGroundFogDensity: { value: groundFogDensity },
      uLightDir: { value: sceneState.sunDirection.clone() },
      uSpecColor: { value: new THREE.Color(specColor) },
      uSpecStrength: { value: specStrength },
      uSpecShininess: { value: specShininess },
      uRimStrength: { value: rimStrength },
      uBaseColor: { value: new THREE.Color(baseColor) },
      uTipColor: { value: new THREE.Color(tipColor) },
      uSkyAmbient: { value: new THREE.Color(skyAmbient) },
      uGroundAmbient: { value: new THREE.Color(groundAmbient) },
      uAmbientStrength: { value: ambientStrength },
      uTintStrength: { value: tintStrength },
    }),
    [cloudTexture, grassCard],
  )

  // Sync leva controls into the shader uniforms. This is a side effect (we
  // mutate `uniforms` in place rather than returning a new value), so it
  // belongs in useEffect — useMemo here was misleading and listed `uniforms`
  // as a dep even though it mutates it.
  useEffect(() => {
    uniforms.uPatchSize.value = patchSize
    uniforms.uBendStrength.value = bendStrength
    uniforms.uWindAmount.value = windAmount
    uniforms.uTrampleRadius.value = trampleRadius
    uniforms.uTrampleStrength.value = trampleStrength
    uniforms.uFogNear.value = fogNear
    uniforms.uFogFar.value = fogFar
    uniforms.uFogColor.value.set(fogColor)
    uniforms.uGroundFogTop.value = groundFogTop
    uniforms.uGroundFogBottom.value = groundFogBottom
    uniforms.uGroundFogDensity.value = groundFogDensity
    uniforms.uSpecColor.value.set(specColor)
    uniforms.uSpecStrength.value = specStrength
    uniforms.uSpecShininess.value = specShininess
    uniforms.uRimStrength.value = rimStrength
    uniforms.uBaseColor.value.set(baseColor)
    uniforms.uTipColor.value.set(tipColor)
    uniforms.uSkyAmbient.value.set(skyAmbient)
    uniforms.uGroundAmbient.value.set(groundAmbient)
    uniforms.uAmbientStrength.value = ambientStrength
    uniforms.uTintStrength.value = tintStrength
  }, [
    uniforms,
    patchSize,
    bendStrength,
    windAmount,
    trampleRadius,
    trampleStrength,
    fogNear,
    fogFar,
    fogColor,
    groundFogTop,
    groundFogBottom,
    groundFogDensity,
    baseColor,
    tipColor,
    specColor,
    specStrength,
    specShininess,
    rimStrength,
    skyAmbient,
    groundAmbient,
    ambientStrength,
    tintStrength,
  ])

  // build per-instance transforms + attributes whenever count or patch changes
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const dummy = new THREE.Object3D()
    const centers = new Float32Array(count * 2)
    const bends = new Float32Array(count * 2)

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * patchSize
      const z = (Math.random() - 0.5) * patchSize
      const yaw = Math.random() * Math.PI * 2
      const heightScale = BLADE_BASE_HEIGHT + Math.random() * BLADE_HEIGHT_VARIATION
      const widthScale = 0.7 + Math.random() * 0.6

      dummy.position.set(x, 0, z)
      dummy.rotation.set(0, yaw, 0)
      dummy.scale.set(widthScale, heightScale, widthScale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      centers[i * 2] = x
      centers[i * 2 + 1] = z

      const bendDir = Math.random() * Math.PI * 2
      const bendMag = 0.6 + Math.random() * 0.6
      bends[i * 2] = Math.sin(bendDir) * bendMag
      bends[i * 2 + 1] = -Math.cos(bendDir) * bendMag
    }

    mesh.geometry.setAttribute(
      'aCenter',
      new THREE.InstancedBufferAttribute(centers, 2),
    )
    mesh.geometry.setAttribute(
      'aBend',
      new THREE.InstancedBufferAttribute(bends, 2),
    )
    mesh.instanceMatrix.needsUpdate = true
    // huge bounding sphere so it never frustum-culls
    mesh.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10000)
  }, [count, patchSize])

  useFrame(() => {
    const mat = materialRef.current
    if (!mat) return
    mat.uniforms.uTime.value = performance.now()
    mat.uniforms.uLightDir.value.copy(sceneState.sunDirection)
    const char = characterRef.current
    if (char) {
      const p = char.getPosition()
      mat.uniforms.uPlayerPos.value.set(p.x, p.y, p.z)
    }
  })

  return (
    <instancedMesh
      key={count}
      ref={meshRef}
      args={[geometry, undefined, count]}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
    >
      <shaderMaterial
        attach="material"
        ref={materialRef}
        vertexShader={grassVert}
        fragmentShader={grassFrag}
        uniforms={uniforms}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  )
}
