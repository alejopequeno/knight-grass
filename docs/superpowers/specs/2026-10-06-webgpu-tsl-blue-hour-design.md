# walk-grass — Etapa 1: WebGPU + TSL + mood "blue hour"

Fecha: 2026-10-06 · Estado: aprobado en chat, pendiente revisión escrita

## 1. Objetivo

Migrar walk-grass de `WebGLRenderer` + GLSL a `WebGPURenderer` + TSL y llevar el look a una "hora azul" cinematográfica (sol recién puesto, horizonte cálido, cénit azul frío, luciérnagas, niebla baja, luna recortando al paladín).

Esta es la **etapa 1** de dos. La etapa 2 (spec separada, fuera de alcance acá) reemplaza el pasto por un sistema compute estilo Ghost of Tsushima.

### Criterios de éxito

1. Escena corre sobre `WebGPURenderer` en Chrome/Edge/Safari 26+ desktop, sin errores de consola propios.
2. Pasto TSL visualmente equivalente al GLSL actual (verificado con capturas a seed y pose fijas) antes de aplicar el mood.
3. Mood blue hour completo: cielo, estrellas, luciérnagas, niebla de altura compartida, rim lunar en paladín, post-proceso.
4. 60 fps a dpr 1.5 en el Mac del usuario, caminando 10 s por el campo.
5. Sin regresiones: animaciones sin T-pose, teclado completo (WASD, Space, F, Q, J/L/I/K, foco en botón de sonido), cortina de carga, audio.
6. `pnpm lint`, `pnpm test`, `pnpm build` y `tsc` en 0.

### Fuera de alcance

- Fallback WebGL (decisión A: WebGPU obligatorio).
- Pasto compute / LOD / millones de hojas (etapa 2).
- God rays, DOF, GTAO/SSGI, lens flare.
- Migración FBX → GLB, leva solo-dev.
- Commits: todo queda local en el working tree.

## 2. Plataforma objetivo

Desktop moderno con WebGPU. Sin WebGPU (o si falla init) se muestra una pantalla explicativa; no se monta el `Canvas`.

## 3. Arquitectura

Se mantiene R3F v9 + Rapier + input + `PaladinAnimator`. Cambian renderer, materiales, cielo y post.

```
src/
  renderer/
    create-renderer.ts      factory async de WebGPURenderer (init, toneMapping AgX, device.lost)
    webgpu-support.ts       detección pura: navigator.gpu + requestAdapter()
    webgpu-gate.tsx         pantalla "necesita WebGPU" / "falló el renderer"
    render-pipeline.tsx     RenderPipeline (useFrame prioridad 1)
  atmosphere/
    atmosphere.ts           fuente única: uniforms TSL compartidos (sol, luna, paleta, niebla, tiempo)
    height-fog.ts           scene.fogNode: distancia + altura
    sky.tsx                 SkyMesh + luces + environment
    stars.tsx               estrellas TSL instanciadas
    fireflies.tsx           partículas compute
    blue-hour-lut.ts        generación procedural del LUT 3D
  scene/
    grass.tsx               componente (instancias, leva → uniforms)
    grass-material.ts       NodeMaterial TSL (port 1:1 del GLSL)
    ground.tsx              MeshStandardNodeMaterial, recibe fog global
    paladin.tsx             + conversión a MeshStandardNodeMaterial con rim lunar
    character.tsx, follow-camera.tsx, paladin-animator.ts   sin cambios funcionales
  lib/
    terrain.ts              tabla de octavas → función TS + Fn TSL
    seeded-random.ts        PRNG determinista (mulberry32)
```

Se eliminan: `src/shaders/*.glsl`, `src/lib/scene-state.ts`, `src/scene/post.tsx`, dependencias `postprocessing` y `@react-three/postprocessing`, y el uso de `Stars` de drei.

### Flujo de datos

`atmosphere.ts` exporta nodos `uniform()` de TSL (dirección sol/luna, colores de niebla/horizonte, alturas de niebla, tiempo). Pasto, suelo, estrellas, luciérnagas, rim del paladín y post leen **los mismos nodos**: un cambio en un uniform (vía leva o animación) se propaga sin código de sincronización. Reemplaza al `sceneState` mutable actual.

### Integración R3F

- `<Canvas gl={createRenderer}>` con factory async (`(props) => Promise<WebGPURenderer>`).
- Clases de `three/webgpu` usadas como JSX se registran con `extend()` y se tipan vía `ThreeElements` augmentation (sin `any`).
- `RenderPipeline.render()` dentro de `useFrame(..., 1)` desactiva el render automático de R3F.

## 4. Pasto (port 1:1)

- `InstancedMesh`, 197k cards, misma geometría (plano 1×5 segmentos) y misma textura de card pintada en canvas.
- Material: `MeshBasicNodeMaterial`, `side: DoubleSide`, `fog: true`.
- `positionNode` (vértice): instancia → wrap toroidal alrededor del jugador → altura de terreno (`terrainHeightNode`) → curva por hoja (`aBend`) → viento (2 ondas) → trample (empuje, hundimiento, shimmy). Atributos `aCenter`, `aBend` vía `attribute()` / `instancedBufferAttribute`.
- `colorNode` (fragmento): textura → `Discard()` si alpha < 0.4 → paleta base/punta × lift de luminancia → variación con textura cloud → hemisferio → AO falso → difuso suave → Kajiya-Kay + fresnel con gates de distancia/horizonte → glint de contraluz. La niebla ya no está en el shader del pasto: la aplica `scene.fogNode`.
- Posiciones, rotaciones, escalas y curvas generadas con `seeded-random.ts` (seed fija) → mismas instancias en cada carga.
- Parámetros leva idénticos a hoy, escritos en nodos `uniform()`.

**Gate de paridad:** antes de tocar atmósfera, capturas WebGL (versión actual) vs WebGPU desde la misma pose fija deben verse equivalentes (mismo pasto, misma iluminación aproximada; diferencias de AA/precisión aceptables).

## 5. Atmósfera — blue hour

| Elemento | Decisión |
| --- | --- |
| Cielo | `SkyMesh` (TSL). Sol a −2° de elevación. Turbidez/rayleigh ajustados a franja naranja apagada en horizonte y cénit azul profundo. |
| Tone mapping | AgX (reemplaza ACES). Exposición tunable. |
| Luz principal | Luna: `DirectionalLight` fría (~#b9cfe8), alta, opuesta al sol, **proyecta sombras**, sigue a la cámara. |
| Relleno | Sol: direccional cálida baja, sin sombras. Hemisférica ajustada a la paleta. |
| Environment | HDR nocturno local (`public/hdri/dikhololo-night-1k.hdr`) como `scene.environment`, intensidad baja. |
| Niebla | `scene.fogNode` = combinación de niebla por distancia (`smoothstep(near, far, depth)`) y niebla de altura (densa al ras, se desvanece a ~1.4 m), color mezclado hacia el horizonte. Aplica a pasto, suelo y paladín. Cielo y estrellas con `fog: false`. |
| Estrellas | ~4k puntos instanciados en esfera grande, tamaño en pantalla fijo, titileo por `hash(id) + time`, opacidad atenuada cerca del horizonte. Emisivas (bloom). |
| Luciérnagas | ~400. Storage buffers (posición, fase). Compute por frame: deriva con ruido, wrap alrededor del jugador (radio ~25 m), altura 0.3–2 m sobre `terrainHeightNode`. Render: sprites aditivos, pulso por fase, color amarillo-verdoso emisivo. |
| Paladín | Materiales Phong del FBX → `MeshStandardNodeMaterial` (copiando `map`, `normalMap`, color). Rim fresnel `pow(1 − |n·v|, k) × colorLuna × intensidad` en `emissiveNode`. |

## 6. Post-proceso

Pipeline (`RenderPipeline`):

1. `pass(scene, camera)` con MRT: `output` + `emissive`.
2. `bloom(emissive + umbral de luminancia alta)` sumado al color.
3. `traa()` (antialiasing temporal; mejor que FXAA para bordes finos del pasto).
4. Tone mapping AgX → `lut3D()` con LUT blue hour generado por código (sombras frías, medios teal, altos cálidos).
5. Viñeta + grano de film.

Toggle `enabled` en leva para comparar con/sin post.

## 7. Manejo de errores

| Caso | Comportamiento |
| --- | --- |
| Sin `navigator.gpu` o `requestAdapter()` null | `webgpu-gate` muestra "Este experimento necesita WebGPU" + browsers soportados. `Canvas` no se monta. |
| `renderer.init()` rechaza | Misma pantalla con mensaje de falla de inicialización. Error logueado. |
| `device.lost` | Overlay con mensaje y sugerencia de recargar (en vez de canvas negro). |
| Falla de assets | Flujo actual: `load-state` + mensaje de la cortina. |

Las pantallas son accesibles: `role="alert"`, texto legible, sin trampas de foco.

## 8. Testing

- **Vitest (lógica pura):**
  - `PaladinAnimator` (existente).
  - Terreno: función TS vs evaluación de la misma tabla para el `Fn` TSL (mismos valores en puntos de muestra).
  - `seeded-random`: determinismo y rango.
  - `webgpu-support`: ramas sin `navigator.gpu`, adapter null, adapter ok (con mocks).
  - LUT: tamaño, rango [0,1], identidad en el punto neutro configurado.
- **Playwright (Chromium con WebGPU):** carga sin errores de consola propios, cortina se levanta, ataque/salto sin T-pose, teclado (Tab al botón, Space en botón no salta, J/L giran cámara), gate visible cuando se fuerza ausencia de WebGPU.
- **Paridad del pasto:** capturas WebGL vs WebGPU (sección 4).
- **Performance:** medición de fps 10 s caminando a dpr 1.5. Si < 60: bajar resolución del bloom, luego densidad del pasto.

## 9. Orden de implementación

Cada paso termina con lint/test/build en 0 y verificación en browser.

1. Renderer + gate: escena actual andando en WebGPU (materiales estándar se auto-convierten; pasto GLSL temporalmente oculto).
2. Pasto TSL + gate de paridad.
3. `atmosphere.ts` + niebla global + luces luna/sol.
4. Cielo blue hour (SkyMesh, AgX), estrellas, rim del paladín.
5. Luciérnagas compute.
6. Post-proceso.
7. Limpieza (GLSL, dependencias, `scene-state`) + pasada de performance + README.

## 10. Riesgos

- **R3F + WebGPU menos transitado:** tipado de `extend` y de la factory `gl`. Mitigación: aislar en `renderer/`, tipar con `ThreeElements`.
- **drei `Environment` en WebGPU:** si no funciona, cargar el HDR con `RGBELoader`/`HDRLoader` y asignar `scene.environment` a mano.
- **TRAA + pasto con viento:** puede generar ghosting. Mitigación: velocity del MRT; si persiste, caer a SMAA/FXAA.
- **Performance de 197k cards con `Discard()`:** igual que hoy en WebGL; si cae bajo 60 fps se reduce densidad (la solución de fondo es la etapa 2).
