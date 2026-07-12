# Cloning Playbook — recreating any animation-heavy / WebGL website

The repeatable method behind this repo, generalized. Use it to recreate any
site with rich motion, scroll choreography, 3D scenes and sound — at
pixel/frame fidelity — while staying original where it matters.

---

## 0. Rules of engagement (read first, non-negotiable)

**What you may study and match:** layout, spacing, typography scale, timing,
easing curves, scroll behavior, interaction feel, rendering techniques,
shader *approaches*, information architecture. Technique is learnable.

**What you must never take:** copy/text, logos/wordmarks, client names,
images, videos, 3D models, textures, audio files, licensed fonts, or shader
*source*. Every asset ships as an ORIGINAL placeholder you created or
licensed (CC0, AI-generated, hand-made). Reference downloads live in a
gitignored `reference/` and never deploy. A public deploy with their
branding or content is plagiarism — a private study with original content is
practice.

---

## 1. The loop

Everything below serves one loop, per section:

```
CAPTURE reference → MEASURE (numbers, not vibes) → REBUILD → DIFF → repeat
```

The most common failure mode is skipping MEASURE and rebuilding from memory.
Memory produces "inspired by"; measurement produces "identical".

---

## 2. Phase A — Capture (do this completely before writing code)

Create `reference/` (gitignored) and collect:

1. **Full-page screenshots** at each breakpoint the site meaningfully
   changes (typically 360, 768, 1024, 1440, 1920). Include hover states.
2. **60fps screen recordings** of EVERY interaction, twice: once slow and
   deliberate, once at natural speed. Cover: initial load, full scroll
   top→bottom, scroll back up, every hover, every click/route change, resize.
   These recordings are your motion ground truth.
3. **The shipped bundles**: `curl` the HTML, then the hashed CSS/JS asset
   URLs found inside it. CSS = exact measurements. JS = minified but
   readable for *intent* (class names, constants, easing strings, event
   wiring survive minification).
4. **Network HAR** of a full load — reveals asset pipeline (texture formats,
   draco/ktx2, audio formats, font subsets, lazy-load order).
5. **Font identification** (WhatFont, fontsquirrel matcherator). If it's a
   licensed font, pick the closest open substitute (as this repo did with
   Aspekta) and record the substitution.
6. **Colors/tokens**: eyedropper the palette; grep the CSS for custom
   properties — most modern sites ship their design tokens as `--vars`.

Automation caveat learned here: WebGL-heavy sites may never fire `load` in
automated browsers (infinite rAF preloaders). Don't fight it — capture by
hand or ask a human for recordings. Budget zero time on headless capture of
the live site.

## 3. Phase B — Static fidelity

1. Extract the token system first: spacing unit, type scale, container
   grid, breakpoints. Encode as CSS custom properties (`tokens.css`).
   Sites built on a unit system (this reference uses an `em`-based
   `--grid-space`) collapse hundreds of magic numbers into one token.
2. Rebuild DOM semantically per section. Match the reference's structural
   *pattern* (their actual selectors are a correctness oracle when your CSS
   misbehaves).
3. **Overlay diff loop**: your build at 50% opacity over their screenshot
   (dev-only div with `background-image` + `pointer-events:none`, or a
   PerfectPixel-style extension). Iterate until edges align.

## 4. Phase C — Motion decomposition

Classify every visible motion — each class has a different implementation:

| Class | Tell | Implementation |
|---|---|---|
| Time tween | plays once on trigger, fixed duration | gsap `.to/.from` + ScrollTrigger `once` |
| Scroll scrub | reversing scroll reverses it 1:1 | ScrollTrigger `scrub`, often + pin |
| Pointer-driven | follows cursor with lag | per-frame lerp / `gsap.quickTo` |
| Physics | overshoots, collides, settles | spring or a physics engine |
| Velocity-driven | intensity tracks scroll SPEED, settles at rest | smoothed `velocity → uniform/transform` |
| Video/lottie | too organic to be code | it's a baked asset — recreate one |

Then extract numbers from the recordings:

- `ffmpeg -i rec.mp4 -vf fps=60 frames/%04d.png` and step frame-by-frame.
- **Duration** = frame count / 60. **Delay/stagger** = frame offset between
  siblings.
- **Easing**: track one element's position across frames, normalize to
  0..1/0..1, and compare the curve shape against candidates
  (`power2/3/4.out`, `expo.out`, `back.out(n)`, spring). Plot in any
  spreadsheet; the eye instantly matches the right family. Most award-site
  reveals are `power4.out`-family or springs; scrubs are linear by design.
- **Masked text reveals**: look for wrapping (`overflow:hidden` per line or
  per word) + rise + slight rotation — split-text choreography (this repo's
  `splitWords()`).
- **Pins**: during scroll the section holds while content animates =
  pinned distance. Measure in "viewports scrolled" from the recording.

## 5. Phase D — WebGL / 3D decomposition

1. **Identify the stack**: grep the JS bundle for `three`, `REVISION`,
   `pixi`, `ogl`, `curtains`, `unmute`, physics (`rapier`, `cannon`,
   `ammo`). Check `window.__THREE_DEVTOOLS__` hooks. Custom engines still
   betray structure via GLSL strings in the bundle.
2. **Spector.js capture** (browser extension) on one frame: lists every draw
   call, program, geometry, uniform values, render targets. From it read the
   *pass structure*: how many render targets, what post chain (bloom? blur?
   composite?), instancing, MSDF text, particle counts.
3. **Read shaders for intent, then write your own.** GLSL strings in a
   bundle tell you "curl noise displacement + fresnel rim + matcap". Note
   the ingredients; implement them yourself. Never paste their source.
4. **Models: recreate, never extract.** Ripping meshes from GPU buffers is
   both theft and unnecessary — placeholder geometry that matches
   silhouette/scale/material response reads identically in motion. Options:
   parametric (this repo's jack = spheres + capsules in code), Blender,
   CC0 libraries (Poly Haven), AI mesh generators. Match the MATERIAL
   (metalness/roughness/env lighting) before the mesh — material response
   is 80% of the look.
5. **DOM-tracked planes**: media that bends/ripples with scroll = WebGL
   quads synced to DOM rects, vertex-displaced by smoothed scroll velocity.
   Recognize it by content warping — CSS can't do that.
6. **Physics**: overshoot + collision + pointer flick = engine (Rapier).
   Simple overshoot alone = spring easing, don't over-engineer.

## 6. Phase E — Feel extraction (scroll/pointer physics)

The difference between 90% and 100% is here. "Feel" is three numbers per
interaction — measure them, don't guess:

1. **Input scaling** — how many px of response per wheel notch / per px of
   drag. Normalize `deltaMode` first (0=px, 1=lines ×16, 2=page ×vh).
2. **Smoothing constant τ** — responses lag input via exponential smoothing.
   Frame-rate-independent form: `x += (target - x) * (1 - exp(-dt/τ))`.
   Measure τ from a recording: after input stops, time for the remaining
   distance to shrink to 37% ≈ τ. Typical premium-site values: 0.08–0.2s.
3. **Momentum/decay** — after a flick, velocity decays `v *= exp(-dt/τv)`.
   Measure: frames from release until motion stops, and total coast
   distance.
   Plus **edge behavior**: hard clamp vs rubber-band (displacement grows
   sub-linearly past the edge, springs back on release).

Encode all of these as named tunables with a dev HUD (Tweakpane) and tune
live against the recording — see `ARCHITECTURE.md` §2.4 and the applied
protocol in `PROJECTS-FIDELITY.md`.

## 7. Phase F — Sound

- Inventory from the HAR: one-shots (hover/click variants) vs music loops
  (crossfaded per scene/section).
- Recreate originals: synthesize UI blips in Web Audio (zero-weight, this
  repo's `soundEngine.ts`) and generate original music loops. Never ship
  their files.
- Always: default OFF, unlock on first gesture, persist the toggle,
  crossfade on scene change.

## 8. Phase G — Verification

- **Side-by-side video**: their recording and yours, same viewport, played
  at 0.5× and 0.25×. Motion diffs pop instantly at quarter speed.
- **Scripted harness**: drive the smooth-scroll instance (never
  `window.scrollTo` — it fights Lenis-style libs) to fixed positions,
  screenshot, pixel-diff against goldens (`tools/verify` here).
- **Matrix**: fine + coarse pointer, 3 breakpoints, `prefers-reduced-motion`
  (every animation needs a fallback), hidden-tab resilience.
- **Perf budget**: 60fps mid-tier while scrolling (DevTools Performance:
  no long tasks in the scroll path; transforms/opacity only; DPR capped).

## 9. Tooling reference

| Need | Tool |
|---|---|
| Frame-by-frame study | ffmpeg fps extract, or DevTools screencast |
| Draw-call/GPU inspection | Spector.js |
| Detect libs in a bundle | grep bundle for signatures; Wappalyzer |
| Pixel overlay diff | PerfectPixel-class extension, or opacity overlay div |
| Easing identification | frame plot vs gsap ease curves (gsap ease visualizer) |
| Screenshot diffing | pixelmatch / odiff in a node script |
| Live constant tuning | Tweakpane / lil-gui (dev only) |
| Font ID | WhatFont, Matcherator |
| GPU tiering | detect-gpu |
| Asset pipeline recon | Network HAR, gltf.report (for YOUR OWN glbs) |

## 10. Build order heuristic

Per site: tokens → static layout (all breakpoints) → scroll skeleton (Lenis
+ triggers with placeholder boxes) → per-section motion → WebGL scenes →
routing/transitions → sound → feel-tuning pass → verification matrix.

Per section, the template this repo converged on:
one `ui/<section>.ts` + one `styles/<section>.css`, reusing shared tokens /
split-text / scroll infra; every animation with a reduced-motion fallback;
constants in tunables; verified against the recording before moving on.
