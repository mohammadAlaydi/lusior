# Tech Stack — assessment & dependency policy (2026-08-07)

The stack audit: are we on the right languages/frameworks/libraries, do they
follow standards, and how do we keep them healthy. Audience: owner + incoming
team. This doc COMPLEMENTS `LIBRARIES.md` (the curated per-phase library
plan — what to add when, and the deliberately-avoided list with rationale);
this one is the assessment and the policy. Read `AI-README.md` first.

---

## 1. Verdict

**The stack is right for this product, and it would be wrong for most other
products.** That distinction matters for anyone joining:

- **Vanilla TypeScript (strict) + Vite** — no UI framework. This is a
  deliberate architectural decision, not a gap. The site is DOM-first with
  imperative per-frame WebGL, scroll choreography, and physics; a virtual-DOM
  reconciler (React/Vue) or a meta-framework (Next/Astro) would sit *between*
  us and the frame loop and fight the architecture. The reference-class
  agencies (Lusion, Active Theory, 14islands) ship exactly this shape:
  vanilla TS modules, one clock, hand-rolled DOM. See `LIBRARIES.md` §6 and
  `ARCHITECTURE.md` §4 for the standing rule (`packages/*` stay
  framework-free).
- **three.js + GSAP/ScrollTrigger + Lenis + Rapier** — the industry-default
  quartet for this class of site. Each is best-in-class for its slot; none
  overlaps another. GSAP's ticker is the single clock (Lenis and the physics
  scenes ride it), which is the load-bearing integration decision.
- **Express 5 + zod on the server** — a two-endpoint newsletter/contact API.
  Appropriately boring: no framework churn, zod guards every input, and there
  is nothing here that would benefit from Fastify/Nest/tRPC at this scale.

The honest caveats are in §6 (known debt): one dependency choice
(`rapier3d-compat`) carries a measured performance tax, and the test story is
typecheck+lint+harness, not a unit-test runner.

## 2. Dependencies — health assessment

Versions are the declared ranges in `package.json` (caret; lockfile pins
exact). Runtime deps first, then dev.

| Package | Version | Role | Assessment | Risk notes |
|---|---|---|---|---|
| `three` | ^0.184.0 | WebGL scenes (hero jacks, tunnel, confetti) | Healthy; the default choice. Vanilla (no R3F) matches DOM-first architecture. | Ships **monthly minors that break APIs** (0.x semver: every minor is a potential break — e.g. the Clock→Timer migration we already did). Upgrades are planned events, not sweep items — see policy §5. |
| `gsap` (+ ScrollTrigger) | ^3.15.0 | All DOM motion; its ticker is the app's single clock | Healthy, actively developed. Since the Webflow acquisition (GSAP 3.13+) the **entire plugin suite is free** — SplitText, DrawSVG, MorphSVG, CustomEase included; no Club license needed. *(Confirm current terms at gsap.com/licensing before shipping a plugin we don't yet use.)* | Low. Very stable API across 3.x. |
| `lenis` | ^1.3.23 | Smooth scroll, wired into the gsap ticker | Healthy; the de-facto standard (darkroom.engineering). Exposed to the QA harness as `window.__lenis`. | Low. Small surface. |
| `@dimforge/rapier3d-compat` | ^0.19.3 | Physics (hero jacks) | Engine choice is right — Rapier (Rust/WASM) is the best-maintained, fastest JS-usable physics engine. **The `-compat` variant is the wrong flavor**: it base64-inlines ~1.6MB of WASM into the JS chunk to avoid bundler WASM config. That's the 847KB-gzip lazy HeroScene chunk. | Roadmapped swap to `@dimforge/rapier3d` (real `.wasm`, streaming-compiled) — see §6. API is identical; the change is init/bundler plumbing. |
| `zod` | ^4.0.5 | Server-side input validation | Healthy; zod 4 is current major (faster, smaller than 3). | Low. |
| `express` | ^5.1.0 | API server (2 endpoints + static) | Healthy; v5 is the current stable major with promise-aware routing (async handler errors propagate without wrapper hacks). | Low at this scale. |
| `cors` | ^2.8.5 | CORS middleware | Stable-but-dormant (last publish years ago). Fine: tiny, done, no known issues. | Watch only; replace with a 10-line hand-rolled header if it ever bit-rots. |

Dev dependencies:

| Package | Version | Role | Assessment |
|---|---|---|---|
| `typescript` | ^6.0.3 | Compiler + typecheck gate | Current major. Both tsconfigs run `strict`; see §3 for the full flag list. |
| `vite` | ^8.0.16 | Dev server + bundler | Current-gen (Vite 8 is the **rolldown-based** line — Rust bundler, dev/prod parity). One small custom plugin in `vite.config.ts` (modulepreload injection for the heavy hero chunks) — review it on Vite majors. |
| `eslint` + `@eslint/js` + `typescript-eslint` | ^10.8.0 / ^10.0.1 / ^8.66.0 | Lint gate (CI) | Flat config (`eslint.config.js`, the v9+ format): `js.recommended` + `tseslint.recommended` + three deliberate project rules (enforced `import type`, underscore-args escape hatch, read-before-assign allowance). Harness/reference/generated dirs ignored on purpose. |
| `prettier` + `eslint-config-prettier` | ^3.9.6 / ^10.1.8 | Formatting (opt-in via `npm run format`) | Not enforced in CI yet — deliberate: the codebase predates it, so a repo-wide reformat is a one-time decision the team should make consciously (one commit, then add `format:check` to CI). |
| `tsx` | ^4.20.3 | Dev-run the TS server (`server` script) | Standard choice; prod runs compiled JS (`server:build` → `node`). |
| `concurrently` | ^9.2.0 | `dev:all` (web + api together) | Fine. It's the reason for the `shell-quote` override — see §5. |
| `@types/*` | matched to deps | Type surface for three/express/cors/node | Keep in lockstep with their runtime packages during sweeps. |

## 3. Standards compliance — the reality check

Claims below were verified against the tree, not aspirational:

- **ES2022 + ESM everywhere.** `"type": "module"` at the root; both
  tsconfigs target ES2022; Vite builds to `es2022`. No CommonJS anywhere in
  app code. `engines: ">=22"` pins the Node floor (CI runs Node 22).
- **Strict TypeScript, both sides.** Client (`tsconfig.json`): `strict`,
  `noUnusedLocals`, `noUnusedParameters`, `isolatedModules`,
  `forceConsistentCasingInFileNames`, `moduleResolution: bundler`. Server
  (`server/tsconfig.json`): all of the above plus
  `noFallthroughCasesInSwitch` and `verbatimModuleSyntax` under
  `NodeNext` resolution. `skipLibCheck` is on (standard; we typecheck our
  code, not node_modules).
- **No-`any` culture is real:** a grep for `: any` / `as any` across `src/`
  returns **zero matches**. Even the one untyped global (`window.__lenis`,
  a dev/harness hook) is accessed through a typed cast at the single write
  site, with a typed `getLenis()` accessor for app code (`src/ui/scroll.ts`).
- **Code style in practice** (spot-checked `src/ui/scroll.ts`,
  `newsletterClient.ts`): small single-purpose modules, exhaustive
  discriminated-union results (`SubscribeResult`), never-throws API clients,
  comments that explain *why*. The per-section module-pair convention
  (`src/ui/<section>.ts` + `src/styles/<section>.css`) holds across all 18
  UI modules.
- **Accessibility bar:** WCAG 2.2 AA pass landed 2026-08; the
  `prefers-reduced-motion` fallback is a standing invariant on every
  animation (`AI-README.md` rule 5).
- **Commits:** Conventional-Commits-style (`feat:`, `fix(scope):`) observed
  consistently in history. Keep it — it's free changelog material.
- **CI** (`.github/workflows/ci.yml`): typecheck (both tsconfigs) → lint →
  client build → server build, on push to main and PRs. Green CI means the
  whole repo compiles strictly and lints clean.

## 4. What we deliberately do NOT use

The full annotated list lives in **`LIBRARIES.md` §6** — don't re-litigate it
per-PR. The categories, with the one-line why:

- **UI frameworks (React/R3F/Vue) and meta-frameworks (Next/Astro):**
  reconciler between us and the frame loop; the reference class ships
  vanilla. Revisit only if the app grows real UI state (CMS, dashboards).
- **CSS frameworks / Tailwind:** the hand-measured CSS *is* the product —
  values come from measuring the reference site, not from a utility scale.
  Tokens (`--grid-space`) and shared components (`.cta-pill`) cover reuse.
- **State libraries:** the planned ~60-line app FSM (`ARCHITECTURE.md` §2.3)
  covers global state; a store library is machinery without a problem.
- **Heavy repo tooling (turbo/nx):** none until the workspaces phase ships
  two real apps and plain npm workspaces measurably hurt
  (`ARCHITECTURE.md` §2.1).
- **Test frameworks (today):** see §6 — deliberate deferral, not oversight.

## 5. Dependency policy

For whoever runs maintenance:

1. **Cadence — monthly sweep** for patch/minor updates: `npm outdated`, bump,
   `npm run test` (typecheck+lint), `npm run build`, eyeball the site once.
   Batch into one `chore(deps):` commit.
2. **three.js is the exception.** Every three bump — even a "minor" — is its
   own PR with a visual QA pass: run the harness scripts
   (`node harness/qa-*.mjs`) and compare hero/tunnel/confetti shots before
   and after. Budget an hour; three's 0.x minors rename/remove APIs monthly.
   Never let a sweep pick up three incidentally.
3. **Majors** (vite, express, zod, eslint, typescript): read the migration
   guide first (per the read-the-damn-docs rule), upgrade in isolation, one
   PR each.
4. **Pinning:** caret ranges + committed `package-lock.json` (verified
   tracked) is the policy. The lockfile is the real pin; carets keep sweeps
   cheap. Don't hard-pin except to dodge a known-bad release.
5. **Overrides:** `package.json` carries one — `"shell-quote": "^1.8.4"` —
   forcing a patched version under `concurrently`. Re-check on every sweep
   whether upstream has absorbed it; delete the override the moment it's
   redundant (stale overrides silently mask future fixes).
6. **Security automation — currently a gap.** CI does **not** run
   `npm audit`, and there's no Dependabot/Renovate config. Recommendation:
   add `npm audit --omit=dev --audit-level=high` as a CI step (runtime deps
   are only 7 packages, so noise will be near zero), or enable Dependabot
   with a monthly interval to match the sweep cadence. Either is a
   15-minute change; do one of them.

## 6. Known debt tied to the stack

Ranked by user impact:

1. **The rapier-compat chunk (847KB gzip).** `-compat` base64-inlines the
   1.6MB physics WASM into the lazy HeroScene JS chunk: the browser can't
   stream-compile it, and it bloats the JS payload the preloader waits on.
   `vite.config.ts` already mitigates with modulepreload injection so the
   fetch runs parallel to `index.js`. The real fix is swapping to
   `@dimforge/rapier3d` (a genuine `.wasm` asset, streaming compilation) —
   identical API, init plumbing only. Do it before any performance-marketing
   claims about the site.
2. **~36MB of placeholder media in `public/`.** Awaiting the real Reevez
   content pass — the capture plan and target assets are specced in
   `MEDIA-CAPTURE-PLAN.md` / `PRODUCTION-CONTENT-PLAN.md`. When the real
   media lands, run it through the asset pipeline in `LIBRARIES.md` §4
   (ffmpeg faststart mp4/webm, sharp avif/webp) rather than copying files in.
3. **No unit-test runner.** Today's gate is strict typecheck + lint + the
   browser QA harness (`harness/qa-*.mjs`), which genuinely covers the
   product's risk surface — scroll/motion/visual behavior that unit tests
   can't see. Add **Vitest** when there's logic worth unit-testing in
   isolation (the tunables registry, the app FSM, server validation edges) —
   it's the zero-friction choice since it shares Vite's config and
   transform pipeline. Adding it *now* would be ceremony.
4. **The harness is untracked.** `harness/` proved its worth but lives
   outside git; `ARCHITECTURE.md` §2.6 already plans its promotion to
   `tools/verify/` with committed goldens. Until then, treat harness scripts
   as precious-but-fragile.

---

*Update this doc when: a dependency is added/removed/majored, the policy in
§5 changes, or an item in §6 is retired (delete it — don't strike it).*
