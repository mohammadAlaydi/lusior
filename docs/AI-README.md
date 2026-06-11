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

- `agent-briefing.md` — how to brief subagents/builders on this repo (the
  reusable preamble, output contract, parallelization rules).
- `verification-playbook.md` — how to actually verify in the browser
  (Lenis driving, hidden-tab workarounds, CDP screenshot quirks).
- `media-credits.md` — where the placeholder media came from, licenses, and
  how to swap files.
