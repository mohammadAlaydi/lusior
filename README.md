# Reevez Studio

Production portfolio for Reevez: a scroll-driven TypeScript/WebGL experience
with six real case studies and a small same-origin Express API for project data
and newsletter/contact submissions.

## Architecture

- Vite 8 + strict TypeScript for the browser application.
- three.js + Rapier for WebGL/physics; GSAP/ScrollTrigger + Lenis for motion.
- A typed application runtime coordinates routes, menu/video overlays, Escape
  priority, audio, and suspension of every expensive background controller.
- Express 5 serves the compiled SPA and API from one Node 22 process.
- `shared/projects.ts` is the versioned content/API contract used by both sides.
- Validated submissions append to a persistent JSONL volume behind a repository
  interface. The current deployment is intentionally one replica.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for module ownership and
[docs/PRODUCTION-ARCHITECTURE.md](docs/PRODUCTION-ARCHITECTURE.md) for the
runtime/deployment boundary.

## Local development

Requires Node 22 or newer (`.nvmrc`).

```bash
npm ci
npm run dev:all
```

The site runs on `http://localhost:5173`; Vite proxies `/api` to Express on
port 3001. Copy `.env.example` to `.env` only when overriding defaults.

## Release verification

Install Chromium once, then run the complete local release gate:

```bash
npx playwright install chromium
npm run verify
```

That command checks formatting, all TypeScript targets, ESLint, both production
builds, the compiled HTTP/storage/security/media contract, and desktop/mobile
browser flows including automated WCAG A/AA checks. CI runs the same layers on
every pull request.

Useful focused commands:

```bash
npm run typecheck
npm run lint
npm run build:all
npm run test:smoke   # rebuilds, then tests the compiled server
npm run test:e2e     # rebuilds, then runs browser tests
```

## Deployment

The supported release runs the `Dockerfile` image unprivileged and uses
Compose/the hosting platform to enforce a read-only root, with a persistent
`/app/data` volume and an HTTPS reverse proxy/CDN in front.

```bash
CORS_ORIGIN=https://reevez.com docker compose up --build -d
```

Before public traffic, configure the real origin/proxy topology, persistent
backups, TLS, monitoring, and retention handling for submission PII. Follow
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and the release checklist in
[docs/PRODUCTION-ARCHITECTURE.md](docs/PRODUCTION-ARCHITECTURE.md).

For a frontend-only Vercel release, the checked-in `vercel.json` builds the
Vite SPA and preserves every known project deep link. The portfolio uses its
bundled project data there; newsletter/contact persistence still requires the
full-stack deployment or a managed `SubmissionRepository` implementation.

## Documentation

- [docs/AI-README.md](docs/AI-README.md) — concise current briefing.
- [docs/ADDING-CONTENT.md](docs/ADDING-CONTENT.md) — project/content workflow.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — operator runbook.
- [docs/READINESS.md](docs/READINESS.md) — release-candidate status and external inputs.
- [docs/ROADMAP.md](docs/ROADMAP.md) — post-launch work ordered by value.
- [docs/CODE-REVIEW-2026-08.md](docs/CODE-REVIEW-2026-08.md) — historical audit record.
