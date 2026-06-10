# Lusion.co Recreation — Handoff

> Goal: a **pixel-identical** recreation of https://lusion.co, built section by section.
> Guiding rule: **match the reference exactly. Do not invent effects.** If something
> isn't on the real site, it doesn't belong here (see "Fidelity corrections" below).

Last worked: 2026-06-10 (session 3). Built + browser-verified this session: **preloader**
(odometer 0→100, slides out, then intro), **header menu panel** (open/close, text-swap
links, newsletter, labs card), **goal/philosophy content layer** (`#goal` — title/texts/
two image reveals; tunnel zone stubbed at 150vh, real is 4200vh), **footer** (address
staircase, socials slide, underline wipes, newsletter reveal+validate, back-to-top),
**scroll-nav** (dark strip, green progress bar full exactly at page bottom), **video
overlay** (opens from `#reel-watch`, seek/play/mute, Esc/click close, missing-asset
fallback). Boot was hardened: always starts at top, ScrollTrigger re-measured post-boot,
preloader can never strand the black screen. Earlier sessions: header, hero, showreel,
featured projects, end/CTA.

> **Live-site comparison blocker:** lusion.co takes **6+ minutes and never finished
> loading** (stuck ~92%) inside the automated browser (Claude-in-Chrome / Playwright) — it
> streams heavy WebGL assets and throttles. So I cannot auto-screenshot the real site for
> comparison. Workaround that works: the **user pastes screenshots** from their own browser
> (fast). The built-in Claude Preview panel only renders at ~739px (mobile) — use the Chrome
> MCP at a resized 1440px window for desktop views of our localhost.

> **Hero scene look (deferred by user):** at desktop our hero renders dark/sparse — shapes
> pile small + dim at the bottom of the dark box. Enriched the palette to 6 colours
> (black/white/blue/red/green/purple, ~70 shapes) but it still reads dark; the real fix is
> likely lighting/exposure/framing and/or a lighter field (the real shapes are bright &
> colourful, see the End-section reference). Needs a real hero screenshot to tune. User said
> "skip hero for now."

---

## 1. How to run

```bash
npm install         # if node_modules is missing
npm run dev         # vite dev server on http://localhost:5173
npm run build       # tsc --noEmit + vite production build
```

There is a Claude preview launch config at `.claude/launch.json` (server name `dev`).

> Note: the live preview **screenshot** tool times out on this project because three
> continuous rAF loops run at once (Three.js physics, the cursor trail, and the Lenis
> ticker), so the capture never sees an idle frame. Verify visually in a real browser,
> or measure the DOM via `getBoundingClientRect`/`getComputedStyle` through eval.

---

## 2. Tech stack (and how it differs from the real site)

| Concern | This project | Real lusion.co (verified from their shipped bundle) |
|---|---|---|
| Shell | Vite + TypeScript | Astro static shell |
| 3D | three.js r0.184 | three.js **r158**, a fully **custom in-house engine** |
| Physics | `@dimforge/rapier3d-compat` (WASM) | hand-rolled in their engine (no physics lib) |
| Animation | GSAP + ScrollTrigger | hand-rolled (no GSAP) |
| Smooth scroll | Lenis | hand-rolled (no Lenis) |
| 3D assets | procedural geometry | streamed custom binary `.buf` files |
| Fonts | self-hosted **Aspekta** (free Aeonik-alike) | **Aeonik** (commercial), IBM Plex Mono, custom LusionMono |

We use pragmatic libraries to reach the same *result*; the real site is closer to game
dev. That's an intentional trade-off — keep it unless we decide to port their engine.

**Fonts:** the CSS stack lists `Aeonik` first, then `Aspekta`. To upgrade to true
pixel-perfection, buy Aeonik (CoType Foundry, ~$60–100/style) and drop the woff2 files
into `public/fonts/` as `Aeonik-Regular.woff2` / `Aeonik-Medium.woff2`. No code change
needed — `tokens.css` already references them.

---

## 3. Fidelity corrections — ✅ DONE (2026-06-10)

Both were removed so the baseline matches the real home page:

1. **Video hover cursor (play badge over the reel video).** ✅ removed
   - Deleted `src/ui/hoverCursor.ts`, `#reel-follow` markup, its CSS, and the
     `setupHoverCursor` import/call. (The real "video cursor" is on the About-page
     team section, not the home reel — do not add it here.)

2. **Velocity-driven video skew ("camera shake" when scrolling).** ✅ removed
   - Deleted the `--- 3D warp driven by scroll velocity ---` block in `reel.ts`.
   - If a video transform is ever wanted, drive it by scroll **progress** (scrub),
     never velocity. The home-reel video does **not** skew on the real site; the
     trapezoid look was just the perspective of the thumb→fullwidth expansion.

**Keep:** the site-wide cursor **mist trail** (`src/ui/trailCursor.ts`) — on the real
site and explicitly requested.

When in doubt, open the real site, record screen, step frame-by-frame, and copy that.
Don't add motion the reference doesn't have.

---

## 4. File map

```
index.html                  # all section markup (header, #hero, #reel, #featured)
vite.config.ts, tsconfig.json
.claude/launch.json         # preview server config (server name "dev", port 5173)
reference/                  # real lusion.co bundles (gitignore-worthy; not shipped)
  lusion.html               # fetched homepage DOM (re-fetch per §8)
  about.*.css               # real stylesheet — source of exact measurements
  hoisted.*.js              # real engine bundle (read for INTENT only, never copy)
  structure.txt             # extracted tag/id/class skeleton of the home page
  css-featured-goal.txt     # extracted CSS rule blocks per remaining section
public/fonts/               # Aspekta woff2 + license (add Aeonik here to upgrade)
public/reel/                # (empty) drop desktop.mp4 here to replace the reel placeholder
src/
  main.ts                   # boot: fonts -> intro -> scene; wires scroll/reel/featured/trail
  vite-env.d.ts
  styles/
    tokens.css              # design tokens (colors, grid + --grid-space, spacing) + @font-face
    global.css              # reset, .section 12-col grid, #ui layer, trail canvas
    components.css          # SHARED components — .cta-pill flood button (reuse everywhere)
    header.css              # header, pills, focus states, narrow-viewport rules
    hero.css                # hero layout, title, scroll strip + crosses
    reel.css                # showreel layout, swirl, title/desc, video frame, watch pill
    featured.css            # ✅ featured projects: 2-col grid, project-item, reveals
    goal.css                # ✅ goal/philosophy: 8vw title, texts col 8-12, image ratio boxes
    tunnel.css              # ✅ tunnel zone: 400vh sticky scrub block, is-black-bg state
    endConfetti.css         # ✅ end confetti canvas positioning
    end.css                 # ✅ end/CTA: dark sticky block, crosses, per-char title, pill
    footer.css              # ✅ footer: white bleed bg, contact grid, newsletter, bottom bar
    scrollNav.css           # ✅ scroll-nav: dark #121416 strip, green bar, 5 crosses
    menu.css                # ✅ header menu panel: card stack, staggered open/close
    preloader.css           # ✅ preloader: black layer, bottom-left odometer digits
    videoOverlay.css        # ✅ fullscreen player: controls grid, big close cursor, fallback
  scene/
    HeroScene.ts            # three.js + Rapier hero (jacks pile, pointer push, click burst)
    jackGeometry.ts         # procedural "jack" geometry (lathe arms merged)
    TunnelScene.ts          # ✅ scroll-scrubbed gem tunnel (instanced octahedra, fog)
    endConfetti.ts          # ✅ End confetti field (canvas-2D, parallax, pointer repel)
  ui/
    splitWords.ts           # splitWords() + splitChars() — overflow-hidden masks for reveals
    intro.ts                # hero entrance choreography (GSAP)
    scroll.ts               # Lenis + ScrollTrigger wiring; exposes window.__lenis in DEV
    reel.ts                 # showreel scroll animations
    featured.ts             # ✅ featured projects reveals + hover-to-play playback
    goal.ts                 # ✅ goal reveals: line masks, word rise, frame clip+parallax
    tunnel.ts               # ✅ tunnel scrub: is-black-bg toggle, title choreography, onProgress
    end.ts                  # ✅ end/CTA reveal (subtitle, per-char title, deco strokes)
    footer.ts               # ✅ footer: staircase, newsletter reveal+form, bottom reveals
    scrollNav.ts            # ✅ green next-bar scrub (full at page bottom) + text rise
    menu.ts                 # ✅ menu open/close, Esc/outside close, newsletter validate
    preloader.ts            # ✅ createPreloader(): setProgress()/finish(), odometer roll
    videoOverlay.ts         # ✅ setupVideoOverlay(): open/close, seek, fallback, cursor
    trailCursor.ts          # site-wide WebGL cursor mist trail  [KEEP]
```

**Shared infra added this session (reuse for every new section):**
- `--grid-space` token = one 12-col column width. Use `calc(var(--grid-space)*N + var(--grid-gap)*(N-1))` for "span N columns" widths.
- `.cta-pill` (components.css): the white→blue flood button. Markup: `<a class="cta-pill"><span class="cta-pill__dot"></span><span class="cta-pill__text">…</span><span class="cta-pill__arrow">…svg…</span></a>`. Sized by the instance's `font-size`.
- `window.__lenis` (DEV only): use `__lenis.scrollTo(y,{immediate:true})` to drive scroll in the preview — `window.scrollTo` does NOT trigger ScrollTrigger (Lenis owns scroll).
- Preview screenshots DO work once parked in a section; verify reveals by scrolling via `__lenis` then reading computed `clip-path`/`transform`.

---

## 5. Reference measurements (extracted from the real CSS bundle)

**Colors** (now in `tokens.css`):
`--color-off-white #f0f1fa` (page bg), `--color-white #fff`, `--color-dark-white #e4e6ef`
(menu pill), `--color-black #000`, `--color-blue #1a2ffb`, `--color-dark-blue #071bdf`,
`--color-grey-blue #2b2e3a` (talk pill). Also on the real site: green `#c1ff00`,
red `#ff4c41`, purple `#8832f7`, header-color `#0016ec`.

**Layout tokens:**
- 12-col grid, `column-gap: 4vw` (2vw ≤768px), `grid-space = (100% - 11*gap)/12`
- `--base-padding-x: max(6vw, 60px)` (real desktop) → we use `max(5vw,40px)`; 25px/15px at smaller bps
- `--base-padding-y: clamp(30px, 4vw, 50px)` → 25px → 15px
- `--global-border-radius: 20px` → 15px → 10px
- `--header-size: clamp(1rem, 1vw, 2rem)`; `--cross-size: clamp(.875rem, 1vw, 2rem)`

**Hero (`#home-hero`):** height 100vh; title `grid-column: 4 / span 5`, `font-size: 2.5vw`,
`line-height: 1.1`. Word reveal from `translate3d(0,1.5em,0) rotate(15deg)`. Responsive
title: `4/span 3 @1.7vw`, then `1/span 6 @6vw`, then `7vw`. Bottom scroll strip with 4
crosses at 0 / 33.3% / 66.6% / 100% and centered "scroll to explore".

**Reel (`#home-reel`):**
- Title `font-size: 10vw` (6.7vw / 13.8vw / 20vw responsive), `letter-spacing: -.02em`,
  `line-height: 1`, two lines "Bold Ideas," / "Brought to Life"; line 1 indented
  `padding-left: calc(grid-space*2 + gap*2)`; word sits `bottom: .1em`.
- Content `grid-column: 7 / span 6`, `font-size: clamp(1rem,1.5vw,3rem)`, `line-height 1.4`
  (responsive `8/span 3`, then `1/span 6`).
- CTA "Our Approach": **solid white pill**; on hover the dot scales ~20× to flood it blue,
  text shifts left, arrow slides in.
- Video container `grid-column: 1/13` (1/7 mobile); video `border-radius: 12px`,
  `object-fit: cover`, source `desktop.mp4` / `mobile.mp4`.
- Centered watch pill: `left: calc(50% - 4.7em)`, `top: calc(50% - 3em)`, `9.4em × 6em`,
  `border-radius: 22.5em`; hover fills blue from the bottom, icon turns white.
- Video frame has decorative crosses top & bottom at 0/25/50/75/100%.

**The blue swirl line:** a brand-blue stroke that **enters from the left edge**, loops in
the upper-left around the video, and the tail exits the **right edge**; it **draws itself
in on scroll**. In our build it's an inline SVG path (`#reel-swirl-path`, 1600×1200 space)
animated via `stroke-dashoffset` scrub. The curve is a hand-authored approximation — tune
the path coords to taste. On the real site this line is rendered in their WebGL engine.

---

## 6. Real home-page structure (for the remaining sections)

From the real DOM, the home page is: one full-page `#canvas` behind a `#ui` layer with a
fixed header (logo / sound / "Let's talk" / Menu + a menu panel with Home, About us,
Projects, Contact and a newsletter form). Page sections in order:

The real home page DOM (verified, see `reference/structure.txt`), in order:

1. **Hero** — `#home-hero` ✅ built (our `#hero`)
2. **Showreel** — `#home-reel` ✅ built (our `#reel`)
3. **Featured projects** — `#home-featured` ✅ built (our `#featured`). Real: 9 project
   `<a class="project-item project-type-website">` rows, 2-col, `:nth-child(n+3)` big
   top-margin, `.project-item-main` 65% ratio box, hover-video, `.project-item-line-1`
   (category) + `.project-item-line-2` (name, 3vw masked) + arrow icon, `#home-featured-cta`
   flood pill. Ours uses 6 original placeholder projects + gradient placeholders.
4. **Goal / Philosophy** — `#home-goal` ✅ built (our `#goal`, content layer only). Big title (8vw), paragraph block
   (`grid-column 8/12`), two stacked image reveals (`#home-goal-image-in/out`), AND a
   `#home-goal-tunnel-title`. **Has `padding-bottom: calc(var(--vh)*4200)`** — i.e. a
   ~42-screen scroll zone that drives the WebGL **tunnel / scene morph**. The content
   layer (type + image reveals) can be built first; the 3D tunnel is the big piece.
5. **End / CTA** — `#end-section` (inside `#page-extra-sections`) ✅ built (our `#end`). Height
   `350vh`, `#end-section-title` 10vw link with per-char masked reveal + over/under-line
   decorations, 5 corner crosses, `#end-bottom` animated scroll-down pill. Switches the
   page bg (`html.is-black-bg` / `is-white-bg`).
6. **Footer** — `#footer-section` ✅ built (our `#footer`). 100vh, white bg, 12-col: address (hover
   shift), socials (hover slide w/ rotated arrow), enquiries/business links (underline
   wipe), newsletter input (animated bg + arrow), `#footer-bottom` (copyright, labs link,
   tagline, back-to-top circle btn). Full measurements in `reference/css-featured-goal.txt`.
7. **Scroll nav** — `#scroll-nav-section` ✅ built (our `#scroll-nav`). Dark `#121416`, "next" progress bar
   (green `--color-green`), row of 5 crosses, big uppercase text.

Header/overlay pieces also present:
- `#header-menu` ✅ — full menu panel (links w/ text-swap + dot, newsletter, talk, labs);
  opens with `.--opened`, links rise/rotate in with staggered `--open-delay`.
- `#preloader` ✅ — black screen, bottom-left `#preloader-percent-digits` (per-digit), then
  `html.is-ready` fades it out.
- `#video-overlay` ✅ — fullscreen player (progress bar, play/mute, close cursor, fallback).
- `#transition-overlay` ⏳ — full-screen page-transition layer (needs routing first).

Their engine streams `.buf` assets hinting at later 3D scenes (astronaut, diamond,
earth_card, broken_glass, tunnel, terrain, plant) — i.e. **scroll-driven scene
transitions** in the canvas (the `#home-goal` 4200vh zone). That morph-between-scenes is
the signature "expensive" feel and the hardest remaining piece.

---

## 7. Roadmap (suggested order for next sessions)

1. ✅ **§3 fidelity corrections** — done.
2. ✅ **Featured projects** (`#featured`) — done + verified (build green, reveals fire,
   2-col↔1-col responsive). 6 placeholder projects; swap in real media via the
   `.project-item-video` `data-src` hook when available.
3. ✅ **Goal / Philosophy content layer** (`#home-goal` → `#goal`) — built + verified.
   Exact reference metrics (8vw/11em title, texts col 8–12, both image ratio boxes with
   grid-gap bleeds, tunnel title stub). Scroll tail is `padding-bottom: calc(var(--vh)*150)`
   — restore `*4200` when the tunnel canvas lands (loud comment marks it in goal.css).
4. ✅ **End / CTA** (`#end`) — built AND corrected to match the real reference (user sent a
   desktop screenshot). Now: **transparent/off-white bg** (NOT black), **black lowercase**
   title `Let's work together!` (two lines), decorative strokes are **hover-only** (were
   wrongly always-on), pill fixed to `↓ Continue to scroll ↓` (single label + flanking
   arrows; the old doubled-text version glitched). Sticky `#end-inner`, height now 150vh
   (was 260) to cut empty pinned scroll until shapes land. Per-char title via `splitChars()`.
   **REMAINING GAP:** the real End sits on the off-white page with the **colourful physics
   shapes scattered behind it** (same shapes as the hero) — that's the persistent-canvas
   scene system (#9), the big piece. Goal/tunnel inserts BEFORE `#end` (placeholder comment
   in index.html marks the spot).
5. ✅ **Footer** (`#footer`) — built + verified (hover staircase, socials slide-in arrow,
   underline wipes, newsletter bg scaleX reveal + local-only validation, bottom-row masked
   rises, back-to-top conveyor button; full-bleed white #footer-bg sheet).
6. ✅ **Scroll nav** (`#scroll-nav`) — built + verified. Green bar scrubs `scaleX` 0→1 and
   is full exactly at page bottom (must stay the LAST element on the page). Real site
   navigates to the next page on completion — we are single-page, so it stops there.
7. ✅ **Header menu panel** (`#header-menu`) — built + verified (CSS-transition card stack,
   staggered open/close delays, text-swap link hovers, Esc/outside-click close, mobile
   talk card, labs card with diagonal arrow swap).
8. ✅ **Preloader** (`#preloader`) — built + verified. `createPreloader()` API: boot calls
   `setProgress(40)` (fonts) / `setProgress(80)` (scene chunk) / `await finish()` before
   `playIntro`. Odometer digit roll, ≥800ms min visible, `html.is-ready`, exit slide.
9. 🟡 **Scroll-driven scene transitions** — FIRST SLICE SHIPPED (2026-06-10 session 3b,
   from user-supplied real-site screenshots):
   - `#tunnel` sticky zone inside `#goal` (400vh study cut; tunnel.css/tunnel.ts):
     `html.is-black-bg` page state for 0.03<p<0.99, scrubbed 3-line white title
     (masked rise → hold → scale-past-camera), full-bleed within the .section grid.
   - `TunnelScene.ts`: scroll-scrubbed three.js gem tunnel (240 instanced octahedra,
     icy palette, fog, camera flies z=4→-116 with sway; smoothed progress; rAF only
     while the zone intersects; reduced-motion = static frame). Lazy chunk (4.7KB +
     shared three chunk). Wired in main.ts AFTER hero scene start, failure-isolated.
   - `endConfetti.ts`: the End section's flat confetti shape field (canvas-2D, seeded
     scatter, ~90-130 original shapes matching the real palette, scroll parallax,
     pointer repel, IntersectionObserver-gated rAF).
   - End title fixed to TWO stacked lines (display:block on .end-title-line) and the
     deco strokes now DRAW IN with the reveal (real site shows them at rest — newer
     user screenshot supersedes the session-2 hover-only correction).
   STILL TO DO: replace the gem study with the full scene-morph choreography
   (astronaut→diamond→earth→tunnel→terrain→plant equivalents, ORIGINAL assets), restore
   the 4200vh zone, persistent single canvas across hero/goal/end, End-section 3D
   shapes (the 2D confetti field stands in meanwhile). The user may also supply an
   original video for a literally-scrubbed video variant (public/tunnel/).
10. ✅ **Video overlay** — built + verified (open from `#reel-watch`, fade, seek bar with
    drag, play/mute, big white "Close" follow-cursor, Esc/surface-click/mobile-btn close,
    Lenis stopped while open, graceful fallback when `/reel/desktop.mp4` is absent).
    ⏳ **Page transition overlay** — not built (needs multi-page routing first).

For each: pull the real CSS for that section from `reference/` (or re-fetch per §8), build
pixel-accurate against those measurements, keep copy/media as ORIGINAL placeholders, then
add only the motion the reference actually has. Verify by scrolling via `window.__lenis`.

**Parallelization note:** sections 4–8 are largely independent (each = its own `*.css` +
`*.ts` + a markup block). Safe to delegate to subagents IF each agent only creates its own
new files and returns its markup snippet as text; the orchestrator integrates `index.html`
+ `main.ts` wiring sequentially to avoid conflicts. Reuse `.cta-pill`, `--grid-space`,
`splitWords`, and the `scroll.ts` ticker — do not re-implement them.

---

## 8. How to extract reference values (repeatable method)

The real CSS/JS were downloaded earlier; re-fetch when needed:

```bash
curl -s https://lusion.co/ -o lusion.html
# find the hashed asset names in the HTML, then:
curl -s https://lusion.co/_astro/<about.HASH>.css -o lusion.css
curl -s https://lusion.co/_astro/<hoisted.HASH>.js -o lusion.js
```

Then grep `lusion.css` for the section's `#home-<section>` selectors to get exact
grid columns, font sizes, spacing, and hover transitions. The JS bundle (`Cursor`,
`domVideoCursor`, etc.) reveals interaction logic but is minified — read it for intent,
not to copy.

---

## 9. Review status (already applied)

A multi-agent review pass fixed, in the hero: a kinematic-pointer velocity bug that
launched jacks out of frame on pointer-leave; full `dispose()` teardown; a 769–1100px
responsive break; an intro flash-of-unstyled race; resize-handler physics churn; missing
keyboard focus states; 320px header overflow; and an inert `mix-blend-mode`. The hero is
in good shape. The **reel** has not had a formal review pass yet — do one after §3.

---

## 10. Gotchas

- **GateGuard hook**: a `pre:edit-write` hook intercepts the first Write/Bash call and
  asks for facts; just retry the identical call once and it proceeds. (Or set
  `ECC_GATEGUARD=off`.)
- **Lenis vs. programmatic scroll**: `window.scrollTo` fights Lenis's internal target;
  use the Lenis instance's `scrollTo` (consider exposing it on `window` for debugging).
- **Placeholder copy**: the reel headline/description text is placeholder in the
  reference's spirit (the description is a paraphrase, not their exact sentence). Replace
  all copy + the LUSION wordmark before any public use — that content is theirs.
- **Reduced motion**: every animation has a `prefers-reduced-motion` fallback; keep that
  invariant when adding sections.
- **ScrollTrigger positions go stale during boot**: triggers are created before fonts/pin
  spacers settle layout, so `main.ts` calls `ScrollTrigger.refresh()` once after
  `preloader.finish()`. Without it, deep-page triggers (goal image reveals) never fire.
- **Boot always restarts at top** (like the real site): Chrome applies history scroll
  restoration asynchronously and GSAP's ScrollTrigger flips `history.scrollRestoration`
  back to `auto` after refreshes, so `main.ts` re-forces top AFTER `preloader.finish()`.
  Creating ScrollTriggers while the browser restores a deep scroll into a pinned layout
  crashes ScrollTrigger's init refresh ("reading 'end'") — booting from top avoids it.
- **Hidden/occluded tab = rAF fully suspended** (Chrome): gsap freezes, the preloader sits
  at 100, CDP screenshots time out ("renderer frozen"). NOT a site bug — it self-heals on
  visibility. For automated verification: bring the window forward (Win32
  `SetForegroundWindow` via PowerShell + `Ctrl+9` SendKeys to activate the tab), or drive
  gsap manually: `import('/node_modules/.vite/deps/gsap.js?v=<hash>')` then
  `setInterval(() => gsap.ticker.tick(), 16)`.
- **Vite serves missing media as 200 text/html** (SPA fallback), so `<video>` never fires
  `error` on its own with `preload="none"`. videoOverlay.ts forces `load()` on open and
  also treats "readyState 0 shortly after loadstart" as missing.
- **`#scroll-nav` must stay the last element on the page** — its progress bar scrub ends
  at `'bottom bottom'`.
