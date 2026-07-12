# Architecture — CTO brief (2026-07-03)

Target architecture for taking this recreation from "very good" to
pixel-perfect, and for growing it into two apps (main site + labs subdomain)
without a rewrite. Read `AI-README.md` first; this doc assumes it.

---

## 1. Honest assessment of the status quo

### What is already right (keep, do not churn)

- **Per-section module pairs** (`src/ui/<section>.ts` + `src/styles/<section>.css`)
  — clear ownership, cheap to reason about.
- **Shared infra actually shared**: `.cta-pill`, `--grid-space` tokens,
  `splitWords()`, one Lenis+ScrollTrigger clock in `src/ui/scroll.ts`.
- **Strict TS, green `tsc && vite build`**, explicit export types.
- **`shared/projects.ts` data contract** consumed by both frontend and the
  hardened Express backend (zod, rate limits, envelopes).
- **Reduced-motion invariant** on every animation.
- **Route-aware detail layer** with History routing + transition wipe.

### The five structural gaps (why "perfect" is currently out of reach)

1. **Three independent WebGL canvases** (`HeroScene`, `TunnelScene`,
   `endConfetti`) each with their own renderer/loop. The reference runs ONE
   persistent canvas the whole session; scenes hand off by morphing, and DOM
   media (featured tiles, gallery items) are WebGL planes that bend/ripple
   with scroll velocity. Our featured "bend" is a CSS `skewY` approximation
   (`featured.ts` → `setupScrollBend`) — this is the single most visible
   fidelity gap on scroll.
2. **Interaction constants are scattered inline** (`0.035`, `0.12`, lerp
   factors in `projectDetail.ts` → `attachInteractions`). Tuning "feel"
   requires an edit-reload loop instead of a live HUD, so constants converge
   to "close enough", never "identical".
3. **No app-level state machine.** Router, detail layer, sound, scroll-lock
   coordinate through ad-hoc callbacks. Every new global state (menu open,
   labs, deep-link boot) multiplies the edges.
4. **No quality-tier system.** No GPU detection, no DPR policy, no central
   place where mobile/low-end trade-offs live.
5. **Verification is ad-hoc.** `harness/` (untracked) proved its worth for
   the next-project scroll; it should be a first-class, repeatable tool.

---

## 2. Target architecture

### 2.1 Layer model

```
apps/
  site/                    ← today's src/ (the lusion.co recreation)
  labs/                    ← the labs.lusion.co recreation (new)
packages/
  core/                    ← clock, viewport, quality tiers, tunables, prefs
  motion/                  ← lenis+ScrollTrigger wiring, splitWords, easings
  webgl/                   ← renderer, SceneManager, scene modules, materials
  ui-kit/                  ← tokens.css, components.css (.cta-pill), fonts
server/                    ← unchanged (Express API)
shared/                    ← data contracts (projects, experiments)
tools/
  verify/                  ← scripted browser harness + screenshot diffing
```

Dependency rule (enforced by review, later by `dependency-cruiser`):
`apps → packages → (nothing)`. Packages never import from apps. `shared/` is
type-only + data, importable by everything including `server/`.

Migrate with **npm workspaces** (`"workspaces": ["apps/*", "packages/*"]`).
No new tooling (no turbo/nx) until two apps actually exist and hurt.

### 2.2 The persistent canvas + SceneManager (the big milestone)

One `WebGLRenderer`, one `<canvas id="gl">` fixed behind the DOM, one rAF
(gsap ticker — already the single clock). Scenes become modules:

```ts
// packages/webgl/src/scene.ts
export interface SceneModule {
  id: 'hero' | 'tunnel' | 'confetti' | 'featured-planes';
  init(ctx: GLContext): Promise<void>;      // compile, alloc — during preloader
  enter(from: SceneModule | null): void;     // morph choreography in
  exit(to: SceneModule | null): void;        // morph choreography out
  update(dt: number, scroll: ScrollState): void;
  resize(v: Viewport): void;
  dispose(): void;
}
```

- `SceneManager` owns which modules are **active** (several can render at
  once during a morph), z-order, and shared resources (env maps, common
  geometries, the postprocessing chain).
- **DOM-tracked planes**: a `TrackedPlane` helper syncs a WebGL quad to a DOM
  rect every frame (`getBoundingClientRect` cached + scroll offset). This is
  how featured tiles and detail-gallery media become real WebGL planes with a
  vertex-bend shader driven by scroll velocity — replacing the CSS skew.
- Scroll state is sampled ONCE per frame from Lenis and passed down; scenes
  never read `window.scrollY` themselves.

### 2.3 App state machine

A ~60-line FSM, not a library:

```ts
type AppState = 'boot' | 'home' | 'project' | 'menu';
// transitions declare: allowed targets, scene handoff, sound scene,
// scroll lock, and which DOM root is inert.
```

Router maps URL → target state; the FSM executes the transition (calls
`transition.play`, `detail.open/close`, `sound.setScene`, Lenis stop/start,
`is-project-details-active` class). Everything that today lives in router
callbacks moves here; router becomes pure URL↔state mapping. This is the
seam that later absorbs "labs" and "menu" without touching existing states.

### 2.4 Tunables registry + dev HUD (the perfectionism engine)

Every feel constant moves into one typed registry per domain:

```ts
// packages/core/src/tunables.ts
export const FEEL = tunable('projectGallery', {
  wheelScale: 1.0,        // multiplier on normalized wheel px
  smoothTau: 0.12,        // s — exp smoothing time constant
  dragScale: 1.6,
  flickTauV: 0.6,         // s — momentum decay
  edgeResistance: 0.35,
  nextFillPerPx: 1 / 900, // deliberate scroll-to-next
  nextDrainTau: 0.25,
  itemRevealAt: 0.85,     // fraction of viewport
});
```

In dev builds only, `tunable()` auto-registers a Tweakpane folder
(lazy-imported, tree-shaken from prod). Tuning session = user scrolls the
real site on one monitor, ours on the other, drags sliders until identical,
then the final numbers are committed. This converts fidelity from guesswork
into measurement (protocol: `PROJECTS-FIDELITY.md`).

### 2.5 Quality tiers

`packages/core/quality.ts`: `detect-gpu` + `devicePixelRatio` cap + input
type (coarse/fine) + `prefers-reduced-motion` → one frozen `Quality` object
(`tier: 'high' | 'mid' | 'low' | 'static'`) resolved before first render.
Scenes and tunables read it; nobody else media-queries ad-hoc.

### 2.6 Verification as a tool, not a ritual

Promote `harness/` → `tools/verify/`:

- `scenarios/*.mjs` — named, scripted user journeys (drive Lenis, pointer
  gestures, waits) producing screenshots into a gitignored `shots/`.
- `diff.mjs` — pixelmatch against `golden/` (committed, small, jpg).
- npm scripts: `verify:projects`, `verify:home`, `verify:all`.
- Keeps the hard-won rules baked in (drive via `window.__lenis.scrollTo`,
  foreground-tab requirement, gsap manual tick fallback).

---

## 3. Migration plan (phases, each independently shippable)

| # | Phase | Contents | DoD |
|---|-------|----------|-----|
| 0 | **Tunables + HUD** | Extract all feel constants from `featured.ts`, `projectDetail.ts` into registries; Tweakpane dev HUD | Sliders change feel live; prod bundle unchanged size ±2KB |
| 1 | **Verify tool** | `harness/` → `tools/verify` with scenarios + pixel diff; commit goldens | `npm run verify:projects` passes locally |
| 2 | **Feel fidelity** | Run the `PROJECTS-FIDELITY.md` protocol with user-captured reference recordings; commit tuned constants | Side-by-side video indistinguishable at 0.5× |
| 3 | **App FSM** | Introduce state machine; router/detail/sound/scroll-lock rewired through it | All existing flows green in verify tool |
| 4 | **Workspaces** | Split `packages/{core,motion,webgl,ui-kit}`; `src/` → `apps/site` | `npm run build` green for site; imports via package names |
| 5 | **Persistent canvas** | SceneManager; migrate hero → tunnel → confetti; then featured tiles + detail gallery as TrackedPlanes with bend shader | One canvas in DOM; scroll-bend is WebGL; 60fps mid-tier |
| 6 | **Labs app** | `apps/labs` per `LABS-CLONE-PLAN.md` | labs dev server runs; landing matches captures |

Order rationale: 0–2 deliver the user-visible "perfectionism" fastest and
de-risk everything later (you can't verify a refactor without the harness).
3–4 are pure structure. 5 is the fidelity endgame. 6 rides on 4's rails.

---

## 4. Conventions (delta on top of existing ones)

- New feel constants NEVER inline — always through the tunables registry.
- Scenes: `dispose()` must release geometry/material/texture (pattern already
  in HeroScene after the review pass — keep that bar).
- Every scene/system reads time as `dt` from the ticker — no `Date.now()`
  deltas, no second rAF loops.
- DOM reads (`getBoundingClientRect`) batched in resize/scroll handlers that
  cache — never inside per-frame update paths.
- `packages/*` are framework-free vanilla TS. No React/Vue anywhere — the
  DOM-first + vanilla three approach matches the reference's architecture
  and keeps the bundle honest.
