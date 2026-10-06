# walk-grass — Historia guiada por luciérnagas (lettra)

Fecha: 2026-10-06 · Estado: aprobado en chat, pendiente revisión escrita

## 1. Objetivo

Darle a la demo una narrativa corta y melancólica estilo Dark Souls / Elden Ring: las luciérnagas son las almas de la orden caída del paladín. **Escriben frases en el aire** (se juntan sobre la forma de las letras y el texto se enciende con lettra), el **paladín responde** con un subtítulo diegético sobre su cabeza, aparecen **carteles de zona** en el horizonte, y entre momentos las luciérnagas **guían** hacia el próximo punto.

### Criterios de éxito

1. Las 4 frases de las luciérnagas se leen claramente, formadas en el lugar donde ellas se juntan.
2. Cada respuesta del paladín aparece sobre su cabeza con decodificación `scramble`, legible.
3. Los carteles de zona aparecen en el horizonte con disolución de tinta (`wipe`).
4. Entre momentos, un hilo de luciérnagas indica la dirección del próximo punto y se reorienta si el jugador se desvía.
5. Diálogo híbrido: avanza solo con ritmo cinematográfico; `E`/`Enter` adelanta la línea actual.
6. Todo texto mostrado en el canvas se refleja en una región `aria-live` del DOM.
7. Sin regresiones: lint, unit, tsc, build, e2e en verde; 60 fps a dpr 1.5 (enchufado).

### Fuera de alcance

Voces/audio de diálogo, guardado de progreso, ramificaciones, traducción a otros idiomas, edición del guion en runtime. Commits (todo local).

## 2. Guion (español)

| # | Punto (prop) | Cartel | Luciérnagas | Paladín |
| --- | --- | --- | --- | --- |
| 0 | Inicio (spawn) | LLANURA DE LOS CAÍDOS | Volviste. | No creí que quedara alguien. |
| 0b | — | — | Síguenos. | — |
| 1 | ~40 m: escudo roto clavado | — | Aquí cayó Aldric. | Me cubrió hasta el final. |
| 2 | ~80 m, cresta: círculo de piedras rotas | LA COLINA DEL JURAMENTO | ¿Recuerdas el juramento? | Proteger a quien no puede alzar la espada. |
| 3 | ~120 m: espada clavada en roca, luz suave | — | Tu espada te espera. | Entonces esto no ha terminado. |
| fin | — | — | (suben al cielo y se suman a las estrellas) | — |

Los puntos se ubican sobre el terreno (dentro del suelo de 400 m, lejos del borde) siguiendo una línea con leve curva desde el spawn.

## 3. Enfoque

**Híbrido:** las luciérnagas (compute) vuelan a puntos muestreados dentro de las letras de la frase; cuando llegan, el texto lettra emisivo se revela en ese mismo lugar con `wipeIn` y bloom; al terminar se consume con `wipeOut` y las luciérnagas se liberan en modo guía. Descartados: solo partículas (ilegible con pocas luciérnagas), solo texto (pierde la idea de que ellas escriben).

## 4. Arquitectura

```
src/story/
  story-script.ts          beats como datos
  story-machine.ts (+test) máquina de estados pura
  story-director.tsx       corre la máquina por frame; maneja textos, luciérnagas, aria-live
  story-live-region.tsx    región aria-live visualmente oculta
  story-props.tsx          props GLB + brillo de marcador en cada punto
src/text/
  text-assets.ts           fuente horneada (atlas + JSON) vía use()
  glyph-points.ts (+test)  layout lettra + atlas → N puntos dentro de las letras
  firefly-text.tsx         frase de luciérnagas (lettra emisivo, wipe in/out)
  reply-text.tsx           respuesta del paladín (billboard, scramble)
  zone-banner.tsx          cartel de zona en el horizonte (wipe)
src/atmosphere/fireflies.tsx  + buffer de destinos y modos free / form / trail
```

### Máquina de estados (por beat)

`waiting` (lejos del punto) → `gathering` (luciérnagas vuelan a la forma de la frase) → `line` (texto revelado, sostenido) → `dissolving` → `pause` → `reply` (respuesta del paladín) → `guiding` (hilo al próximo punto) → siguiente beat. El beat 0 dispara al cargar; los demás al entrar a ≤ 4 m de su punto. `E`/`Enter` termina la espera de `line` o `reply` en curso. Al terminar el último beat: `finale` (luciérnagas suben) → `done`.

Entradas por frame: posición del jugador, delta, `advancePressed`. Salidas: fase, textos activos, modo y destinos de luciérnagas, progreso de tweens. Pura y testeable (sin three ni React).

### Luciérnagas

- Cantidad ~800.
- Buffer `targets` (vec4: xyz destino, w = peso 0..1) + uniform `mode`.
- **free**: comportamiento actual (deriva, wrap, banda de altura, esquivan cápsulas).
- **form**: cada luciérnaga interpola hacia su destino (puntos dentro de las letras, plano orientado a la cámara frente al jugador a la altura de la vista); las sobrantes siguen libres.
- **trail**: destinos repartidos a lo largo de una curva desde el jugador hacia el próximo punto, con oscilación suave.
- Siempre empujadas fuera de las cápsulas del cuerpo.

### Texto (lettra)

- Fuente **Cinzel** (OFL) horneada con `msdf-bmfont -f json -s 64 -r 8 -p 2 -t msdf --smart-size`, charset latin-es (ASCII + áéíóúüñÁÉÍÓÚÜÑ¿¡—–“”‘’). Atlas en una sola página; fuente estática para conservar kerning.
- **Frase de luciérnagas**: plano frente a la cámara a ~6 m adelante del jugador; color cálido emisivo (> 1 HDR para bloom); `wipe()`.
- **Respuesta del paladín**: billboard sobre la cabeza (~2.2 m), color pálido, `scramble()` decodificando (`scramble` 1 → 0).
- **Cartel de zona**: grande, en la dirección del horizonte frente a la cámara, `wipe()` lento; `fog: false`.
- Los textos de lettra son transparentes y sin depthWrite (default).

### Guía visual de los puntos

Cada punto tiene su prop GLB y un brillo tenue (sprite emisivo) visible a distancia.

### Props (Blender)

Modelados por el socket del addon de Blender (puerto 9876): escudo roto, círculo de piedras, espada en roca. Low-poly sobrio, materiales simples, exportados a `public/models/props/*.glb`, cargados con `GLTFLoader`. Escala y origen en la base para apoyarlos sobre `terrainHeight`.

### Teclado

`E` y `Enter` → `advancePressed` (disparo único, respetando el foco en controles como ya hace `Space`). Se agrega al HUD.

### Accesibilidad

`story-live-region.tsx`: `role="status"` / `aria-live="polite"`, visualmente oculto; recibe cada frase y respuesta en orden ("Luciérnagas: …", "Paladín: …") y cada cartel. Respeta `prefers-reduced-motion`: el scramble se reemplaza por fade y los wipes duran menos.

### Dependencias

- `three` y `@types/three` → 0.185 (peer de lettra); correr toda la suite tras la actualización.
- `lettra@^0.2.0`.

## 5. Testing

- **Vitest**: `story-machine` (beat 0 al inicio, disparo por distancia, `advance` acorta `line`/`reply`, orden de beats, `finale` y `done`), `glyph-points` (puntos dentro de glifos, cantidad estable, determinista con seed), validación del guion (cada frase solo usa caracteres del charset horneado; puntos dentro del suelo).
- **Playwright**: tras cargar, la región `aria-live` contiene "Volviste."; `E` avanza a la respuesta; sin errores de consola. Capturas `@capture` de formación de frase, respuesta y cartel.
- Verificación visual de legibilidad en cada paso.

## 6. Orden de implementación

1. Actualizar three a 0.185 (+ suite completa) y agregar lettra; hornear Cinzel.
2. `story-script` + `story-machine` (tests).
3. Texto lettra: `text-assets`, `firefly-text`, `reply-text`, `zone-banner` (con un beat fijo para verlos).
4. `glyph-points` (tests) + modos de luciérnagas (free/form/trail).
5. `story-director` + `story-live-region` + teclado `E`/`Enter`.
6. Props en Blender + `story-props` + marcadores.
7. Pulido de ritmo, reduced motion, capturas, performance, README.

## 7. Riesgos

- **Actualización de three** puede romper APIs TSL usadas por el pasto/post: se valida con la suite completa y capturas antes de seguir.
- **Legibilidad de las frases** con bloom/niebla: el texto lettra lleva la lectura; las luciérnagas aportan la magia.
- **TRAA con texto en movimiento** (billboard): posible ghosting; mitigación SMAA si aparece.
- **Blender por socket**: si falla la conexión, props procedurales en three como respaldo.
