# Team Onboarding — your first day in this repo

Welcome. This is the day-one guide for developers joining the project. It tells you
what you're looking at, how to run it, the house rules that are expensive to relearn,
and where the deeper documentation lives. Read this top to bottom once; after that
you'll mostly live in `docs/AI-README.md` (the doc index) and `docs/HANDOFF.md`
(the per-section source of truth).

## 1. What this project is

This codebase is a **pixel-faithful recreation of [lusion.co](https://lusion.co)**
being rebranded as **Reevez's showcase site**. The product is not the copy or the
imagery — it is the *feel*: the layout, motion, scroll choreography, hover and click
behavior are matched to the reference site as exactly as we can measure. The stack is
Vite 8 + TypeScript (strict) + three.js + Rapier (physics, WASM) + GSAP/ScrollTrigger +
Lenis smooth scroll on the frontend, with a small Express 5 + TypeScript API in
`server/` for project data and the newsletter/contact forms. The real site hand-rolls
its engine; we use pragmatic libraries to reach the same result — that trade-off is
deliberate (see `docs/HANDOFF.md` §2).

All copy, project names, and media are **original placeholders by design** — nothing
from lusion.co's content, client list, or assets ships here. Fidelity work is driven by
measurements extracted from the reference site (the gitignored `reference/` directory);
when in doubt, the rule is *match the reference exactly, do not invent effects*.
Content is being rebranded to Reevez per `docs/PRODUCTION-CONTENT-PLAN.md` and
`docs/MEDIA-CAPTURE-PLAN.md`.

## 2. Prerequisites and first run

- **Node >= 22** — `.nvmrc` pins `22` (`nvm use` / `nvm install`). Enforced by
  `"engines"` in `package.json`; CI runs Node 22.
- npm (comes with Node). No global tooling needed.

```bash
npm install
npm run dev        # frontend only — http://localhost:5173
```

`npm run dev` is a complete dev environment on its own: the frontend fetches
`/api/...`, and when the API isn't running it **falls back to the bundled data** in
`shared/projects.ts` (see `src/data/projects.ts`). Only the newsletter/contact form
POSTs actually need the API. To run both:

```bash
npm run dev:all    # web (Vite :5173) + API (:3001); Vite proxies /api -> :3001
```

**Environment:** copy `.env.example` to `.env` — **optional in dev**, the defaults
(port 3001, CORS locked to `http://localhost:5173`) are correct as-is. The file is
loaded from the directory the server starts from (the repo root when using the root
scripts). Variables: `PORT`, `CORS_ORIGIN`, `TRUST_PROXY`, `STATIC_DIR` — each is
documented inline in `.env.example` and in `server/README.md`.

## 3. Scripts

All scripts live in the root `package.json` and run from the repo root.

| Script                 | What it does                                                                   | When to use it                                            |
| ---------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `npm run dev`          | Vite dev server on `:5173` (frontend only; `/api` proxied to `:3001`)          | Day-to-day frontend work                                  |
| `npm run dev:all`      | `dev` + `server` concurrently (`-k`, prefixed `web`/`api` logs)                | Working on forms/API, or full-stack verification          |
| `npm run server`       | `tsx watch server/src/index.ts` — API only on `:3001`                          | API-only development                                      |
| `npm run build`        | `tsc && vite build` — typechecks the frontend, bundles to `dist/`              | Before PR; producing a deployable frontend                |
| `npm run preview`      | Serves the built `dist/` via Vite                                              | Smoke-testing a production bundle locally                 |
| `npm run server:build` | `tsc -p server/tsconfig.json` — compiles the API to `server/dist/`             | Before PR (CI runs it); producing a deployable API        |
| `npm run server:start` | Runs the compiled API; in production also serves `dist/` with SPA fallback     | Production / staging (see `docs/DEPLOYMENT.md`)           |
| `npm run typecheck`    | `tsc --noEmit` for **both** tsconfigs (root bundler + server NodeNext)         | Constantly; it is the fastest full-correctness check      |
| `npm run lint`         | `eslint .` (flat config, app TypeScript only)                                  | Before every PR (CI enforces)                             |
| `npm run test`         | `typecheck` + `lint` (there is no runtime test suite yet)                      | The pre-PR one-liner                                      |
| `npm run format`       | `prettier --write .` — **do not run repo-wide** (see §6)                       | Never as-is; format individual files instead              |
| `npm run format:check` | `prettier --check .`                                                           | Curiosity only; not a CI gate                             |

Note the two TypeScript worlds: the root `tsconfig.json` (bundler resolution, covers
`src/` + `shared/`) and `server/tsconfig.json` (NodeNext ESM, covers `server/` +
`shared/`). The root `tsc` does **not** check the server — always use
`npm run typecheck` to cover both.

## 4. Repo map

| Path              | What lives there                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `index.html`      | ALL section markup in one file. Whitespace is layout-significant — never machine-format it (§6)      |
| `src/`            | Frontend TypeScript + CSS (layout below)                                                             |
| `shared/`         | The FE+BE data contract: `shared/projects.ts` — types, `ApiResponse<T>` envelope, placeholder data   |
| `server/`         | Express 5 API: routes, zod validation, rate limiting, JSONL storage. Own README: `server/README.md`  |
| `harness/`        | QA browser-driving scripts (`qa-*.mjs`) — throwaway tooling, deliberately unlinted/unformatted       |
| `docs/`           | All documentation; `docs/AI-README.md` is the index                                                  |
| `public/`         | Static assets: fonts (Aspekta), reel/tunnel media drop-points, audio loops                           |
| `reference/`      | Extracted CSS/DOM/JS of the real lusion.co — measurement ground truth. Gitignored, **never ship it** |
| `.github/`        | CI workflow (`workflows/ci.yml`)                                                                     |
| `.claude/`        | AI-agent tooling config (preview server `launch.json`, hooks)                                        |

**The `src/` convention — section module pairs.** Every page section is one pair:
`src/ui/<section>.ts` + `src/styles/<section>.css` (e.g. `ui/featured.ts` +
`styles/featured.css`), with its markup block in `index.html`. Keep new work in that
shape. The rest of `src/`:

- `src/main.ts` — boot orchestrator: fonts → preloader → intro → scene wiring. Imports everything.
- `src/scene/` — WebGL: `HeroScene.ts` (physics jacks), `TunnelScene.ts`, `endConfetti.ts`, `jackGeometry.ts`.
- `src/ui/scroll.ts` — Lenis + ScrollTrigger wiring (see §5 rule 1).
- `src/ui/splitWords.ts`, `src/styles/components.css` (`.cta-pill`), the `--grid-space`
  token in `src/styles/tokens.css` — shared infrastructure you must **reuse, not reimplement**.
- `src/data/projects.ts` — API client with offline fallback to `shared/projects.ts`.
- `src/audio/soundEngine.ts` — synthesized UI SFX + background loops (default OFF).

## 5. The rules that will save you days

These are the hard-won rules from `docs/AI-README.md` ("Hard-won rules") and
`docs/HANDOFF.md` §10 ("Gotchas") — each cost real debugging time to learn.

1. **Lenis owns scroll — `window.scrollTo` does not drive ScrollTrigger.** In app
   code, get the instance via `getLenis()` from `src/ui/scroll.ts` and call
   `lenis.scrollTo(...)`. `window.__lenis` exists too, but it is the **dev-tools /
   QA-harness hook only**, not the in-app contract — import the typed accessor so the
   compiler can check the boundary. (Source: `src/ui/scroll.ts` header comments,
   `docs/HANDOFF.md` §10, `docs/verification-playbook.md`.)
2. **Every animation needs a `prefers-reduced-motion` fallback.** This invariant holds
   across the whole site (e.g. `setupSmoothScroll()` returns `null` and native scroll
   takes over). Keep it when adding anything that moves. (`docs/HANDOFF.md` §10.)
3. **Boot always restarts at top, and `main.ts` runs exactly one
   `ScrollTrigger.refresh()` after the preloader finishes. Do not remove either.**
   Triggers are created before fonts/pin spacers settle, so without the refresh,
   deep-page triggers never fire; and creating ScrollTriggers while Chrome restores a
   deep scroll into a pinned layout crashes ScrollTrigger's init ("reading 'end'").
   Reloading mid-page and landing at the top is intentional — don't "fix" it.
   (`docs/HANDOFF.md` §10.)
4. **`#scroll-nav` must stay the last element on the page** — its green progress bar
   scrub ends at `'bottom bottom'` and is full exactly at page bottom.
   (`docs/HANDOFF.md` §10.)
5. **A hidden or occluded browser tab fully suspends `requestAnimationFrame`.** GSAP
   freezes, the preloader sits at 100, screenshots time out. It looks exactly like a
   site bug; it is not, and it self-heals on visibility. Workarounds in
   `docs/verification-playbook.md` (see §7 below).
6. **Never test against the live lusion.co in an automated browser** — it takes 5+
   minutes to load and usually never finishes. Use the extracted `reference/` data, or
   ask for screenshots. (`docs/AI-README.md`.)
7. **Vite serves missing media as `200 text/html`** (SPA fallback), so a `<video>` with
   a missing source may never fire `error`. Force `video.load()` and/or check
   `readyState === HAVE_NOTHING` after a grace period. (`docs/HANDOFF.md` §10.)

## 6. Quality gates

**Before opening a PR:** `npm run typecheck` and `npm run lint` must be green
(`npm run test` runs both). CI (`.github/workflows/ci.yml`) enforces, on every push to
`main` and every PR: `typecheck`, `lint`, `build`, `server:build`.

**Formatting policy — read this before touching Prettier.** Prettier is configured
(`.prettierrc.json`: single quotes, width 100, trailing commas) but a repo-wide
reformat has **deliberately not been applied** — a bulk `npm run format` would bury
real history in noise. Format **only the files you create or touch**:

```bash
npx prettier --write src/ui/yourfile.ts
```

**`index.html` is never machine-formatted.** The markup is measured against the
reference site and whitespace between inline elements is layout-significant; it is
listed in `.prettierignore` for that reason. Edit it by hand, carefully.

ESLint (`eslint.config.js`, flat config) covers application TypeScript only —
`harness/`, `reference/`, `public/`, `dist/`, `server/dist/` are ignored wholesale.
Two conventions it enforces: inline `import { type X }` type imports, and
underscore-prefixed unused args.

## 7. Verifying changes in the browser

Full detail: `docs/verification-playbook.md`. The short version:

- Run `npm run dev` and verify in a **desktop-width window (1440px+)**.
- **Drive scroll through Lenis, never `window.scrollTo`.** In the console:
  `window.__lenis.scrollTo(y, { immediate: true })` (dev-only global), or
  `{ duration: 22 }` for a slow cinematic ride past every trigger.
- **Verify by reading computed styles** (`clip-path` / `transform` / `opacity`) after
  a jump — not by eyeballing screenshots.
- **The hidden-tab trap:** Chrome suspends rAF for hidden/occluded tabs (§5 rule 5).
  Either bring the window to the foreground, or tick GSAP manually while hidden:
  import the Vite-served gsap dep and run `setInterval(() => gsap.ticker.tick(), 16)`
  (CSS transitions still won't advance). Exact recipes in the playbook.
- **QA harness:** `harness/` holds ready-made browser-driving scripts, run as
  `node harness/qa-<name>.mjs` against a running dev server — e.g. `qa-sweep.mjs`
  (full-page sweep), `qa-interact.mjs`, `qa-buttons.mjs`, `qa-races.mjs` (router
  races), `qa-a11y-responsive.mjs`, `qa-overscroll.mjs`. Read a script's header
  before running it; they are throwaway tools, so expect rough edges.
- Never point any of this at the live lusion.co (§5 rule 6).

## 8. Where to go next

| Doc                              | Read it when…                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `docs/AI-README.md`              | Always first — current state, conventions, and the full doc index              |
| `docs/HANDOFF.md`                | Working on any section — per-section measurements, file map, gotchas (§10)     |
| `docs/ADDING-CONTENT.md`         | Adding a project or page (data contract, media, wiring)                        |
| `docs/ARCHITECTURE.md`           | Before structural work — target architecture + 7-phase migration plan          |
| `docs/CODE-REVIEW-2026-08.md`    | Picking up backlog — the known-issues list from the latest review              |
| `docs/DEPLOYMENT.md`             | Shipping — build artifacts, env vars, single-process serve                     |
| `docs/ROADMAP.md`                | Planning — what's next and in what order                                       |
| `docs/verification-playbook.md`  | Any time the browser "looks broken" during verification                        |
| `server/README.md`               | Touching the API — endpoints, env, storage, security posture                   |

One meta-note: this repo is co-developed with AI agents, so some docs (and a
`.claude/` hook called GateGuard that intercepts agents' first write per file) are
agent-facing. They don't affect human workflows — but keeping `docs/` accurate when
you change behavior is part of the definition of done here.
