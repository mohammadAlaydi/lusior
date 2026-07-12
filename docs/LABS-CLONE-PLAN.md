# Labs subdomain — recreation plan (labs.lusion.co)

Plan for building a second app that recreates https://labs.lusion.co — the
studio's R&D playground — as `labs.<our-domain>`, sharing this repo's
infrastructure. Same fidelity rule as the main site: match layout, motion
and interaction EXACTLY; ALL content (experiment names, thumbnails, demos,
copy) is ORIGINAL.

Status: **recon not started.** Nothing below that describes the live labs
site is ground truth yet — §2 defines exactly what to capture first. Do NOT
build from assumptions.

---

## 1. What we know / expect (to be verified)

labs.lusion.co is Lusion's experiments showcase: an index of WebGL/WebGPU
demos and R&D snippets, heavily canvas-driven, with the same interaction
language as the main site (smooth scroll, hover distortions, page
transitions). Expect: a landing/index listing experiments with media
thumbnails, per-experiment pages or embedded demos, and heavier GPU usage
than the main site (possibly WebGPU with fallback).

Everything above must be confirmed against captures before any layout code.

## 2. Recon checklist (blocking — needs the user)

Hard rule carried over: never wait on lusion properties in an automated
browser (their preloader never settles headless). Ask the user for:

**Screenshots (desktop 1440+, and mobile ~390):**
- [ ] Landing, fully loaded, top of page
- [ ] Landing scrolled: middle + bottom/footer
- [ ] Hover state on an experiment card/tile
- [ ] One experiment open (however that presents — page, overlay, or inline)
- [ ] Any menu/about/info surface

**60fps recordings (slow + natural speed):**
- [ ] Initial load → preloader → landing settle
- [ ] Full scroll down + back up (index)
- [ ] Hovering across several cards
- [ ] Clicking into an experiment + returning
- [ ] Resize behavior (if convenient)

**Bundles (curl-able, no browser needed):**
```bash
curl -s https://labs.lusion.co/ -o reference/labs/labs.html
# then fetch the hashed css/js assets referenced inside, same as HANDOFF §8
```
- [ ] HTML + hashed CSS + hashed JS into `reference/labs/` (gitignored)
- [ ] A network HAR from the user's normal browser if possible (asset
      pipeline: ktx2? draco? audio?)

Deliverable of recon: a `docs/labs-spec.md` written the same way as
`project-details-spec.md` — extracted measurements, DOM contract, motion
inventory (playbook phases A–C) — before any build agent starts.

## 3. Repo architecture: second app, shared packages

Per ARCHITECTURE.md §2.1 (workspaces must land first — migration phase 4):

```
apps/
  site/   ← the lusion.co recreation (today's src/)
  labs/   ← this plan; its own index.html, vite.config.ts, src/
packages/
  core/ motion/ webgl/ ui-kit/   ← shared by both apps
shared/
  projects.ts  experiments.ts    ← labs data contract (new)
```

- `apps/labs` is its own Vite root → its own bundle, deployed separately.
  Dev: `vite --port 5174` (script `dev:labs`; `dev:all` gains it).
- Labs consumes the SAME `packages/motion` (Lenis wiring, splitWords) and
  `packages/webgl` (renderer, SceneManager, TrackedPlane) — this is the
  whole payoff of the workspace split: labs costs sections, not
  infrastructure.
- `shared/experiments.ts`: `ExperimentSummary` (slug, title, category,
  year, media, tags) with the same `ApiResponse` envelope; served by the
  existing Express app (`GET /api/experiments`) with offline fallback,
  mirroring `shared/projects.ts`.

## 4. Content strategy: experiments are ORIGINAL demos (zero-IP by design)

The strongest move for labs: each listed "experiment" is a small WebGL demo
WE build (particles, fluid, cloth, raymarching, text effects…). The index
layout/motion matches the reference exactly; the content is genuinely ours —
better than placeholders, it's a real portfolio. Build the index with 6–8
slots; each demo is a `SceneModule` (ARCHITECTURE §2.2), one per session.
Thumbnails = captured from OUR demos. No licensing questions anywhere.

## 5. Deployment

- DNS: `labs` CNAME → same host, separate static target (or one server with
  host-based routing). Vercel/Netlify/CF Pages: two projects from one repo,
  build commands `npm run build -w apps/site` / `-w apps/labs`.
- Cross-links: main-site header/menu "Labs" → absolute URL to the
  subdomain; labs logo → main site. No shared runtime state.
- The Express API stays one deployment serving both (`CORS_ORIGIN` gains
  the labs origin).

## 6. Build phases

| # | Phase | DoD |
|---|-------|-----|
| L0 | Recon (§2) + `docs/labs-spec.md` | Spec has measurements, DOM contract, motion inventory |
| L1 | Workspace app scaffold: `apps/labs` boots with tokens/header/footer | `npm run dev:labs` renders shell at 5174 |
| L2 | Index layout static-perfect (overlay diff vs captures) | Breakpoint screenshots match |
| L3 | Index motion: preloader, reveals, hover, scroll feel (tunables from day one) | Side-by-side video passes at 0.5× |
| L4 | Experiment open/close flow + routing/transition | verify-tool scenario green |
| L5 | First 3 original demos live | 60fps mid-tier |
| L6 | Remaining demos + polish + sound | Full verification matrix |

## 7. Definition of done

- Layout/motion indistinguishable from captures at 0.5× side-by-side.
- 100% original content (names, demos, thumbnails, audio).
- Shares packages with `apps/site` — no copied infrastructure files.
- Perf: 60fps scroll on mid-tier GPU, quality tiers respected, full
  reduced-motion fallback.
- `tools/verify` scenarios exist for index scroll + experiment open.
