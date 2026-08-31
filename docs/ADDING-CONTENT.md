# Adding content — projects, sections, pages, features

The practical playbook for growing the site. Each recipe lists every file you
touch, in order, with the guardrails that catch mistakes. Updated 2026-08-31;
if reality drifts, fix this doc in the same PR that changes the process.

---

## 1. Add a project (case study)

Project data lives in ONE place — [`shared/projects.ts`](../shared/projects.ts)
(consumed by the frontend bundle _and_ the API) — but the home grid is a fixed
six-slot, server-rendered showcase with hand-written shells in `index.html`.
Changing the set or count is a coordinated frontend + API release, not a CMS-
only change. Until tile generation is built (ROADMAP), replacing or adding a
slot is this exact ritual:

### 1.1 Data entry — `shared/projects.ts`

Append a `ProjectDetail` object to the `PROJECTS` array:

| Field                         | Notes                                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`                        | URL segment (`/projects/<slug>`), kebab-case, unique                                                                                          |
| `title`, `category`, `accent` | Tile + header content; `category` is the bullet-separated line                                                                                |
| `thumb`, `thumbVideo`         | Grid tile media under `/media/<slug>/`; video is optional                                                                                     |
| `year`, `description[]`       | One array entry per paragraph                                                                                                                 |
| `sideLists[]`                 | Services / Credits groups (`asLinks` for external links)                                                                                      |
| `launches[]`                  | One or more direct website/store destinations (`label`, safe HTTPS `url`)                                                                     |
| `theme`                       | 9-color palette; keep contrast ≥ 4.5:1 for `text` on `bg`                                                                                     |
| `media[]`                     | Gallery items: `image` \| `video` \| `panel` \| `text` (see the `MediaItem` union)                                                            |
| `nextSlug`                    | **Re-wire the ring**: point the _previous last_ project's `nextSlug` at the new slug, and the new project's `nextSlug` back at the ring start |

### 1.2 Tile markup — `index.html` (`#featured-grid`)

Copy an existing `.project-item` block (~19 lines, e.g. lines 305-322) and
update: `href`, `data-slug`, `--accent`, `aria-label`, the
`.project-item-media` background image, `.project-item-line-1` (category) and
`.project-item-name` (title). The slug appears **twice**, the title twice —
miss one and the dev validator flags it.

### 1.3 Media files — `public/media/<slug>/`

Use project-owned or explicitly licensed media only. The tile needs one poster
(JPG/PNG/WebP); a loop is optional. Budget (enforced by review, not tooling):
poster ≤ 300KB; loop ≤ 2.5MB, H.264 720p, 24fps, no audio track.

### 1.4 Verify

- `npm run dev` — the console warns `[projects-data] …` on any duplicate slug,
  broken next-ring, or missing/orphan tile
  (`src/data/validateProjects.ts` runs automatically in dev).
- Click the new tile; check theme colors, gallery, next-project advance,
  deep-link (`/projects/<new-slug>` with a hard refresh), and back-button.
- `npm run typecheck && npm run lint`.

---

## 2. Add a home-page section

The codebase convention is a module pair per section:

1. **Markup** — add the section element in `index.html`, _before_
   `#scroll-nav` (hard rule: `#scroll-nav` stays the last element).
2. **Styles** — `src/styles/<section>.css`; import it in `main.ts` with the
   others; use `--grid-space` and tokens from `tokens.css`; include a
   `@media (prefers-reduced-motion: reduce)` block for every
   transition/animation (project rule — CI review checks this).
3. **Behavior** — `src/ui/<section>.ts` exporting `setup<Section>Section()`;
   call it from `boot()` in `main.ts` in DOM order.
4. **Scroll wiring** — create ScrollTriggers inside the setup function; boot
   already runs one `ScrollTrigger.refresh()` after the preloader, don't add
   more. Drive scroll only through Lenis (`getLenis()` from
   `src/ui/scroll.ts`), never `window.scrollTo`.
5. **Scroll-nav** — if the section should appear in the right-edge progress
   nav, extend the sections list consumed by `src/ui/scrollNav.ts`.
6. **Sound** — if the section changes the music scene, add an
   IntersectionObserver zone in `main.ts` next to the tunnel/end zones.

---

## 3. Add a page (new route)

Today the router ([`src/ui/router.ts`](../src/ui/router.ts)) knows exactly two
routes: `/` and `/projects/:slug`, both rendered inside the single `index.html`
document (the detail layer is an overlay, not a separate page). Adding a real
page means extending that model deliberately:

- **Another overlay route** (e.g. `/about`): follow the projects pattern —
  a `Route` variant in `routeFromPath`, an overlay controller like
  `projectDetail.ts`, and a swap at the transition midpoint. This preserves
  the single-document, no-reload feel.
- **A separate document** (e.g. `/labs`): treat it as a deliberate architecture
  and deployment change. Give it an explicit server route/build boundary rather
  than bolting a second full page into this document.

Server note: the production server serves `index.html` only for `/` and known
`/projects/:slug` routes. Any new client route must be added to the server's
known-page gate so unknown paths and missing assets continue to return 404.

---

## 4. Add an API endpoint

1. Schema in `server/src/validation.ts` (zod; bounded lengths; never echo
   input).
2. Route in `server/src/routes.ts` — return the `ApiResponse<T>` envelope;
   attach `writeLimiter` to anything state-changing.
3. Persistence via the `SubmissionRepository` interface
   (`server/src/repository.ts`) — don't reach for the filesystem in routes.
4. Types shared with the frontend go in `shared/projects.ts`.
5. Frontend consumption follows `src/data/projects.ts` /
   `src/ui/newsletterClient.ts`: unwrap the envelope, degrade gracefully,
   never block UI on the API.

---

## 5. Feature-work guardrails

- Read [AI-README.md](AI-README.md) "Invariants" first; they define the current
  lifecycle, content, and deployment contracts.
- Keep feel constants (lerp factors, thresholds) named at module scope. When a
  value changes, update the relevant browser regression or measurement note.
- Every interactive element: keyboard path + focus visibility + reduced-motion
  behavior are part of "done" (see the fixed patterns in
  `src/ui/videoOverlay.ts` and `src/ui/projectDetail.ts`).
- Verify user-visible work with `npm run test:e2e` plus a focused real-browser
  walkthrough; a green TypeScript build is not verification for motion work.
