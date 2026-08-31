# AI briefing

## Product

This repository is the production Reevez Studio portfolio. It contains original
Reevez copy, seven real case studies, reviewed local media, an immersive WebGL
home experience, client-routed project details, and newsletter/contact APIs.
Do not reintroduce reference-site names, placeholder projects, example domains,
or unlicensed media.

## Start here

1. Read the repository `AGENTS.md`/`CLAUDE.md` instructions and preserve unrelated changes.
2. Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing module boundaries.
3. Use [ADDING-CONTENT.md](ADDING-CONTENT.md) for project/media changes.
4. Use [DEPLOYMENT.md](DEPLOYMENT.md) for runtime or hosting changes.
5. Finish any implementation with the fresh checks relevant to it; a release uses `npm run verify`.

## Current architecture

- `src/main.ts` is the browser composition root.
- `src/core/appRuntime.ts` owns typed route/overlay/suspension state and Escape priority.
- `src/ui/*` and `src/scene/*` modules own one experience and expose lifecycle controllers when needed.
- `shared/projects.ts` is the browser/server content and API contract.
- `server/src/app.ts` is an import-safe Express factory.
- `server/src/index.ts` only listens and handles process shutdown.
- One production container serves the SPA and API; validated submissions persist under `DATA_DIR`.

## Invariants

- Never use DOM classes as hidden application state; derive them from `AppRuntime`.
- Every animation/render/media loop must honor reduced motion where relevant,
  document visibility, runtime suspension, and disposal.
- Unknown routes, projects, and missing assets stay real 404s in production.
- Browser/API content is untrusted at the rendering boundary: validate shapes,
  allowlist URLs/dimensions, and escape generated markup.
- `CORS_ORIGIN` is exact, `TRUST_PROXY` matches controlled hops, and the proxy
  overwrites forwarding headers.
- This release is one replica until persistence and limiting are shared.
- Submission files contain PII: never commit them; back up, retain, and delete
  them under an explicit operator policy.

## Commands

```bash
npm ci
npm run dev:all
npm run typecheck
npm run lint
npm run build:all
npm run test:smoke
npm run test:e2e
npm run verify
```

`test:smoke` and `test:e2e` rebuild before running so they cannot silently test
stale ignored artifacts. CI uses the corresponding `:compiled` commands after
one shared build.

## Known intentional constraints

- Rapier is emitted as a separate hashed WASM asset by `vite-plugin-wasm`; keep
  that boundary and the compiled MIME/CSP/browser regression checks intact.
- Home cards are semantic static markup hydrated from the shared project data
  contract; production smoke tests enforce that they match.
- JSONL persistence does not send emails or forward leads to a CRM/ESP.
- TLS, HSTS, uptime alerts, backup automation, and public error telemetry are
  deployment-platform responsibilities.

Historical fidelity notes remain in `HANDOFF.md`, `PROJECTS-FIDELITY.md`, and
`CODE-REVIEW-2026-08.md`; they are evidence records, not current architecture.
