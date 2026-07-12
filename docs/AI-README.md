# AI-README — the main brief (read this first, read the rest on demand)

This is the one file every AI session reads before starting. It exists so a
fresh agent gets smart fast without re-deriving the project. Deeper docs are
linked per topic — open only the one your task needs.

## What this project is

A **pixel-faithful recreation of https://lusion.co** built with Vite +
TypeScript + three.js + Rapier (physics) + GSAP/ScrollTrigger + Lenis.
Fidelity to the real site's layout, motion, scroll, hover and click behavior
is the whole point. All copy, project names, and media are ORIGINAL
placeholders — never ship lusion's text, client list, or assets.

## Current state (2026-06-11)

ALL page sections are built and browser-verified: preloader → hero (physics
jacks) → showreel (video plays) → featured (6 tiles, real posters,
hover-to-play) → goal (manifesto + photo frames) → tunnel (400vh scroll zone:
page goes black, gem scene + title scrub) → end (two-line CTA + confetti
field) → footer → scroll-nav. Video overlay plays from the reel watch button.
`npm run build` is green.

The showreel was rebuilt (2026-06-11) from a live frame-by-frame study of
lusion.co: one continuous ribbon draws across the whole section (left edge →
behind title → loop around the thumb → out the right edge), and the video
morphs from a 5-column blue-duotone thumb to the full-width 1728:680 frame
with a "PLAY ▶ REEL" overlay and a ~1-viewport pinned hold. Details + gotchas
in `../HANDOFF.md` §5 ("The video morph").

The big remaining milestone: full scene-morph choreography through the tunnel
zone + a persistent single canvas (see roadmap in `../HANDOFF.md` §7).

Production-hardening pass (2026-07-12): full browser QA + fix sweep landed.
Fixed: router navigation races (dedupe vs in-flight target, unwedgeable
queue), menu inert-lock while a project is open, both newsletter forms now
POST /api/newsletter (pending/error states), menu links navigate (anchors via
Lenis, router-aware when a project is open), tunnel title choreography
(brisk rise, derived drift start), broken Aeonik @font-face removed, head
meta/favicon/OG added, reel double-fetch fixed, hero rAF now
IntersectionObserver-gated, THREE.Clock→Timer + PCFShadowMap, project-page
header/meta/close-button/services-column layout, mobile header fit. Verify
with `node harness/qa-*.mjs` scripts (see memory + harness/). Known accepted
noise: upstream Rapier init warning, Chromium video-preload ERR_ABORTED.
Deferred: rapier3d-compat inlines ~1.6MB WASM into the lazy HeroScene chunk
(847KB gzip) — consider @dimforge/rapier3d (real .wasm) later.

Round 2 (2026-07-12): project overscroll matched to reference (footer bar-only
fill, idle auto-decay — 900ms gate / 1.4s drain, per-tick step clamped for
hitchy frames — advance only at full), back-btn hover z-order/color fixed,
launch CTAs are real links (northwind → '/' via router), html/body
overflow-x: clip, wide-viewport meta clearance em-derived, end-section strokes
are true underlines (root cause: #end-title inline box with block children),
confetti keepout got a tapered size buffer. Analytics tracking plan designed
in .telemetry/ (7 events, greenfield delta).

Active workstream (2026-07-03): a CTO plan now governs the endgame —
`ARCHITECTURE.md` (target architecture + 7-phase migration),
`PROJECTS-FIDELITY.md` (measured protocol to make the projects/scrolling
feel identical), and `LABS-CLONE-PLAN.md` (second app: labs.lusion.co
recreation, recon-first). Start there before new feature work.

## Where things live

- `../HANDOFF.md` — THE detailed source of truth: per-section measurements,
  file map, roadmap, gotchas. Read the section relevant to your task.
- `../reference/` — the real site's extracted CSS/DOM (measurement ground
  truth; gitignored, never ship it).
- `src/styles/*.css` + `src/ui/*.ts` — one pair per section. `src/scene/*` —
  WebGL scenes. Shared infra you MUST reuse: `.cta-pill` (components.css),
  `--grid-space` token, `splitWords()/splitChars()`, `src/ui/scroll.ts`
  (Lenis + ScrollTrigger; exposes `window.__lenis` in dev).

## Hard-won rules (cheap to read, expensive to relearn)

1. GateGuard hook intercepts the FIRST Edit/Write per file — retry the
   identical call once.
2. `window.scrollTo` does NOT drive ScrollTrigger — use
   `window.__lenis.scrollTo(y, { immediate: true })`.
3. Never wait on live lusion.co in an automated browser (6+ min, never
   finishes). Ask the user to paste screenshots.
4. Hidden/occluded Chrome tab = rAF fully suspended (gsap freezes, preloader
   sits at 100, screenshots time out). Not a bug. Fixes in
   `verification-playbook.md`.
5. Every animation needs a `prefers-reduced-motion` fallback.
6. Boot always restarts at top; `ScrollTrigger.refresh()` runs once after the
   preloader clears — do not remove either (see HANDOFF §10).
7. `#scroll-nav` must stay the last element on the page.

## Topic docs (open on demand)

- `ARCHITECTURE.md` — CTO brief: status-quo assessment, target architecture
  (persistent canvas + SceneManager, app FSM, tunables+HUD, quality tiers,
  workspaces), 7-phase migration plan. Read before structural work.
- `PROJECTS-FIDELITY.md` — the working protocol to make the featured section
  + project-detail scrolling identical to the reference (code map, deviation
  checklist, measurement method, tunables refactor, harness promotion).
- `LABS-CLONE-PLAN.md` — labs.lusion.co recreation: recon checklist (blocking),
  workspace/deployment architecture, original-demos content strategy.
- `CLONING-PLAYBOOK.md` — the generalized method for cloning ANY
  animation/WebGL-heavy site (capture → measure → rebuild → diff), incl. the
  IP rules of engagement.
- `LIBRARIES.md` — curated stack: what's installed and why, what to add per
  phase, asset pipeline, what we deliberately avoid.
- `project-details-spec.md` — the original build spec for the /projects/<slug>
  detail layer (DOM contract, module interfaces, backend spec).
- `agent-briefing.md` — how to brief subagents/builders on this repo (the
  reusable preamble, output contract, parallelization rules).
- `verification-playbook.md` — how to actually verify in the browser
  (Lenis driving, hidden-tab workarounds, CDP screenshot quirks).
- `media-credits.md` — where the placeholder media came from, licenses, and
  how to swap files.
