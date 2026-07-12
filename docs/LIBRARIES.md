# Libraries — the curated stack (2026-07-03)

What we use, what to add, and what to deliberately avoid. Optimized for
lusion-class work: DOM-first sites with heavy WebGL, scroll choreography and
physics. Vanilla TS everywhere — no UI framework (see ARCHITECTURE.md §4).

---

## 1. Core (installed, correct — keep)

| Library | Role | Notes |
|---|---|---|
| `three` | WebGL scenes | The industry default for this class of site. Vanilla (no R3F) matches our DOM-first architecture. |
| `gsap` + ScrollTrigger | All DOM motion + the single ticker | Since GSAP 3.13 the ENTIRE plugin suite is free (Webflow acquisition) — SplitText, DrawSVG, MorphSVG, ScrambleText, CustomEase included. |
| `lenis` | Smooth scroll | De-facto standard; already wired into the gsap ticker (one clock). |
| `@dimforge/rapier3d-compat` | Physics (hero jacks) | Rust/WASM, deterministic, best perf-per-watt of the JS-usable engines. |
| `zod` | API validation | Server-side input guard. |
| `express` | API server | Fine at this scale. |

Upgrade note: our custom `splitWords()` works and is tuned — keep it. If a
future section needs per-line splits with resize re-splitting, switch to
official `SplitText` (now free) rather than growing our own.

## 2. Add now (directly unblocks the perfectionism work)

| Library | Why | Where |
|---|---|---|
| `tweakpane` | Dev HUD for live-tuning feel constants against the reference recording. Dynamic-imported in dev only. | ARCHITECTURE §2.4, PROJECTS-FIDELITY protocol |
| `stats-gl` | GPU+CPU frame timing overlay (better than stats.js — measures GPU). Dev only. | perf budget checks |
| `pixelmatch` (dev) | Screenshot diffing in `tools/verify`. | verification harness |
| `detect-gpu` | Quality-tier resolution at boot. | ARCHITECTURE §2.5 |

## 3. Add when the persistent-canvas milestone starts

| Library | Why |
|---|---|
| `postprocessing` (pmndrs) | The post chain (bloom, chromatic aberration, vignette) — merges passes into fewer fullscreen ops than three's stock EffectComposer; noticeably faster on mid GPUs. |
| `vite-plugin-glsl` | `#include` chunks + syntax-highlighted `.glsl` files instead of template strings. |
| `three-mesh-bvh` | Accelerated raycasts once pointer-interactive meshes multiply (featured planes, labs demos). |
| `troika-three-text` | SDF text in WebGL if/when titles need to live inside the canvas (tunnel titles, labs). Crisp at any scale, no texture atlases to bake. |

## 4. Asset pipeline (CLI, not runtime deps)

| Tool | Use |
|---|---|
| `@gltf-transform/cli` | One-stop glb optimization: `gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress ktx2`. Run on every model before it enters `public/`. |
| KTX2/BasisU textures | GPU-native compressed textures — 4-8× VRAM savings vs jpg/png uploads; three loads via `KTX2Loader`. |
| meshopt / Draco | Geometry compression (meshopt preferred: faster decode, no wasm stall). |
| `ffmpeg` | Poster extraction, mp4 (h264, `-movflags +faststart`) + webm variants; the frame-dump workflow in CLONING-PLAYBOOK §4. |
| `sharp` script | Batch-resize/avif/webp for images. |

Placeholder asset creation (keep everything original — see playbook §0):
Blender (hand-made), Poly Haven / ambientCG (CC0 textures & HDRIs), AI
generators for original meshes/images/music where speed matters. UI SFX stay
synthesized in Web Audio (`soundEngine.ts`) — zero bytes, fully ours.

## 5. Dev-only / recon

| Tool | Use |
|---|---|
| Spector.js (extension) | Frame capture of any WebGL site — draw calls, programs, uniforms, render targets (playbook §5). |
| gsap ease visualizer | Matching recorded curves to named eases. |
| gltf.report | Inspecting OUR OWN glb sizes/structure. |

## 6. Deliberately NOT using (and why)

| Candidate | Verdict |
|---|---|
| React / react-three-fiber | Wrong tool here: the site is DOM-first with imperative per-frame work; R3F's reconciler adds a layer between us and the frame loop, and the reference-class studios ship vanilla. Revisit only if the app grows real UI state (dashboards, CMS). |
| `@studio-freight/hamo` etc. | Lenis alone + our own helpers cover it. |
| howler.js | Our Web Audio engine is smaller, synthesized, and already crossfades scenes. |
| Ammo/Cannon | Rapier is strictly better maintained/faster. |
| Theatre.js | Powerful choreography IDE, but our motion is scroll-scrubbed + code-driven; the tunables HUD covers the tuning need with far less machinery. Revisit for labs demos with long authored timelines. |
| Astro/Next | The reference itself is Astro, but a second framework buys us nothing at this scale — Vite MPA/workspaces handle site+labs (LABS-CLONE-PLAN §3). |

## 7. Watch list (not yet, but soon)

- **three WebGPURenderer + TSL** — labs-class experiments increasingly ship
  WebGPU (compute particles, fluid sims). When we build `apps/labs`
  showpieces, prototype one demo on WebGPURenderer with WebGL fallback; TSL
  node materials compile to both backends.
- **View Transitions API** — could eventually replace part of the canvas
  route wipe on chromium; keep our canvas transition as the primary.
- **`scroll-driven-animations` CSS** — native scrubbing for simple cases;
  ScrollTrigger stays the orchestrator.
