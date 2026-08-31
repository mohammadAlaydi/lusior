# Release readiness — 2026-08-31

## Verdict

The repository is a deployable release candidate. Product content, media,
runtime lifecycle, API persistence, security policy, container packaging, and
automated release gates are implemented. Remaining launch work is operator- and
environment-specific, not an application rewrite.

## Proved by the release gate

`npm run verify` checks:

- formatting, strict TypeScript for browser/server/tooling, and ESLint;
- production Vite and Express builds with public source maps disabled;
- liveness/readiness, real persistent writes, malformed/oversized bodies,
  rate limiting, gzip, cache/CSP/security/CORS headers, graceful 404 policy;
- every project/API/DOM slug, the next-project ring, and every referenced media asset;
- canonical metadata, robots, sitemap, and security contact;
- desktop and mobile boot/navigation/back/deep-link/menu/video/newsletter flows;
- reduced-motion behavior, console/page errors, and automated WCAG A/AA checks.

## Required deployment inputs

Before shifting public traffic, the operator must:

1. Set the exact public `CORS_ORIGIN` and correct `TRUST_PROXY` hop count.
2. Mount one writable, backed-up `DATA_DIR`; test backup restoration and define
   PII retention/deletion ownership.
3. Keep exactly one application replica until storage and limiting are shared.
4. Configure HTTPS, redirect HTTP, apply current TLS/HSTS policy, and keep
   `/api/ready` private to controlled probes.
5. Alert on `/api/health` and `/api/ready`, centralize logs, and choose public
   error telemetry if required by the operating model.
6. Run the immutable image on a real iOS Safari device and a mid-tier Android
   device, then verify the final hostname/social preview.
7. Preserve the previous image digest and perform a rollback rehearsal without
   replacing the data volume.

## Accepted constraints

- The JSONL repository is appropriate for one replica and modest form volume;
  it is not a multi-node database.
- The API stores validated leads but does not notify staff or deliver to a
  CRM/ESP. Add that integration before promising automated follow-up.
- Rapier's roughly 2 MB raw WASM payload is emitted as a separate immutable
  asset instead of being embedded in the Hero JavaScript. Monitor real-device
  load/compile timing before making further scene-budget changes.
- Automated accessibility testing complements rather than replaces manual
  keyboard, screen-reader, zoom, and real-device review.

Use [DEPLOYMENT.md](DEPLOYMENT.md) and
[PRODUCTION-ARCHITECTURE.md](PRODUCTION-ARCHITECTURE.md) as the launch runbook.
