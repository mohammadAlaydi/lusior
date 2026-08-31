# Code Review — August 2026

**Date:** 2026-08-07
**Scope:** Full codebase — Vite + TypeScript + three.js + GSAP/Lenis frontend, Express 5 API, docs, tooling, QA harness.

## Method

Thirteen parallel specialist reviews (backend, architecture/team-readiness, security, CSS architecture, projects layer, web performance, WebGL scenes & audio, accessibility, technical SEO, section UI modules, core UI runtime, repo hygiene/DX, documentation) produced **138 raw findings**. Every critical/high claim — **26 in total** — was then adversarially verified by an independent pass that re-read the cited code, inspected installed dependency internals, and ran empirical experiments (headless-Chrome timing tests, in-process body-parser/proxy-addr probes). Outcome: **23 confirmed, 2 refuted, 1 verified manually** (the verifier agent hung; the claim was confirmed by direct inspection of `public/`).

Most confirmed critical/high issues were **fixed the same day** (2026-08-07). Each finding below carries a status: ✅ FIXED (with a one-line description of the fix), 🟡 PARTIALLY FIXED, or ⚠ OPEN (tracked in `docs/ROADMAP.md`).

---

## 1. Executive summary

The codebase quality is genuinely high. Both runtimes are strict TypeScript; the frontend is organized as clean per-section module pairs with an acyclic import graph; the API has a real validation trust boundary (zod, input never reflected) and correct Express 5 async error flow; the real-time code (fixed-timestep physics, IntersectionObserver-gated rAF loops, zero per-frame allocations, genuine `dispose()` methods) is unusually disciplined; and the code is densely commented with rationale rather than noise.

The confirmed problems were not spread evenly — they were concentrated in three bands:

1. **Accessibility and reduced-motion** — five Level-A failures (unscrollable reduced-motion gallery, uncontained video dialog, pointer-only seek, invisible focusable button, unpausable autoplay loops) plus CSS reduced-motion coverage gaps.
2. **Deploy story** — `.env` never loaded, spoofable `trust proxy`, no SPA fallback, no start script, error-handler misbehavior: the API was exploitable and undeployable as-is.
3. **Media and boot performance** — an eagerly-downloaded 4.4 MB showreel, a fully serialized boot chain, and a ~32 MB unoptimized video library.

All of band 1 and band 2, and the top of band 3, were fixed same-day. A same-day hygiene pass also landed: harness scratch (1000+ files) deleted and gitignored, 27 tracked logs untracked, stale git worktree removed, `package.json` corrected (`reevez-showcase`, `private`, `UNLICENSED`, engines >=22), ESLint flat config (green) + Prettier + `.editorconfig` + `.nvmrc`, GitHub Actions CI (typecheck + lint + build + server:build), `typecheck`/`lint`/`format`/`test` scripts, `HANDOFF.md` moved to `docs/`, and the body-parser npm advisory resolved (`npm audit` now reports 0 vulnerabilities).

What remains open is deliberate roadmap work, not latent breakage: media re-encoding (~32 MB library), the rapier main-thread WASM compile, SEO launch scaffolding (robots/sitemap/OG/canonical), markup generation from project data, the app-level state machine, and a documentation currency pass.

---

## 2. Verdict by area

Verdicts are the reviewers' originals; the "after fixes" column reflects the same-day fix wave honestly — an upgrade is claimed only where the area's confirmed blockers actually landed.

| Area | Original verdict | After fixes | Findings | Note |
|---|---|---|---|---|
| Backend (Express 5 API) | needs-work | ready-with-fixes | 10 | All four highs (trust proxy, .env, error handler, deploy story) fixed; PII retention and dedupe remain backlog. |
| Architecture & team-readiness | needs-work | ready-with-fixes | 12 | `__lenis` accessor + ARCHITECTURE.md status fixed; FSM (corrected to medium) is roadmap work. |
| Security (OWASP full-stack) | ready-with-fixes | ready-with-fixes | 6 | The one high (trust proxy) fixed; frontend CSP and PII lifecycle remain medium backlog. |
| CSS architecture | ready-with-fixes | ready | 7 | The high (reduced-motion gaps) fixed; remaining items are token/dedup quality work. |
| Projects layer | ready-with-fixes | ready-with-fixes | 8 | PRM gallery fixed, deltaMode claim refuted; add-a-project ritual only partially de-risked (validator, no generation). |
| Web performance | needs-work | needs-work | 9 | Reel preload fixed, modulepreload landed; the 32 MB media library and rapier WASM compile still dominate. |
| WebGL scenes & audio | ready-with-fixes | ready | 9 | The high (jack home refit) fixed; remaining items are contained polish (context-loss on tunnel, audio races). |
| Accessibility (WCAG 2.2 AA) | needs-work | ready-with-fixes | 17 | All five Level-A highs fixed same-day; contrast and label mediums remain. |
| Technical SEO | needs-work | needs-work | 9 | SPA fallback fixed; robots/sitemap/OG/canonical/JSON-LD launch scaffolding still absent. |
| Section UI modules | needs-work | ready-with-fixes | 11 | The one critical was refuted; the high (reel video) fixed; rest is quality-tier. |
| Core UI runtime | ready-with-fixes | ready | 12 | Both highs (blank hero, dead menu scroll) fixed; mediums are small coordination items. |
| Repo hygiene / DX | needs-work | ready-with-fixes | 12 | Hygiene pass landed (CI, lint, identity, scratch cleanup); playwright dependency declaration still open. |
| Documentation | needs-work | needs-work | 16 | Deep and unusually good, but stale in places; currency pass, root README, and credential-map sanitization outstanding. |

---

## 3. Confirmed critical/high findings

### 3.1 `trust proxy: true` lets any client spoof X-Forwarded-For — `server/src/index.ts`

**High. Flagged independently by both the backend and security reviews; both confirmed empirically.**
`app.set('trust proxy', true)` made Express resolve `req.ip` from the leftmost, unvalidated X-Forwarded-For token, so any direct client could rotate fake IPs to bypass the only write rate limiter — and because the limiter pruned its entire bucket map on every request, a spoofed-IP flood turned it into a CPU amplifier (O(n) scan per request), not just a memory leak. Verified against installed `express`/`proxy-addr` internals with a live probe.
**Status: ✅ FIXED** — `TRUST_PROXY` env var, default off; `'true'` maps to exactly 1 hop.

### 3.2 `.env` never loaded — documented config workflow was dead code — `server/src/env.ts` (new)

**High.** `.env.example` affirmatively claimed the server reads `.env`, but no loader existed anywhere (no dotenv, no `--env-file`): `CORS_ORIGIN` and `PORT` silently stayed at localhost defaults in any deployment, which would have broken prod CORS invisibly.
**Status: ✅ FIXED** — `server/src/env.ts` (`process.loadEnvFile`) imported first, before any `process.env` reads.

### 3.3 Error handler turned client errors into 500s and logged raw bodies — `server/src/index.ts`

**High.** The central handler never consulted `err.status`, so malformed-JSON 400s and oversized-body 413s were returned as 500 "Internal server error" — contradicting the documented contract — and `err.message` was written verbatim to stderr. Empirically, body-parser 2.2.2 embeds the **full raw request body** in parse-error messages, so user-submitted PII from malformed POSTs landed in server logs.
**Status: ✅ FIXED** — 4xx passthrough with generic messages; raw-body logging removed.

### 3.4 No deploy story: no start script, no static serving, no process wiring — `package.json`, `server/src/index.ts`

**High.** The repo had no way to run the built server (`server:build` emitted to a nested dist path nothing referenced), no Docker/process-manager config, and no SPA + API serving arrangement of any kind. The API — whose entire purpose is newsletter/contact persistence — was dev-only.
**Status: ✅ FIXED** — `express.static` + history fallback (`STATIC_DIR` / `NODE_ENV=production`), `server:start` script, graceful shutdown; the strict API CSP is now scoped to `/api` so it doesn't clobber the SPA.

### 3.5 Direct hits on `/projects/<slug>` 404 in production — `server/src/index.ts`

**High (SEO review; same root cause as 3.4).** Express JSON-404'd every non-`/api` URL and no rewrite config existed for any static host, so deep links — which `src/main.ts` explicitly supports client-side — would 404 for users, crawlers, and social scrapers alike.
**Status: ✅ FIXED** — covered by the same static-serving + history-fallback work as 3.4.

### 3.6 `revealAll()` left the hero headline permanently blank — `src/ui/intro.ts`

**High.** `revealAll()` reset `#header`/`#hero-visual`/`#hero-scrollbar` but never un-masked the split `#hero-title .word` spans, which the stylesheet keeps translated inside overflow-hidden masks. Deep-link to a project → navigate home (and any boot failure) left the headline invisible — precisely the failure `main.ts`'s own comment says the function prevents.
**Status: ✅ FIXED** — word unmask added in `intro.ts`; both call sites covered.

### 3.7 Menu section links clicked while a project is open never scrolled — `src/ui/menu.ts`

**High.** The menu's hard-coded 900 ms timer fired ~50 ms before the project-close choreography restarted Lenis, and Lenis silently drops `scrollTo` while stopped (verified in `lenis.mjs`) — so the click closed the project but never scrolled to the target section.
**Status: ✅ FIXED** — Lenis `scrollTo { force: true }` on the route-home path (executes while covered by the wipe).

### 3.8 `window.__lenis` was an untyped implicit contract with three divergent interfaces — `src/ui/scroll.ts`

**High.** The Lenis instance was stashed on `window` via an inline cast with no global type augmentation; `projectDetail.ts` and `menu.ts` each declared their own divergent `LenisLike` and read it back through their own casts. Because consumers must tolerate `undefined` (reduced motion legitimately leaves it unset), a broken producer would fail silently — scroll locking would just stop happening.
**Status: ✅ FIXED** — typed `getLenis()` accessor exported from `scroll.ts`; `menu.ts` migrated. Remaining cleanup: `projectDetail.ts` still reads the window stash (backlog, §5).

### 3.9 No app-level state machine — 'project open' state coordinated via an html class across four modules — `src/ui/router.ts`

**High → corrected to medium by verification** (real, but idempotent today; the risk is ambiguity of ownership, not current breakage). `is-project-details-active` is defined in `router.ts`, written twice on the same code path by two modules, string-duplicated in `menu.ts`, and raw-read in `main.ts`; cross-module wiring uses a mutable setter (`setMenuNavigate`) that fails silently if reordered.
**Status: ⚠ OPEN** — the ~60-line FSM from `docs/ARCHITECTURE.md` §2.3 is roadmap work (`docs/ROADMAP.md`). Interim: `ACTIVE_CLASS` should be exported from one place.

### 3.10 `docs/ARCHITECTURE.md`'s 7-phase plan is ~10% implemented with no status tracking — `docs/ARCHITECTURE.md`

**High.** The brief told every new session the plan "governs the endgame" while zero of seven phases were complete (Phase 1 ~25%, Phase 2 ~50% outcome credit) and reality had drifted further from the target (six independent canvases/frame-loops vs. the three the doc admits). New feel constants were added inline after the doc, violating its own convention.
**Status: ✅ FIXED** — status column added to the phase table today.

### 3.11 Adding a project is a fragile multi-file ritual; the data-driven grid loader is dead code — `index.html`, `shared/projects.ts`

**High.** The six home tiles are hand-written in `index.html`, duplicating slug/title/category/accent/thumb from `shared/projects.ts` with no consistency check anywhere; the `nextSlug` ring must be hand-rewired and typos degrade silently; meanwhile `fetchProjectList()` / `GET /api/projects` — built to drive the grid — has zero callers.
**Status: 🟡 PARTIALLY FIXED** — dev-time validator `src/data/validateProjects.ts` now warns on slug/ring/tile drift. Generating the tile markup from data remains OPEN (see `docs/ADDING-CONTENT.md`, `docs/ROADMAP.md`).

### 3.12 Reel video: 4.4 MB eager download, always-playing loop, no reduced-motion gate — `index.html`, `src/ui/reel.ts`

**High. Flagged independently by three reviews** (performance: `preload="auto"` contending with the critical 847 KB-gz HeroScene chunk during boot; section modules: muted loop playing offscreen for the whole session, violating the repo's own hard rule 5; accessibility: WCAG 2.2.2 Pause/Stop/Hide Level-A — no pause mechanism, autoplay unaffected by `prefers-reduced-motion`). The `hidden` attribute does not suppress media fetching, so the download started at HTML parse, before the hero chunk fetch.
**Status: ✅ FIXED** — `preload="metadata"`, IntersectionObserver load/play/pause gating, and reduced-motion users never get autoplay.

### 3.13 Serialized boot chain + main-thread WASM compile: mid-tier mobile LCP ~8–12 s — `src/main.ts`, `vite.config.ts`

**High.** First paint was serially gated: index.js download+execute → only then the HeroScene+three fetch (~980 KB gz, no `modulepreload` in `dist/index.html`) → await → preloader exit choreography → hero reveal; rapier's base64-inlined WASM then compiled on the main thread.
**Status: 🟡 PARTIALLY FIXED** — modulepreload injection plugin in `vite.config.ts` (HeroScene + three now download in parallel with index.js). The rapier main-thread WASM compile remains OPEN — roadmap: switch to `@dimforge/rapier3d` streaming WASM (`docs/ROADMAP.md`).

### 3.14 Shipped video library is unoptimized: ~32 MB total — `public/`, `shared/projects.ts`

**High. Verified manually** (the verifier agent hung; confirmed by direct inspection: `public/` holds ~28 MB of featured videos — `p1.mp4` alone 11 MB at 480p/2.3 Mbps — plus the 4.2 MB reel). Two "gallery" clips are five-minute 240p loops rendered at 70–74 em width; `reel/desktop.mp4` is byte-identical to `p3.mp4`. A visitor browsing all six projects downloads ~28 MB.
**Status: ⚠ OPEN** — encoding ladder defined in `docs/MEDIA-CAPTURE-PLAN.md` for the planned Reevez captures (8–15 s loops, 720p CRF 23–26, dedupe the reel; target under ~8 MB for a full browse). Tracked in `docs/ROADMAP.md`.

### 3.15 Hero jack home positions never refit on aspect change — `src/scene/HeroScene.ts`

**High.** Home positions derived from `worldHeight` once at `start()`; `handleResize` recomputed the camera volume but never touched homes, so after rotation/resize the zero-gravity springs held every jack at a stale position (visible breakage on phone rotation).
**Status: ✅ FIXED** — exact Y-remap in `handleResize` plus physics-body `wakeUp`.

### 3.16 CSS reduced-motion rule violated in `components.css`, `header.css`, `reel.css` gaps — `src/styles/`

**High.** The project's own hard rule — every animation gets a reduced-motion fallback — was violated by transform-driven hover transitions in `components.css` and `header.css` (no `prefers-reduced-motion` block at all) and by omissions in `reel.css`'s existing block (CTA flood, watch-fill). Specificity gaps also existed in `menu.css`/`projectDetail.css`.
**Status: ✅ FIXED** — reduced-motion blocks added across the affected files.

### 3.17 Desktop project gallery completely unscrollable under `prefers-reduced-motion` — `src/ui/projectDetail.ts`

**High. Flagged independently by the projects-layer and accessibility reviews; both confirmed.** With OS reduce-motion on and viewport >812 px, `attachInteractions` bailed before attaching any wheel/drag/keyboard handler while CSS kept the layer `overflow: hidden` — gallery content beyond the first screen and the next-project advance were unreachable **for every input method and every user**, not just AT users.
**Status: ✅ FIXED** — reduced mode now attaches the full interaction layer with instant (no-lerp) writes; video `play()` gated on `!reduced`.

### 3.18 Video overlay dialog: no focus containment; seek bar pointer-only — `src/ui/videoOverlay.ts`, `index.html`

**Two highs, fixed together.** (a) `role="dialog"` without `aria-modal` and no `inert` on the background: Tab escaped behind the opaque z-99 overlay, focus went invisible, screen readers could wander the page "behind" the modal (WCAG 2.4.3/2.4.7/4.1.2). (b) `seekToPointer` was the sole `currentTime` writer and required a PointerEvent; keyboard users could not seek at all — the only transport function with zero keyboard path.
**Status: ✅ FIXED** — inert-siblings pattern applied on open/close; seek bar is now `role="slider"` with arrow-key seeking.

### 3.19 Invisible `scale(0)` back button in the tab order on every page — `index.html`, `src/styles/projectsHeader.css`

**High.** The resting state was `transform: scale(0)` only — transforms remove neither focusability nor AT exposure — so an invisible "Back to projects" button was tab stop #2 on every load (with a collapsed, invisible focus indicator), and after a close cycle it became the focusable-but-`aria-hidden` axe violation.
**Status: ✅ FIXED** — `visibility` toggling in `projectsHeader.css` plus `aria-hidden="true"` in the initial markup.

### 3.20 Additional high findings outside the adversarial verification set

These highs came from the documentation, repo-hygiene, and SEO reviews (largely doc/process claims that did not require adversarial code verification):

| Finding | File | Status |
|---|---|---|
| 28 MB of QA screenshots + 27 run logs tracked in git, churning every harness run | `.gitignore`, `harness/` | ✅ FIXED — logs untracked, harness artifacts gitignored in the hygiene pass |
| ~1,044 untracked scratch files polluting `harness/` | `harness/` | ✅ FIXED — deleted and gitignored |
| No CI; `npm run build` type-checked only `src/` (server could break silently) | `package.json` | ✅ FIXED — GitHub Actions CI: typecheck + lint + build + server:build |
| `.env.example` claimed the server reads `.env` when nothing loaded it | `.env.example` | ✅ FIXED — true now that `server/src/env.ts` loads it (see 3.2) |
| Harness scripts depend on playwright, declared nowhere in `package.json` — fresh clone breaks the QA harness | `harness/*.mjs` | ⚠ OPEN — add playwright to devDependencies |
| The two governing rebrand docs are untracked in git and unlinked from the entry brief | `docs/PRODUCTION-CONTENT-PLAN.md`, `docs/MEDIA-CAPTURE-PLAN.md` | ⚠ OPEN — commit both (after 3.20.7) and link from `docs/AI-README.md` |
| `MEDIA-CAPTURE-PLAN` §7 is a map of live credential locations — must not be committed as-is | `docs/MEDIA-CAPTURE-PLAN.md` | ⚠ OPEN — sanitize §7 before tracking |
| No root README or human-facing onboarding doc | repo root | ⚠ OPEN |
| `server/README.md` contradicts the code: wrong rate-limit scope/numbers, env table missing `CORS_ORIGIN` (also flagged as a backend medium) | `server/README.md` | ⚠ OPEN — one currency pass |
| `og:image` is a root-relative URL and OG/Twitter tags are incomplete — social previews render without an image | `index.html` | ⚠ OPEN — absolute URLs + dedicated 1200×630 card |
| No `robots.txt` and no `sitemap.xml` | `public/` | ⚠ OPEN — 7 URLs derivable from `shared/projects.ts` |

---

## 4. Refuted findings

Two of the 26 verified claims did not survive adversarial verification — worth recording both for the record and as evidence the confirmation pass was real:

### 4.1 "Gallery wheel handler ignores `deltaMode` — Firefox line-mode wheels make the gallery near-immobile" (was high → refuted, residual low)

The code reading was accurate (`projectDetail.ts` never touches `event.deltaMode`), but the claimed failure is based on pre-2022 browser behavior. Since Firefox 97 (Bugzilla 1392460), a webcompat intervention delivers **pixel** deltas to handlers that read `deltaY`/`deltaX` without first accessing `deltaMode` — exactly to protect deltaMode-ignorant handlers like this one. The near-immobile gallery cannot occur on any supported browser with default settings. Residual: optional defensive normalization for exotic/legacy configs (backlog, §5).

### 4.2 "Missing-media grace timer arms at boot, permanently locking the showreel overlay into fallback" (was critical → refuted, residual low)

The reviewer's mechanism was plausible — the boot-time `loadstart` Chromium fires even for `preload="none"` video could trip the `{once: true}` fallback listener — but headless-Chrome experiments showed that in both dev (body-end script + Vite waterfall) and production (external module chunk), module evaluation lands **after** the boot `loadstart`/`suspend` dispatch, so the listener misses them and correctly arms for the `open()`-time load. Only a synthetic inline/instant-ready module reproduced the lockout. Residual: the boot-armed once-listener is timing-fragile; hardening (arm the timer from `open()` instead) is in the backlog (§5).

---

## 5. Medium/low backlog

The complete retained backlog — 101 medium/low findings, de-duplicated where reviews overlapped. Items marked **✅ fixed today** landed in the same-day hygiene/fix wave and are listed for the record.

### Backend

| Sev | Finding | File | Suggested fix |
|---|---|---|---|
| M | No graceful shutdown, no listen-error handling, `listen()` as import side effect | `server/src/index.ts` | **✅ fixed today** (graceful shutdown landed with the deploy work); keep listen behind an entry-point guard |
| M | No duplicate-subscription handling; plaintext-JSONL PII has no retention/deletion story *(merged with the security review's PII finding)* | `server/src/repository.ts` | Normalize + dedupe emails on write; document retention window and deletion procedure; restrict `server/data/` permissions; the `SubmissionRepository` interface already isolates a future store swap |
| M | README security claims drifted (rate-limit scope/numbers, "sliding" vs fixed window) | `server/README.md` | Merged into the documentation high entry (§3.20) — one currency pass |
| L | No fsync durability — acknowledged 201s can be lost on crash | `server/src/repository.ts` | Accept and document best-effort durability, or `filehandle.sync()` per record |
| L | Zod 4 deprecated `.email()` style; schemas not `.strict()` | `server/src/validation.ts` | Move to `z.email()`; optionally `.strict()` both schemas |
| L | Missing prod headers: HSTS, `Cache-Control` on API responses | `server/src/security.ts` | Add `Cache-Control: no-store` now; HSTS gated on a TLS env flag |

### Architecture & team-readiness

| Sev | Finding | File | Suggested fix |
|---|---|---|---|
| M | Adding a project touches 4 uncoordinated places; grid loader is dead code *(overlaps §3.11; validator now exists)* | `src/data/projects.ts`, `index.html` | Render tiles from `projectSummaries()` at boot or generate markup at build time; then wire or delete `fetchProjectList` |
| M | No teardown discipline: `dispose()` methods have no callers; `setup*` lifecycle contracts inconsistent | `src/main.ts` | Standardize a `SectionController { destroy() }` return type (copy `projectDetail.ts`'s cleanups-array pattern) |
| M | Temporal coupling: menu hand-syncs 900 ms to the transition's 550 ms halves because `Router.navigate` returns void | `src/ui/menu.ts` | Make `navigate` return the queued trip's promise; `await` it, then scroll — both magic numbers disappear |
| M | `index.html` is a 726-line single-file DOM contract for nine sections — merge-conflict funnel | `index.html` | Split into build-time partials (one per section, matching the ts/css pair convention), or region comments + a dev-mode DOM-contract assertion |
| M | Team scaffolding absent: no lint/format/tests/CI; identity still `lusion-recreation` | `package.json` | **✅ fixed today** (ESLint + Prettier + CI + identity); Vitest suite for router/transition/sanitizer pure functions still worthwhile |
| L | Home `document.title` degrades after first project visit (duplicated brand constant) | `src/ui/router.ts` | Capture `BASE_TITLE` from `document.title` at setup; centralize brand strings ahead of the rebrand |
| L | Router navigation failure path swallows errors with zero logging | `src/ui/router.ts` | `console.error('Navigation failed', target, error)` in both catches |
| L | Dead code: unused data-loader exports, unreachable SFX variant | `src/data/projects.ts` | Delete `FALLBACK_PROJECTS` + the glass variant, or wire the data-driven grid (which un-deads two of three) |
| L | `featured.ts` scroll-bend runs on the global ticker forever, reading `window.scrollY` | `src/ui/featured.ts` | Gate with an IntersectionObserver on `#featured`; read velocity from Lenis |

### Security

| Sev | Finding | File | Suggested fix |
|---|---|---|---|
| M | No Content-Security-Policy for the frontend pages (server CSP covers only `/api`) | `index.html` / host config | Ship a CSP via host headers (preferred) or meta tag; validate against the rapier WASM chunk before enforcing |
| M | Subscriber/contact PII plaintext, no retention | `server/src/repository.ts` | Merged with the backend PII row above |
| L | Production build ships full source maps *(also flagged by repo-hygiene)* | `vite.config.ts` | `sourcemap: 'hidden'` or `false` for production |
| L | `.gitignore` `.env` coverage misses `.env.production`-style variants | `.gitignore` | `.env*` plus `!.env.example` |
| L | Write endpoints have no anti-abuse control beyond the IP rate limit | `server/src/routes.ts` | Honeypot field, email dedupe, plan double opt-in before the list is used |

### CSS architecture

| Sev | Finding | File | Suggested fix |
|---|---|---|---|
| M | Flood-pill CTA implemented three times despite `.cta-pill` existing | `src/styles/reel.css` et al. | Refactor onto `.cta-pill` with element-scoped custom properties; delete dead cross-product hovers in `projectDetail.css` |
| M | Token fragmentation: `--color-error` undefined, `color: red` for the same state, `--color-ink` re-hardcoded, tokens in three files | `src/styles/tokens.css` et al. | Define `--color-error`; replace raw `#0d0e13`; consolidate token declarations (or document the split); add easing tokens |
| M | Competing mobile breakpoints: 768 px home vs 812 px detail, plus 380/480/1100/1200 undocumented | `src/styles/projectDetail.css` | Pick one mobile cutoff and document the canonical scale in a `tokens.css` header comment |
| M | Placeholder gradient stack and word-mask scaffolding copy-pasted across files | `src/styles/featured.css` et al. | Extract `.media-placeholder`, generic `.word-mask > .word`, and a `.cross` primitive into `components.css` |
| L | Dead selector `#header-logo` (real id is `#logo`) | `src/styles/projectsHeader.css` | Delete it from the selector list |
| L | z-index ladder is magic numbers across 8 files | `src/styles/tokens.css` | `--z-*` tokens spaced by 10s, referenced from section files |

### Projects layer

| Sev | Finding | File | Suggested fix |
|---|---|---|---|
| M | API `data` cast to `T` unvalidated — malformed payload crashes `doOpen`, masked as silent nav-to-home | `src/data/projects.ts` | zod schemas in `shared/projects.ts` (types via `z.infer`), `safeParse` → null → offline fallback; at minimum validate theme hex colors before `setProperty` |
| M | `fetchProject`/`fetchProjectList` permanently cache the offline fallback, contradicting their own docstring | `src/data/projects.ts` | Only cache when the live fetch succeeded; fallback lookup is free |
| M | Silent data traps: unknown side-list labels link to example.com; bad `nextSlug` degrades invisibly *(validator from §3.11 covers the ring)* | `src/ui/projectDetail.ts`, `shared/projects.ts` | Make side-list links `{ label, url }` and drop the label→URL map; `console.warn` on `findProject` misses in dev |
| L | Dead contract fields: `thumbVideo` unused, `--next-ratio` written but unread, hardcoded icon-bg literal | `src/data/projects.ts` | Delete or implement; point `projectDetail.css:367` at the token |
| L | Zero-maxScroll galleries: first wheel notch fills the advance ratio without `preventDefault` | `src/ui/projectDetail.ts` | Always `preventDefault` while the desktop hijack layer is active |
| L | *(Residual of refuted §4.1)* wheel handler could normalize `deltaMode` defensively | `src/ui/projectDetail.ts` | Optional: scale by deltaMode without a fixed 16 px constant |

### Web performance

| Sev | Finding | File | Suggested fix |
|---|---|---|---|
| M | HeroScene keeps stepping physics and rendering behind the opaque project overlay | `src/main.ts`, `src/scene/HeroScene.ts` | Add `setSuspended(on)` feeding `updateRunState()`; toggle from the detail open/close path |
| M | All still imagery JPEG-only, no lazy strategy — ~1.1 MB of below-fold CSS backgrounds at load | `index.html`, `public/` | Re-encode AVIF/WebP (~3× smaller); gate below-fold background URLs behind a one-shot IntersectionObserver class |
| M | Mobile GPU budget: DPR 2 + MSAA + 2048 px shadow map, no coarse-pointer downgrade | `src/scene/HeroScene.ts` | On `(pointer: coarse)`: clamp DPR 1.5, shadow map 1024, consider `antialias: false` at DPR ≥ 2 |
| L | Featured-tiles skew ticker runs every frame for the life of the page | `src/ui/featured.ts` | IntersectionObserver gate (pattern exists in `endConfetti.ts`) |
| L | Music loops at ~300 kbps AAC — 3.35 MB where ~1.3 MB is transparent | `public/assets/audios/` | Re-encode 128 kbps AAC or 96 kbps Opus |
| L | 37.5 KB inline HTML with ~40 duplicated arrow SVGs; revealed gallery videos never pause while the layer stays open | `index.html`, `src/ui/projectDetail.ts` | `<symbol>`/`<use>` for the arrow; pause offscreen gallery videos in the frame loop |

### WebGL scenes & audio

| Sev | Finding | File | Suggested fix |
|---|---|---|---|
| M | TunnelScene has no context-loss handling — lost context leaves it permanently blank while the loop renders | `src/scene/TunnelScene.ts` | Mirror HeroScene's lost/restored pattern |
| M | Hero context-restore cannot recover the PMREM environment — lighting silently degrades | `src/scene/HeroScene.ts` | Extract `rebuildEnvironment()`; call from the restored handler |
| M | `MusicTrack.fadeTo_` race: a fade-up awaited on `play()` can override a later toggle-off | `src/audio/soundEngine.ts` | Generation token per track; re-check after each await; delete or wire `stop()` |
| L | `RoomEnvironment` scene never disposed — GPU buffers held for the session | `src/scene/HeroScene.ts` | Dispose env + PMREM generator after baking |
| L | Crossfades/ducking are no-ops on iOS Safari (element volume ignored) | `src/audio/soundEngine.ts` | Route tracks through `createMediaElementSource` → GainNode when a context exists |
| L | AudioContext constructed eagerly at load — un-actioned console warning every visit | `src/audio/soundEngine.ts` | Create lazily in `unlock()` on first gesture |
| L | DPR change without CSS-size change never retriggers resize — canvases stay at old DPR | `src/scene/HeroScene.ts` | Standard `matchMedia('(resolution: …dppx)')` re-registering listener |
| L | Shadow camera frustum fixed while `worldHeight` is aspect-dependent — top jacks lose shadows on tall viewports | `src/scene/HeroScene.ts` | Update `shadow.camera.top/bottom` in `handleResize` |

### Accessibility

| Sev | Finding | File | Suggested fix |
|---|---|---|---|
| M | Desktop "Next" advance strip: black text on near-black project backgrounds (~1.1:1) | `src/styles/projectDetail.css` | Apply the mobile recolour unconditionally (`--project-details-text` + light bar base) |
| M | Scroll-reveals leave controls focusable while fully invisible (`opacity: 0`) | `src/ui/reel.ts` et al. | Use `autoAlpha` instead of `opacity` — one-word change per tween |
| M | Newsletter inputs rely on placeholder-only labels at ~2.1:1 contrast | `src/styles/menu.css` | Placeholder ≥4.5:1; associate the section titles via `aria-labelledby` |
| M | Footer newsletter input removes the focus outline with no replacement | `src/styles/footer.css` | Copy the menu's inset box-shadow focus pattern |
| M | Footer error text pure red on white — 4.0:1, below AA | `src/styles/footer.css` | Use the `--color-error` token (see CSS backlog) |
| M | vw-only font sizes prevent text growth under browser zoom | `src/styles/hero.css` et al. | Convert to `clamp()` with a rem term, prioritizing the smallest text |
| L | Document-level Escape handlers collide: menu open over a project closes both | `src/ui/menu.ts` | Menu consumes Escape (`stopImmediatePropagation`/`defaultPrevented` check in projectDetail) |
| L | Tunnel headline is real content but entirely `aria-hidden` | `index.html` | Move `aria-hidden` to the canvas only; expose the text |
| L | Project category/year header info populated but permanently `aria-hidden` | `src/ui/projectDetail.ts` | Toggle with the back button, or fold into the region's label |
| L | Logo accessible name "Home" doesn't contain the visible label | `index.html` | Drop the aria-label or include the wordmark string |
| L | No skip-to-content link | `index.html` | Visually-hidden-until-focused skip link as first body child |
| L | Newsletter submit arrows below 24 px minimum target size | `src/styles/footer.css` | Grow the hit area with padding/min-size, keep icon size |

### Technical SEO

| Sev | Finding | File | Suggested fix |
|---|---|---|---|
| M | No canonical URL, static or per-route | `index.html`, `src/ui/router.ts` | Static canonical + update in the same router paths that set `document.title` |
| M | All six project URLs serve identical head metadata | `src/ui/router.ts` | Swap meta/OG in the router (cheap); prerender six `dist/projects/<slug>/index.html` heads from `shared/projects.ts` (right) |
| M | No structured data — Organization/WebSite JSON-LD absent | `index.html` | One JSON-LD block; per-project CreativeWork in the prerender pass |
| M | Unknown paths silently soft-404 to home with HTTP 200 | `src/ui/router.ts`, server | Render a real not-found state (+ client-side `noindex`); return real 404s from the Express static layer |
| L | Favicon set SVG-only; no web manifest | `index.html` | Generate the icon set + `site.webmanifest` when the Reevez mark lands |
| L | Router strips query strings/hashes on every navigation, destroying campaign attribution *(also flagged by core-runtime review)* | `src/ui/router.ts` | Preserve `location.search` (and hash) in `replaceState`/`pushState` |

### Section UI modules

| Sev | Finding | File | Suggested fix |
|---|---|---|---|
| M | Scroll-bend skew is frame-rate dependent (per-tick velocity/smoothing) | `src/ui/featured.ts` | Normalize by ticker delta (`deltaRatio(60)`); exponential-decay smoothing; name the constants |
| M | Masked-rise reveal + ribbon-draw copy-pasted across six files with drifting constants | `src/ui/goal.ts` et al. | Extract `maskedRise()` / `drawRibbonOnScroll()` helpers next to `splitWords.ts` |
| M | Live reduced-motion switching handled only by `tunnel.ts` | `src/ui/featured.ts` et al. | Shared `onReducedMotionChange(cb)` utility; persistent animators subscribe (or document the limitation) |
| L | Reel error handler self-defeating: `{once: true}` + a guard matching transient aborts | `src/ui/reel.ts` | Drop `once`; distinguish by `MediaError` code + `readyState` |
| L | `overwrite: 'auto'` in timeline vars is a silent no-op in the hover blur pulse | `src/ui/featured.ts` | Move into child-tween defaults or `killTweensOf` on enter |
| L | `TrailCursor.dispose()` leaks window listeners and GL resources — and is never called | `src/ui/trailCursor.ts` | Store bound handlers, delete GL objects, `loseContext()`; debounce resize |
| L | Per-frame uniform-location lookups + a forced layout read in two rAF loops | `src/ui/trailCursor.ts`, `src/ui/videoOverlay.ts` | Cache locations at link time; cache `offsetWidth` on start/resize |
| L | Overlay play button ships labeled "Pause" while nothing is playing | `index.html` | Ship as "Play", or set from `video.paused` at bind time |
| L | Choreography magic numbers scattered instead of the planned tunables module | `src/ui/reel.ts` et al. | Hoist to named constants now; fold into the tunables module when it lands |
| L | *(Residual of refuted §4.2)* boot-armed fallback listener is timing-fragile | `src/ui/videoOverlay.ts` | Arm the grace timer from `open()`; guard `activate()` on `isOpen` + `networkState` |

### Core UI runtime

| Sev | Finding | File | Suggested fix |
|---|---|---|---|
| M | Rejected transition midpoint leaves the viewport permanently painted | `src/ui/transition.ts` | Clear the bitmap in the `finally` block |
| M | Background page scrolls behind the open overlay: lock relies solely on `Lenis.stop()` (misses keyboard; no Lenis under reduced motion) | `src/ui/scroll.ts` | `html.is-project-details-active { overflow: hidden; }` — one declaration covers both gaps |
| M | Escape closes both the header menu and the open project simultaneously | `src/ui/menu.ts` | Merged with the a11y Escape-collision row above |
| L | Router error recovery leaves the URL at the failed project while the DOM shows home | `src/ui/router.ts` | `replaceState` to `/` after `setHomeState()` succeeds in the catch |
| L | HeroScene chunk rejection can fire a transient `unhandledrejection` during font await | `src/main.ts` | Attach a no-op `.catch()` guard without replacing the awaited promise |
| L | Menu link with an unrecognized label falls through to native `href="#"` navigation | `src/ui/menu.ts` | Always `preventDefault`; key destinations off `data-destination` |
| L | Resizing during the covered transition hold clears the canvas and flashes half-swapped DOM | `src/ui/transition.ts` | Track last drawn progress/accent; redraw in `resize()` while a play is active |
| L | `projectDetail.ts` still reads the `window.__lenis` stash instead of `getLenis()` *(remaining cleanup from §3.8)* | `src/ui/projectDetail.ts` | Migrate to the typed accessor; delete the local `LenisLike` |
| L | Stale comment/dead abstraction: module-scoped preloader unused by the boot failure handler | `src/main.ts` | Make it a local const or actually use it in the catch |

### Repo hygiene / DX

| Sev | Finding | File | Suggested fix |
|---|---|---|---|
| M | Wrong package identity (`lusion-recreation`, ISC, no `private`, no engines) | `package.json` | **✅ fixed today** (`reevez-showcase`, `private`, `UNLICENSED`, engines >=22, `.nvmrc`) |
| M | No ESLint/Prettier/.editorconfig/.vscode | repo root | **✅ fixed today** (ESLint flat config green, Prettier, `.editorconfig`) |
| M | Stub `test` script errors out; no `typecheck` script | `package.json` | **✅ fixed today** (typecheck/lint/format/test scripts) |
| M | No way to run the built server | `package.json` | **✅ fixed today** (`server:start`, see §3.4) |
| M | Rebrand plan docs untracked | `docs/` | ⚠ Merged into §3.20 — commit after sanitizing the credential map |
| L | Five harness scripts are one-off debug probes for already-fixed bugs | `harness/` | Prune or move to `harness/debug/` with a one-line README; keep the 14 real tools |
| L | Full source maps shipped to production *(merged with security row)* | `vite.config.ts` | `sourcemap: 'hidden'` or `false` |
| L | `vite.config.ts` type-checked by no tsconfig | `tsconfig.json` | Add it to the root `include` |

### Documentation

| Sev | Finding | File | Suggested fix |
|---|---|---|---|
| M | AI-README stale: dated heading, "hover-to-play" contradicts code, missing links to newest plan docs | `docs/AI-README.md` | Refresh the current-state block; fix the featured description; link the plan docs |
| M | HANDOFF needs a currency pass: stale date, 150vh-vs-400vh contradiction, dead hover-video hook, incomplete file map | `docs/HANDOFF.md` | One editing pass (note: file moved to `docs/` today) |
| M | Docs contradict each other on live-lusion.co automation policy | `CLAUDE.md` et al. | Pick one canonical policy in AI-README; others reference it |
| M | ARCHITECTURE.md and PROJECTS-FIDELITY.md both claim `harness/` is untracked — it is tracked | `docs/ARCHITECTURE.md` | Update both passages (partially overtaken by today's harness cleanup) |
| M | agent-briefing preamble hardcodes the wrong project root path | `docs/agent-briefing.md` | Real root or `<PROJECT_ROOT>` placeholder |
| M | media-credits swap instructions describe a removed hover-play mechanism | `docs/media-credits.md` | Rewrite the swap section; point at the PRODUCTION-CONTENT-PLAN §3 convention |
| M | Missing contribution guide / coding standards doc | `docs/` | Write `docs/CONTRIBUTING.md` consolidating the scattered rules (lint/format configs landed today) |
| M | Missing deploy runbook and QA-harness guide | `docs/` | Extract PRODUCTION-CONTENT-PLAN §8.5 into `docs/DEPLOY.md`; add a harness script guide |
| L | project-details-spec documents superseded `position: absolute` | `docs/project-details-spec.md` | Two-line "historical spec; HANDOFF wins" banner |
| L | No LICENSE file; no top-level IP notice | repo root | Match the (now UNLICENSED) intent; add a Legal/IP section to the future root README |
| L | HANDOFF.md relocation requires updating six referencing locations | `CLAUDE.md` et al. | **✅ done today** with the move to `docs/` |

---

## 6. Strengths worth preserving

Synthesized from the thirteen reviews' strengths lists — the patterns the fixes deliberately left intact:

- **Strict TypeScript across both runtimes**, with a sound tsconfig split: `shared/projects.ts` is type-checked under both bundler resolution (frontend) and NodeNext (server), making it a genuine single FE/BE data contract.
- **Clean per-section module architecture** — one `src/ui/<section>.ts` + `src/styles/<section>.css` pair per section, an acyclic import graph, and injected dependencies (router receives transition/detail/sound via parameters, not imports).
- **Systematic XSS defense at the single `innerHTML` construction site**: `escapeHtml`/`escapeAttr` on every interpolation, `safeUrl` scheme allowlisting (blocks `javascript:`), `safeDimension` style allowlisting; no eval, no postMessage, no inline handlers anywhere; every `target=_blank` carries `rel="noopener noreferrer"`.
- **A hardened API core**: zod as a real trust boundary that never reflects input, correct Express 5 async-rejection flow into a central handler, CORS locked to one origin, 16 kb body cap, and JSONL injection made impossible by `JSON.stringify` serialization.
- **Disciplined real-time engineering**: fixed-timestep physics with accumulator clamping (no tab-suspend catch-up explosions), every rAF loop IntersectionObserver-gated, zero per-frame allocations via scratch objects, DPR clamped with change detection, context-loss handling on the hero, and real `dispose()` methods with tracked disposables.
- **Never-wedge resilience patterns**: the router's promise-queue recovery, the transition's rejection-safe play chain, boot failure revealing static content instead of a black screen, and a data layer that never throws — every failure path degrades to bundled fallback data.
- **A deliberate accessibility foundation to build on**: the inert-siblings modal pattern with focus capture/restore, Escape handling, aria-live form status regions, `aria-expanded`/`aria-pressed` state wiring, and reduced-motion checks in ~12 JS modules with CSS counterparts.
- **CSS with rationale**: every file opens with an intent comment, non-obvious values carry inline reasoning, layout primitives are tokenized, responsive coverage is complete per section, and dead selectors are nearly absent.
- **Layered, read-on-demand documentation** that records hard-won operational gotchas (hidden-tab rAF suspension, Lenis-vs-window scroll, boot scroll-restore) with line references that spot-checks confirmed are still accurate.
- **A real QA harness**: self-documenting Playwright tools covering full home sweeps, interaction/overlay/history flows, reduced-motion and mobile boots, project-detail geometry, gallery advance/cancellation, and router race dedupe — the foundation the planned `tools/verify` promotion should build on.

---

*Generated from the 2026-08-07 multi-agent audit (`harness/_audit2026_consolidated.json`). Open items are tracked in `docs/ROADMAP.md`.*
