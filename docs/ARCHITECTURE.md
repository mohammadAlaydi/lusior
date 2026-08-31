# Application architecture

Current production architecture as of 2026-08-31. This is the source of truth
for code ownership; deployment details live in
[PRODUCTION-ARCHITECTURE.md](PRODUCTION-ARCHITECTURE.md).

## System shape

```text
Browser
  └─ src/main.ts (composition root)
      ├─ AppRuntime: route + overlay + suspension state
      ├─ UI controllers: menu, router, project detail, reel, featured, video
      ├─ Scene controllers: hero, tunnel, confetti, trail cursor
      └─ Shared content client with validated API fallback

HTTPS edge / CDN
  └─ one Node 22 process
      ├─ server/src/index.ts (listen + graceful shutdown only)
      └─ server/src/app.ts (import-safe Express factory)
          ├─ /api routes
          ├─ validated repository-backed submissions
          └─ compiled SPA + known-route fallback
```

This is a modular monolith by design. The site and small form API share a
release, origin, content contract, and deployment without pretending to need
distributed infrastructure.

## Dependency direction

```text
src/main.ts → src/ui, src/scene, src/audio, src/core, src/data
src/ui/scene/audio → src/core and shared contracts (never server internals)
src/data → shared/projects.ts
server/src → shared/projects.ts
shared/projects.ts → no browser or server runtime
```

`shared/projects.ts` contains plain types and reviewed data so it compiles under
both browser bundler resolution and NodeNext. Do not import DOM, filesystem, or
framework code into `shared/`.

## Browser ownership

`src/main.ts` is the only composition root. Setup modules return controllers
when they own observers, animation frames, global listeners, media, or WebGL.
The composition root propagates runtime suspension and disposes controllers on
a non-persisted `pagehide`; bfcache navigation keeps them alive for restore.

`src/core/appRuntime.ts` owns the global state that crosses section boundaries:

- route: home, known project, or not-found;
- overlay: none, menu, or video;
- derived background suspension;
- centralized Escape dispatch (overlay first, project last);
- the one document class derived from project route state.

DOM classes are outputs of state, not inputs to business logic. New overlays or
background consumers must integrate through the runtime rather than reading
unrelated elements.

Every expensive consumer combines the relevant gates:

- application suspension (project/menu/video),
- document visibility,
- section intersection where applicable,
- explicit disposal.

Reduced motion is an independent accessibility contract: it removes ornamental
motion but preserves navigation and access to all content.

## Routing and content

The client router accepts `/` and `/projects/:slug`. The production server uses
the same shared project set before serving the SPA shell, so unknown projects,
unknown paths, and missing assets are real HTTP 404s.

The home page keeps semantic fallback cards in `index.html`; hydration accepts
only a complete, unique, validated API list matching the fixed six-slot
contract. Invalid/network responses fall back to the bundled shared data.
Production smoke tests verify the DOM/API slug sets, next-project ring, and
every referenced local media asset.

## Server ownership

- `server/src/app.ts`: config resolution, middleware order, repository wiring,
  static/route policy, 404s, and error envelopes. Safe to import in tests.
- `server/src/index.ts`: port binding and SIGINT/SIGTERM shutdown only.
- `server/src/routes.ts`: thin validation/delegation/response handlers.
- `server/src/repository.ts`: durable storage interface and JSONL adapter.
- `server/src/security.ts`: CORS, CSP/security headers, and bounded limiter.

`DATA_DIR` is the canonical persistence mount. `/api/health` proves liveness;
`/api/ready` performs a real create/write/fsync/delete probe of that mount.

## Deployment constraints

The file repository and in-process limiter make this release deliberately one
replica. Before horizontal scaling, migrate submissions to managed shared
storage and abuse control to the edge/shared store. Do not add replicas first.

The supported Compose/platform runtime makes the unprivileged container root
read-only; only the mounted `/app/data` path is writable.
TLS, HSTS, public hostname, upstream request controls, and immutable asset cache
policy are owned by the edge. The application still enforces CSP, compression,
known-route fallback, no-store API responses, and durable readiness.

## Verification boundary

`npm run verify` is the release definition. It includes formatting, all three
TypeScript configurations, lint, production builds, compiled HTTP/storage/media
smoke tests, and Playwright desktop/mobile/reduced-motion/accessibility flows.
Architecture changes are incomplete until the relevant gate is extended.

## Evidence-led future evolution

These are optional optimizations, not prerequisites for the current deploy:

1. Move JSONL/limiting to managed services when a second replica or CRM/ESP
   integration is actually required.
2. Use field WebGL/WASM timing to tune the hero quality budget while preserving
   the separately cached Rapier WASM boundary and visual regression coverage.
3. Consolidate WebGL renderers behind a scene manager only if profiling shows a
   material device benefit or the visual roadmap needs cross-scene morphs.
4. Generate home cards from content data when the fixed six-slot art direction
   changes; until then the smoke-verified duplicate is intentional.
