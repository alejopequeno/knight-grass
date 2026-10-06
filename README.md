

https://github.com/user-attachments/assets/c89b6a6d-cc41-4889-9a74-ed5b45e59b49


# walk-grass

Third-person walk through an endless field of grass at blue hour. React Three Fiber on **WebGPU** with **TSL** shaders, Rapier physics and a Mixamo paladin.

**Requires WebGPU** — desktop Chrome/Edge, or Safari 26+. Other browsers get an explanatory screen instead of the scene.

## Run

```sh
pnpm install
pnpm dev       # http://localhost:5173
pnpm test      # vitest (jsdom) — animator, terrain, PRNG, grass layout/geometry/config, WebGPU detection, renderer factory, LUT
pnpm e2e       # Playwright (headed Chromium with WebGPU) — boot, keyboard, resize, gate, fps
pnpm capture   # Playwright — writes review screenshots to test-artifacts/
pnpm lint
pnpm build
```

## Controls

| Action | Keyboard | Mouse |
| --- | --- | --- |
| Move | `W` `A` `S` `D` / arrows | |
| Run | `Shift` | |
| Jump | `Space` | |
| Attack | `F` | Left button (while pointer is locked) |
| Block | `Q` | Right button (while pointer is locked) |
| Look | `J` `L` (yaw), `I` `K` (pitch) | Click the scene to lock the pointer, `Esc` to release |

## Story

A short guided story: the fireflies are the souls of the paladin's fallen order. Their phrases burn into the world above each place as MSDF text ([lettra](https://lettra.joyco.studio), wipe dissolve with an ember front), the paladin answers with a scrambling subtitle above his head, zone banners wipe in on the horizon, and between beats the fireflies form a trail to the edge of the next place: Sir Fabroos' tomb, a stone circle and the order's blue banner (emblem stamped by the cloth shader, from `scripts/textures/order-emblem.svg` via `node scripts/textures/rasterize-emblem.mjs`) waving in the wind, each a solid prop (convex-hull colliders) in a grass clearing. A zone title, when a beat has one, plays alone before its phrase. On arrival the camera cuts to a cinematic long-lens shot that frames both the paladin and the place.

While the story talks the paladin cannot move (free again on the trail and as soon as the last reply fades); the camera is free except while a place is framed by the cinematic shot. Lines advance on their own, nothing is saved (every load starts over), and every line is mirrored to an `aria-live` region.

- `src/story/` — beats as data (`story-script.ts`), a pure state machine (`story-machine.ts`), the per-frame director, the live region and the props.
- `src/text/` — Cinzel font loading and lettra text meshes (phrase, reply, banner) and the ember-edge effect.
- Font bake: `scripts/fonts/charset-latin-es.txt` + Cinzel (static instance via fontTools) → `npx -p msdf-bmfont-xml msdf-bmfont -f json -i charset-latin-es.txt -s 64 -r 8 -p 2 -t msdf --smart-size cinzel.ttf` → `public/fonts/cinzel.{json,png}`.
- Props: `python3 scripts/blender/send.py scripts/blender/compose-{tomb,stones,standard}.py` with Blender open and the MCP addon connected (port 9876, Poly Haven enabled); each builds its prop from Poly Haven assets in a throwaway scene and exports `public/models/props/*.glb`. `cleanup-imports.py` purges the leftover datablocks.

## Layout

- `src/renderer/` — WebGPU detection and gate, async `WebGPURenderer` factory (init failure + device-lost reporting), `RenderPipeline` post-processing (bloom, TRAA, procedural blue-hour LUT, vignette, film grain — grain is off for `prefers-reduced-motion`).
- `src/atmosphere/` — single source of truth for atmospheric uniforms (`atmosphere.ts`), terrain-relative height fog as `scene.fogNode`, `SkyMesh`, moon/sun lights, TSL stars, compute-shader fireflies, moon rim light on the paladin.
- `src/grass/` — compute-driven grass blades in the style of *Ghost of Tsushima*: two LOD rings (±15 m with 6-segment blades, ±60 m with 2-segment blades) on a world-anchored grid, Voronoi clumps, domain-warped noise wind with per-blade stiffness, trample, density thinning with width compensation, rounded normals, edge-on widening and backlit translucency. The ground shares the grass albedo so the field reads continuous to the horizon.
- `src/scene/` — character (Rapier body + input), paladin model and its framework-agnostic animator, ground, follow camera.
- `src/audio/` — ambient wind plus one-shot footsteps: each foot plant is detected from the animated ankle height (adaptive baseline + hysteresis) and plays a random sliced sample, louder and slightly faster when running.
- Body contact: `src/lib/character-capsules.ts` turns leg, foot and torso bones into capsules every frame; the grass compute pushes blades out of them and fireflies slide around them.
- `src/lib/` — terrain octave table (CPU function + TSL node from the same data), seeded PRNG, shared GPU uniforms, world bounds, load status, frame-delta clamp.

Tweaks live in hidden `leva` panels (`<Leva hidden />` in `App.tsx`); flip `hidden` to tune them live.

## Notes

- Anti-aliasing defaults to TRAA; no ghosting was visible on the grass blades, even mid-turn. Switch the `post › antiAliasing` leva control to `smaa` if it shows up on your hardware.
- Measured performance: ~120 fps (display-capped) walking at dpr 1.5 on an Apple Silicon Mac, with ~630k grass blades.
