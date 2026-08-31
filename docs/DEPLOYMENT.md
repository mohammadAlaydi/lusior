# Deployment

How to ship the Reevez showcase. As of 2026-08-31 the repo contains a real,
tested single-process deploy path; this doc is its runbook.

## The model

One Node process (the Express server) serves everything:

- `/api/*` — the newsletter/contact API (rate-limited, zod-validated,
  API-scoped CSP).
- Everything else — the built frontend from `dist/`, with a History-API
  fallback only for real project deep links such as `/projects/magic-stamp`.
  Unknown projects/routes remain real 404s. Hashed `/assets/*` files get
  immutable cache headers.

For public traffic, put a TLS-capable reverse proxy/CDN in front and proxy all
paths to this Node process. That preserves the tested server-side 404 policy
and the SPA/API security headers. The provided Compose port is loopback-only;
direct public exposure is not a supported production topology.

## Build + run

```bash
npm ci
npx playwright install chromium
npm run verify         # format, types, lint, builds, HTTP + browser/a11y gates
```

```bash
# production process (set env via your process manager / container)
NODE_ENV=production node server/dist/server/src/index.js
# or, equivalently:
npm run server:start   # remember to set NODE_ENV=production in the environment
```

Static serving activates when `NODE_ENV=production` (serves `./dist` relative
to the working directory) or when `STATIC_DIR` points at a build. Start the
process from the repo root so relative paths resolve.

## Vercel frontend deployment

`vercel.json` provides a static Vite deployment for the public portfolio. It
preserves the seven known `/projects/<slug>` deep links and mirrors the SPA's
production security headers. Deploy it with `vercel deploy --prod` from the
repository root.

This target is intentionally frontend-only. Project reads fall back to the
bundled, validated `shared/projects.ts` data when `/api` is absent, so all case
studies remain available. Newsletter/contact writes are not deployed to Vercel:
the current API stores PII in JSONL files and Vercel's function filesystem is
not a durable submission store. Use the single-process deployment below for
the complete API, or migrate `SubmissionRepository` to managed durable storage
before adding a Vercel function adapter.

## Environment variables

Loaded from `.env` in the working directory via Node's built-in
`process.loadEnvFile` (`server/src/env.ts`) — real deployments should prefer
the platform's env mechanism over a file.

| Var               | Default                            | Set in production to                                                                                                                                                                                       |
| ----------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`            | `3001`                             | whatever your platform routes to                                                                                                                                                                           |
| `CORS_ORIGIN`     | `http://localhost:5173`            | `https://<your-domain>` — exact origin, never `*`                                                                                                                                                          |
| `TRUST_PROXY`     | unset (off)                        | `1` behind one nginx/LB hop. **Leave unset if exposed directly** — trusting client `X-Forwarded-For` lets attackers spoof the rate limiter. Ensure the proxy _overwrites_ (not appends) `X-Forwarded-For`. |
| `STATIC_DIR`      | `dist/` when `NODE_ENV=production` | usually leave default                                                                                                                                                                                      |
| `DATA_DIR`        | `server/data/` from process CWD    | an absolute path on a writable, mounted persistent volume (for example `/var/lib/reevez/submissions`)                                                                                                      |
| `SUBMISSIONS_DIR` | unset                              | legacy alias only; migrate deployments to `DATA_DIR`                                                                                                                                                       |
| `NODE_ENV`        | unset                              | `production`                                                                                                                                                                                               |

## Supported edge topology

Proxy `/api/*`, `/projects/*`, assets, and the home page through the same Node
process. Do not replace the application with a proxy-wide SPA fallback or a
separate nginx static root: those variants bypass the tested known-route 404
logic and, unless duplicated exactly, the Express security policy. Use
[`deploy/REVERSE-PROXY.md`](../deploy/REVERSE-PROXY.md) and the supplied nginx
fragment as the edge contract.

## Data

Form submissions append to `<DATA_DIR>/*.jsonl`; when unset this is
`server/data/` relative to the process working directory. Configure `DATA_DIR`
to an absolute path on a writable mounted volume that survives deploys, and
include it in a controlled backup/retention plan — **emails are PII**. The files
are gitignored. `SUBMISSIONS_DIR` is accepted as a compatibility alias only when
`DATA_DIR` is unset.

This backend persists validated submissions only. It does **not** send an email
notification or deliver leads to a CRM/ESP; wire one of those systems in before
depending on it for marketing or customer-response workflows.

## Pre-launch checklist

- [ ] `CORS_ORIGIN` set to the real origin; `TRUST_PROXY` matches topology
- [ ] Deployment is exactly one replica; shared persistence/limiting is required before scaling
- [ ] `DATA_DIR` is a writable mounted persistent volume with controlled backups
- [ ] A host-local/platform-internal request to `/api/ready` returns **200** and
      reports writable submissions; the public edge returns **403** for that path
- [ ] `curl https://<domain>/projects/magic-stamp` returns the SPA shell (200),
      while a missing asset and an unknown route return **404**
- [ ] `curl -X POST https://<domain>/api/newsletter` with bad JSON returns
      **400** (not 500); 11 rapid POSTs return a **429**
- [ ] `/api/*` carries the deny-all API CSP; HTML carries the enforced self-hosted SPA CSP
- [ ] HTTPS + HTTP→HTTPS redirect at the proxy/platform layer
- [ ] Real-device pass: mid-tier Android (LCP + physics framerate), iOS
      Safari (viewport units, video autoplay), keyboard-only walkthrough
- [ ] Release image contains only the reviewed case-study/reel media set and no
      removed placeholder assets; spot-check representative media responses
- [ ] SEO scaffolding (robots.txt, sitemap, OG image, canonical) matches the final domain
- [ ] Liveness check on `/api/health`; actionable storage alert on non-200 `/api/ready`

## Known gaps (tracked in ROADMAP)

- Rate limiting is in-memory per-process — fine for one instance; move to a
  shared store before scaling horizontally.
- No error telemetry (Sentry or similar) — decide before launch.
