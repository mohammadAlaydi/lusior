# Project-Details Section — Build Spec (single source of truth)

This is the brief for the faithful rebuild of lusion.co's **project detail page**
(`/projects/<slug>`). Every build agent reads this first. Ground-truth
measurements come from the real shipped stylesheet, extracted to
`reference/project-details-extracted.css` (read it — do not guess values).

> Fidelity rule (unchanged for this repo): match the reference's **layout,
> motion, sound design, colour treatment and scroll behaviour EXACTLY**, but all
> copy, project names, palettes, media and audio are **ORIGINAL placeholders** —
> never ship lusion's text/assets. Data lives in `shared/projects.ts`.

---

## 1. What the real page is (verified from the bundle)

A full-screen, **per-project themed** layer (`#project-details`, `position:absolute`,
`height:100vh`, `z-index:10`) that sits over the home page after a page-transition
wipe. Each project injects its own palette into `--project-details-*` CSS vars.

Layout:

- **Centred meta block** (`#project-details-meta`, `position:absolute; top:50%;
  width:34em; transform:translateY(-50%)`) — a classic float two-column:
  - `#project-details-left` (`float:left; width:60%`): `#project-details-title`
    (`4.5em`, `line-height:.95`) + `#project-details-desc` (`.75em`, `margin:4em 0`).
  - `#project-details-right` (`float:right; width:40%; padding-left:20%; margin-top:3em`):
    `#project-details-side-list` (`.75em`) with `.project-details-side-list-title`
    (uppercase, highlight colour) + `.project-details-side-list-item` groups; the
    2nd group wraps in `#project-details-side-list-links` (`margin-top:4em`). Below
    it the desktop `.project-details-launches` group.
- **Horizontal media gallery** (`#project-details-items-wrapper` band +
  `#project-details-items-move-container`, `white-space:nowrap`, `padding-left:48em`).
  `.project-details-item` are `inline-block; vertical-align:top; margin-left:5em`
  (first `0`, last `margin-right:10vw`). Caption blocks use
  `.project-details-item-text` (`top:50%; transform:translateY(-50%); padding:0 1.2em`).
  The container is **translated on X by scroll** — you scroll sideways through it.
  <=812px it collapses to a vertical stack (`white-space:normal`, relative).
- **Next-project preview** (`#project-details-preview`, fills the layer) with
  `#project-details-preview-title` (same `4.5em`, vertically centred) and
  `#project-details-preview-footer` (bottom-left, `14em` wide): a progress bar
  (`#project-details-preview-footer-bar` -> `-background` opacity .2 + `-inner`
  `scaleX` driven by `nextProjectRatio`) + `-text` + `-arrow`. Revealing/advancing
  this navigates to the next project.
- **Header back button** `#header-center-project-back-btn` (in `#header-center`):
  white pill, `transform:scale(0)` at rest, scales in when a project is active;
  flood child `#project-details-header-back-background` (`scaleY` hover); inner
  `-svg` / `-text` / `-svg2` shift on hover. Plus `#project-details-header-info`
  (top-right, uppercase, highlight colour — shows the project's category/year).
- `html.is-project-details-active` recolours `#header-logo`/`#logo` to the highlight
  and is the global "a project is open" flag.

Header back-btn left offsets (desktop -> wide): `left:54.5em`, then `68.5em`, then
`right:27.5em`; mobile becomes a square icon-only button at
`right:calc(base-padding-x + 4em)`. Text hidden by default
(`#header-center-project-back-btn-text{display:none}`) — keep that.

### Sound design (`AUDIO_DATA` in the bundle)
- UI SFX (one-shot, original): `hover` x3 variants (vol 1), `click` x2 (vol 1),
  `focus` x3 (vol .4), `glass_broken` (vol 1), `page` x2 (vol 1, page transitions).
  Variants are chosen round-robin/random.
- Music (looping, crossfaded by scene): `generic` (home ambient), `cinematic_0/2/3`
  (intense/tunnel, filtered), `generic_end`. Crossfade via `fadeBgMusic(id, vol)`.
- Gated by the header sound toggle (ours `#sound-btn`) and a persisted setting.
- Real assets are `.ogg` from `/assets/audios/`. We **synthesize** UI SFX in Web
  Audio (original, zero-weight) and load **AI-generated** original music loops from
  `/assets/audios/` (degrade gracefully if a music file is absent).

---

## 2. Architecture & file ownership

Single-page Vite app + a new Express/TS backend. The detail page is route-aware
(History API) so the URL becomes `/projects/<slug>`, but it is one bundle (the
layer mounts/unmounts in-page).

| Owner | Files (create/own these only) |
|---|---|
| **Backend agent** | `server/src/index.ts`, `server/src/routes.ts`, `server/src/repository.ts`, `server/src/validation.ts`, `server/src/security.ts`, `server/tsconfig.json`, `server/README.md`, `server/data/.gitkeep`. **Return as text** (do NOT edit): the exact `package.json` deps+scripts and the `vite.config.ts` `/api` proxy block. |
| **Detail-CSS agent** | `src/styles/projectDetail.css` (rewrite), `src/styles/transition.css` (new), `src/styles/projectsHeader.css` (new — back btn + header-info + `.is-project-details-active`). |
| **Detail-logic agent** | `src/ui/projectDetail.ts` (rewrite), `src/data/projects.ts` (new loader). |
| **Router+transition agent** | `src/ui/router.ts` (new), `src/ui/transition.ts` (new). |
| **Sound agent** | `src/audio/soundEngine.ts` (new). |
| **Orchestrator (main loop, NOT an agent)** | `index.html`, `src/main.ts`, `src/styles/header.css`, `package.json`, `vite.config.ts`, `tsconfig.json`. |

Shared infra to REUSE (never re-implement): `.cta-pill` mechanics (components.css),
`--grid-space`/`--grid-gap`/`--base-padding-*` tokens (tokens.css), `splitWords()`/
`splitChars()` (src/ui/splitWords.ts), Lenis+ScrollTrigger from src/ui/scroll.ts
(`window.__lenis` in dev), `gsap`. Match the surrounding code style: small focused
functions, explicit types on exports, `prefers-reduced-motion` fallback on every
animation, no `console.log` in shipped paths, immutable updates.

---

## 3. Canonical DOM skeleton (CSS agent + logic agent MUST agree)

The logic agent builds `#project-details` **innerHTML from data** at open time; the
CSS agent styles exactly these ids/classes. `index.html` only holds the empty mount
points (orchestrator adds them).

```html
<!-- mount point in index.html (orchestrator) -->
<div id="project-details" aria-hidden="true" data-lenis-prevent></div>
<canvas id="transition-overlay" aria-hidden="true"></canvas>

<!-- header cluster in index.html #header (orchestrator) -->
<div id="header-center">
  <button id="header-center-project-back-btn" aria-label="Back to projects">
    <span id="project-details-header-back-background" aria-hidden="true"></span>
    <span id="header-center-project-back-btn-svg" aria-hidden="true"><svg arrow-left/></span>
    <p id="header-center-project-back-btn-text">Back</p>
    <span id="header-center-project-back-btn-svg2" aria-hidden="true"><svg arrow-left/></span>
  </button>
</div>
<p id="project-details-header-info"><!-- "CATEGORY - YEAR", filled by logic agent --></p>
```

`#project-details` innerHTML built by the logic agent (ids/classes are contract):

```html
<div id="project-details-meta">
  <div id="project-details-left">
    <h1 id="project-details-title">{title}</h1>
    <div id="project-details-desc"><p>...</p>...</div>
  </div>
  <div id="project-details-right">
    <div id="project-details-side-list">
      <div class="project-details-side-list-group">
        <p class="project-details-side-list-title">{group.title}</p>
        <p class="project-details-side-list-item">{item}</p>... <!-- or <a> when asLinks -->
      </div>
      <div id="project-details-side-list-links">...second group...</div>
    </div>
    <div class="project-details-launches project-details-launches--desktop">
      <a class="project-details-launch-cta" href="{launch.url}">
        <span class="project-details-launch-cta-dot" aria-hidden="true"></span>
        <span class="project-details-launch-cta-text">{launch.label}</span>
        <span class="project-details-launch-cta-arrow" aria-hidden="true"><svg arrow/></span>
      </a>
      ...one link per launches[] entry
    </div>
  </div>
  <div class="project-details-launches project-details-launches--mobile">
    ...the same direct destinations for the responsive layout
  </div>
</div>

<div id="project-details-items-wrapper">
  <div id="project-details-items-move-container">
    <div class="project-details-item">...media (image/video/panel) OR a .project-details-item-text...</div>
    ...
  </div>
</div>

<div id="project-details-preview">
  <div id="project-details-preview-inner">
    <h2 id="project-details-preview-title">{nextProject.title}</h2>
    <div id="project-details-preview-footer">
      <p id="project-details-preview-footer-text">Next</p>
      <div id="project-details-preview-footer-bar">
        <div id="project-details-preview-footer-bar-background"></div>
        <div id="project-details-preview-footer-bar-inner"></div>
      </div>
      <span id="project-details-preview-footer-arrow"><svg arrow/></span>
    </div>
  </div>
</div>
```

`#project-details.has-ctas` is set when `launches[]` has entries (CSS reveals the appropriate group).
`.project-details-item` start `visibility:hidden`; logic agent reveals them as they
enter. `.project-details-launch-cta` dot floods `scale(26)` on hover (matches
extracted CSS / `.cta-pill`).

Theme injection: logic agent sets these on `#project-details` (or `:root` while
open) from `ProjectDetail.theme`:
`--project-details-bg, --project-details-bg-alt, --project-details-text,
--project-details-highlight, --project-details-btn-bg, --project-details-btn-text,
--project-details-btn-text-hover, --project-details-icon-bg, --project-details-icon-color`.
`#project-details { background: var(--project-details-bg); color: var(--project-details-text); }`.

---

## 4. Module interfaces (parallel agents code against these signatures)

```ts
// shared/projects.ts (ALREADY EXISTS — import, don't recreate)
import type { ProjectDetail, ProjectSummary, MediaItem, ApiResponse } from '../../shared/projects';

// src/data/projects.ts  (Detail-logic agent)
export async function fetchProjectList(): Promise<ProjectSummary[]>;     // GET /api/projects, fallback to PROJECTS
export async function fetchProject(slug: string): Promise<ProjectDetail | null>; // GET /api/projects/:slug, fallback to findProject

// src/audio/soundEngine.ts  (Sound agent)
export type UiSound = 'hover' | 'click' | 'focus' | 'page' | 'glass';
export type Scene = 'home' | 'project' | 'tunnel' | 'end';
export interface SoundEngine {
  unlock(): void;                 // resume AudioContext on first gesture
  toggle(): boolean;              // flips + persists; returns enabled
  setEnabled(on: boolean): void;
  isEnabled(): boolean;
  playUI(kind: UiSound): void;    // no-op when disabled/locked
  setScene(scene: Scene): void;   // crossfade looping music
}
export function createSoundEngine(opts?: { buttonId?: string }): SoundEngine; // wires #sound-btn, localStorage, auto hover/click/focus delegation

// src/ui/transition.ts  (Router+transition agent)
export interface Transition {
  // covers the screen, awaits midpoint(), then reveals. ~0.55s each half.
  play(midpoint: () => void | Promise<void>, accent?: string): Promise<void>;
}
export function createTransition(deps?: { sound?: SoundEngine }): Transition;

// src/ui/projectDetail.ts  (Detail-logic agent)
export interface ProjectDetailController {
  open(detail: ProjectDetail, opts?: { immediate?: boolean }): Promise<void>;
  close(opts?: { immediate?: boolean }): Promise<void>;
  isOpen(): boolean;
}
export function setupProjectDetail(deps: {
  sound?: SoundEngine;
  onRequestProject: (slug: string) => void; // next-project advance asks router to navigate
  onRequestClose: () => void;                // back button asks router to go home
}): ProjectDetailController;

// src/ui/router.ts  (Router+transition agent)
export interface Router { start(): void; navigate(path: string, opts?: { replace?: boolean }): void; }
export function setupRouter(deps: {
  detail: ProjectDetailController;
  transition: Transition;
  sound?: SoundEngine;
  loadProject: (slug: string) => Promise<ProjectDetail | null>;
}): Router;
```

### Orchestration contract (how the modules cooperate)
- Featured tiles use `href="/projects/<slug>"`. The router intercepts clicks on
  `a[href^="/projects/"]` (left-click, no modifier), `preventDefault`, `navigate`.
- `navigate('/projects/slug')`: `loadProject(slug)` -> `transition.play(async () => {
  await detail.open(project); document.documentElement.classList.add('is-project-details-active');
  sound.setScene('project'); }, project.accent)`; push History state.
- `navigate('/')`: `transition.play(async () => { await detail.close();
  documentElement.classList.remove('is-project-details-active'); sound.setScene('home'); })`.
- `detail` next-project advance (nextProjectRatio->1) calls `onRequestProject(nextSlug)`
  -> router.navigate. Back button calls `onRequestClose()` -> router.navigate('/').
- `sound.playUI('page')` fires at transition start. Hover/click/focus SFX are wired
  globally by the sound engine (delegated listeners on interactive elements).
- `popstate` -> router re-derives route and opens/closes without pushing.
- Page scroll: while a project is open the router/detail freezes Lenis
  (`window.__lenis?.stop()`), restores on close (`.start()`). Detail owns its own
  wheel/touch/drag -> horizontal gallery scroll.

---

## 5. Behaviours to implement (detail-logic agent)

1. **Open choreography** (after the transition covers): set theme vars; build DOM;
   `contentShowRatio` 0->1 driving: title masked rise (`splitWords`/`splitChars`),
   desc fade-up, side-list staggered fade, launch CTA fade, header-info fade,
   back-btn scale 0->1, `#project-details-header-info` text set. Honour reduced-motion
   (snap to final).
2. **Horizontal gallery scroll**: capture wheel (`deltaY+deltaX`), touch-drag and
   pointer-drag while open; map to `translateX` of `#project-details-items-move-container`,
   clamped `[0, maxScroll]` where `maxScroll = scrollWidth - viewport`. Smooth with a
   lerp/`gsap.quickTo`. Reveal `.project-details-item` (`visibility`, subtle fade/slide)
   as they enter view. Responsive layout (<=812px): native vertical scroll instead (no JS hijack).
3. **Next-project advance**: once at `maxScroll`, extra forward delta accumulates into
   `nextProjectRatio` (0->1, also draggable via the preview/footer). Drive:
   `#project-details-preview` slide-in from the right, `-bar-inner` `scaleX` =
   nextProjectRatio, dim/scale the gallery. At `>=1` call `onRequestProject(nextSlug)`
   (guard against double-fire). Scrolling back reduces it to 0.
4. **Close**: reverse content reveal or just unmount after the transition reveal;
   clear theme vars; release scroll lock.
5. **A11y**: `#project-details` `role="region"`, focus the back button on open,
   `Esc` closes (-> onRequestClose), `aria-hidden` toggled, restore focus to the
   triggering tile on close. Keyboard: arrow/Tab still reach the launch CTA + links.

Reduced-motion: no transition canvas animation (instant swap), no scroll-hijack
smoothing (use native), content appears at final state, music still optional but no
motion. Keep 60fps: animate `transform`/`opacity` only; `will-change` narrowly.

---

## 6. Backend (backend agent)

Express + TypeScript, ESM, run with `tsx`. Serves the shared data + form endpoints.
Response envelope = `ApiResponse<T>` from `shared/projects.ts`.

Endpoints:
- `GET /api/health` -> `{ success:true, data:{ status:'ok' } }`.
- `GET /api/projects` -> `{ success:true, data: projectSummaries() }`.
- `GET /api/projects/:slug` -> `findProject`; 404 envelope if missing.
- `POST /api/newsletter` -> body `{ email }`, zod-validated; persist; `{ success:true }`.
- `POST /api/contact` -> body `{ name, email, message }`, zod-validated; persist.

Requirements: CORS (dev origin `http://localhost:5173`), JSON body limit, basic
security headers (CSP-light, `X-Content-Type-Options`, `Referrer-Policy`, remove
`X-Powered-By`), a simple in-memory rate limiter on POSTs, input validation with zod
(reject + 400 envelope on bad input, never echo raw input back), explicit error
handling (no stack leaks; 500 envelope). Repository pattern: `SubmissionRepository`
interface + `FileSubmissionRepository` appending JSON lines to `server/data/*.jsonl`
(create dir if missing; never commit real data). PORT from `process.env.PORT ?? 3001`.
`server/tsconfig.json` includes `../shared`. Provide `server/README.md` (run steps).

Return (as text, for the orchestrator to apply):
- `package.json` additions: deps `express`, `cors`, `zod`; devDeps `tsx`,
  `concurrently`, `@types/express`, `@types/cors`, `@types/node`; scripts
  `"server": "tsx watch server/src/index.ts"`, `"dev:all": "concurrently -k -n web,api \"npm:dev\" \"npm:server\""`.
- `vite.config.ts` `server.proxy` block: `'/api' -> { target:'http://localhost:3001', changeOrigin:true }`.

---

## 7. Output contract (every agent)

- Implement only your owned files; do not touch `index.html`, `src/main.ts`,
  `package.json`, `vite.config.ts`, `tsconfig.json`, `src/styles/header.css`
  (return snippets for those instead).
- Read before coding: this spec, `reference/project-details-extracted.css`,
  `shared/projects.ts`, plus your relevant existing files (e.g. `src/styles/components.css`,
  `src/ui/scroll.ts`, `src/ui/splitWords.ts`, `src/styles/tokens.css`).
- Keep TypeScript strict-clean (the build is `tsc && vite build`). Explicit return
  types on exports. No `any` in app code. Handle errors. Reduced-motion fallbacks.
- **GateGuard**: your first Write/Edit to a file (and first Bash) may be intercepted
  by a "Fact-Forcing Gate". Present the short facts it lists, then **retry the
  identical call once** — it proceeds. This is expected; don't abandon the file.
- Return a concise report: files created, key decisions, any integration snippet
  (package.json/vite/main.ts/index.html lines) the orchestrator must apply, and how
  you verified it type-checks if you could.
