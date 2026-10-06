# walk-grass — Etapa 2: pasto de hojas (estilo Ghost of Tsushima) en TSL

Fecha: 2026-10-06 · Estado: aprobado en chat, pendiente revisión escrita
Precede: `2026-10-06-webgpu-tsl-blue-hour-design.md` (etapa 1, completada)

## 1. Objetivo

Reemplazar el pasto actual (197k *cards* planas alpha-tested) por un campo de **hojas de geometría** con look de **pampa alta** (~0.7–1.3 m), siguiendo la técnica de *Ghost of Tsushima* (GDC 2021) y su port de SimonDev (Quick_Grass, MIT), escrito desde cero en TSL sobre la base de la etapa 1.

### Criterios de éxito

1. De cerca las hojas se leen con volumen (curvas, afinadas, normales redondeadas), nunca como tiras planas.
2. Sin hojas flotantes ni borde visible del parche al caminar o mirar crestas lejanas.
3. El campo lejano se lee denso y continuo (no oscuro ni pelado) hasta el horizonte con niebla.
4. Ráfagas de viento visibles como bandas de luz recorriendo el campo; cada hoja con rigidez propia; agrupación por matas.
5. A contraluz las puntas se encienden doradas (translucidez).
6. 60 fps a dpr 1.5 en el Mac del usuario caminando 10 s (`e2e/perf.spec.ts`).
7. Sin regresiones de la etapa 1: lint, unit, tsc, build y e2e en verde; teclado y accesibilidad intactos.

### Fuera de alcance

Pisoteo persistente (recuperación lenta), culling por frustum con indirect draw, flores / especies mixtas, sombras proyectadas por el pasto. Commits (todo local).

## 2. Enfoque elegido

**Compute por hoja + vertex solo para la forma.** Un compute por frame recorre cada hoja una vez y escribe su estado en `instancedArray`; el vertex shader lee su hoja con `instanceIndex` y solo construye la curva. El trabajo caro (hash, Voronoi, ruido de viento) ocurre 1 vez por hoja en vez de ~14 veces por vértice.

Descartados: todo-en-vertex (repite el trabajo por vértice) e híbrido (más complejo, mismo costo de vertex).

## 3. Arquitectura

```
src/grass/
  grass-config.ts            fuente única: anillos, espaciados, dimensiones, segmentos, paleta, defaults de leva
  grass-layout.ts (+test)    TS puro: grilla por anillo (conteo, espaciado, radio), origen anclado al mundo, curva de raleo
  grass-blade-geometry.ts (+test)  tira base: 2×(N+1) vértices, atributo `t` (0 base → 1 punta), `side` (−1/+1), índices
  grass-state.ts             instancedArray por anillo: bladeA (world xz, altura, yaw), bladeB (bend xz, clumpTint, seed)
  grass-simulation.ts        compute Fn (1 hilo por hoja): colocación, datos por hash, matas, viento, pisoteo → estado
  grass-material.ts          vertex: Bezier + taper + ensanchado de canto + normales redondeadas; fragment: color/luz
  grass.tsx                  monta 2 InstancedMesh (cerca / lejos) y despacha el compute en useFrame
```

Se eliminan `src/scene/grass.tsx`, `src/scene/grass-material.ts`, `src/scene/grass-patch.ts` (+test), la textura de card en canvas y el uso de `public/cloud.jpg` por el pasto.

### Flujo por frame

1. `PlayerUniformSync` escribe `playerPosition` (existente).
2. Compute por anillo: índice de hoja → celda de grilla **anclada al mundo** (`origin = floor(player.xz / spacing) * spacing`, celda = origin + (i − n/2, j − n/2) × spacing). La misma celda del mundo produce siempre la misma hoja: sin wrap toroidal ni saltos.
3. Hash de la celda → jitter (±0.5 espaciado), altura base, yaw, lean, rigidez, semilla de color, *rank* de densidad. Luego matas, viento, pisoteo, fade de borde/anillo → `bladeA`, `bladeB`.
4. Vertex lee su hoja (`instanceIndex`) y arma la forma.
5. Fragment colorea; lee `atmosphere` (sol/luna/colores) y respeta `scene.fogNode`.

### Anillos de LOD

| Anillo | Extensión | Espaciado | Hojas aprox. | Segmentos | Vértices/hoja |
| --- | --- | --- | --- | --- | --- |
| Cerca | ±15 m | 0.07 m | ~183k | 6 | 14 |
| Lejos | ±60 m | 0.18 m | ~444k | 2 | 6 |

- Raleo continuo con la distancia: la hoja desaparece (altura 0) si su `rank` supera la densidad local; el ancho se compensa con `1/sqrt(densidad)`.
- Cruce entre anillos: el anillo lejano colapsa (altura 0) sus hojas dentro del radio cercano con transición suave; el cercano se desvanece en su borde.
- Borde exterior: altura → 0 en el último tramo del anillo lejano.

## 4. Forma, viento y matas

### Forma (vertex)
- Bezier cuadrática base → control → punta; *lean* y viento desplazan la punta conservando el largo aproximado (se dobla, no se estira).
- Ancho `width × (1 − t)^0.7`.
- Ensanchado de canto: si la hoja es casi paralela a la vista, se abre en view-space (no desaparece en 1 px).
- Normales redondeadas: rotación ±30° según `side`, mezclada hacia `(0,1,0)` con la distancia.

### Datos por hoja (compute)
Jitter ±0.5 espaciado; altura 0.7–1.3 m × altura de mata; yaw = aleatorio mezclado con orientación de mata; lean 0.2–0.6; rigidez 0.6–1.4; semilla de color; rank 0–1.

### Matas (Voronoi)
Celda ~1.5 m, búsqueda 3×3 del centro más cercano. La mata define altura (×0.8–1.2), yaw dominante y tinte; cada hoja se inclina levemente hacia su centro.

### Viento
- Ráfagas: `mx_noise_float` 2D desplazado en la dirección del viento con domain warp → bandas que recorren el campo.
- Flutter: `sin(time × rate + seed)` de baja amplitud en puntas.
- Flexión ÷ rigidez.
- Normales inclinadas viento abajo (las ráfagas se ven en la luz).
- Uniforms en leva: dirección, fuerza, escala y velocidad de ráfagas.

### Pisoteo
Empuje radial desde el jugador + hundimiento, aplicado a la curva (misma lógica que hoy). Respeta `motionScale` solo en el flutter (reduced motion: sin temblor; ráfagas reducidas).

## 5. Color y luz

- Gradiente `mix(baseColor, tipColor, pow(t, 1.5))`: base oliva oscuro → puntas pajizas doradas.
- Variación por hoja: brillo ±15 % y leve tono (semilla).
- Zonas: `mx_noise_float(xz × 0.02)` mezcla "seco" (amarillo claro) y "verde" (más saturado).
- Tinte por mata.
- Shading propio (no PBR): Lambert envuelto (`dot(n,l)×0.5+0.5`) con sol y luna de `atmosphere` + ambiente hemisférico.
- AO de base `mix(aoMin, 1, t)` donde `aoMin` va de 0.35 (cerca) a ~0.7 (lejos): el campo lejano no se ve negro.
- Translucidez a contraluz: `albedo × sunColor × pow(max(dot(V, −L), 0), 4) × t²` (reemplaza el glint actual).
- Especular anisotrópico suave a lo largo de la hoja, intensidad baja, sin fresnel fuerte.
- Niebla: `fog: true`, usa `scene.fogNode` existente.
- Suelo: `ground.tsx` pasa a `colorNode` con el mismo albedo promedio de puntas + el mismo ruido de zonas, oscurecido como el AO lejano → más allá del último anillo el campo continúa.
- Bloom: puntas a contraluz pueden superar 1.0 HDR; el pipeline actual las toma sin cambios.
- Paleta y parámetros en `grass-config.ts`, expuestos en leva (`grass`); defaults de uniforms y leva salen del mismo objeto.

## 6. Performance

- Total ~630k hojas, ~5.3M vértices (vs ~2.4M + `Discard` hoy). Vértices colapsados (altura 0) ≈ gratis.
- Compute ~630k hilos/frame (hash + Voronoi 3×3 + ruido): estimado < 1 ms en Apple Silicon.
- Objetivo 60 fps a dpr 1.5 (`e2e/perf.spec.ts`). Si no llega, en orden: espaciado lejano 0.22 → anillo cercano ±12 m → 5 segmentos.
- El pasto no proyecta sombras.

## 7. Testing

- **Vitest:**
  - `grass-layout`: conteos por anillo; grilla anclada al mundo (misma celda → misma hoja al mover el jugador dentro de una celda y al cruzarla); raleo monótono decreciente con la distancia; ninguna hoja fuera del radio.
  - `grass-blade-geometry`: conteo de vértices/índices por segmentos, `t` ∈ [0,1] y monótono a lo largo de la hoja, `side` ∈ {−1, +1}, índices dentro de rango.
  - `grass-config`: defaults de leva y de uniforms provienen del mismo objeto.
- **Playwright:** suite existente en verde; nuevas capturas `@capture`: campo de frente, contraluz, caminata 9 s (sin hojas flotantes/borde), primer plano (sin tiras planas).
- **Verificación visual** en cada paso comparando contra capturas del pasto actual.

## 8. Orden de implementación

1. Geometría de hoja + layout (tests).
2. Compute de colocación + anillo cercano con color plano (verificar grilla anclada al caminar).
3. Forma: Bezier, ancho, ensanchado de canto, normales redondeadas.
4. Viento + rigidez, matas Voronoi, pisoteo.
5. Color y luz: gradiente, zonas, AO por distancia, translucidez, especular.
6. Anillo lejano + raleo + cruce + suelo con color de pasto.
7. Eliminar pasto viejo, pasada de performance, README.

## 9. Riesgos

- **Costo de vertex en Apple Silicon:** mitigado con LOD, raleo y presupuesto con recortes ordenados.
- **TRAA con hojas finas en movimiento:** puede producir ghosting; fallback `smaa` ya existe en leva.
- **Popping en cruce de anillos:** mitigado con raleo continuo por `rank` y transición suave.
- **Tipado TSL de `instancedArray.element()` y nodos de ruido:** validar con `tsc` en el paso 2 antes de construir encima.
