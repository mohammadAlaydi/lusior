# Production architecture

## Current and target architecture

The current codebase is a TypeScript/Vite SPA with an Express API in the same
repository. During development, Vite serves the browser bundle and proxies
`/api` requests to Express. In production, Express serves the built SPA as
well as the API. Project data is shared TypeScript; validated newsletter and
contact submissions use a repository interface backed by JSONL storage.

The target deployment preserves that intentionally simple modular monolith,
but makes the runtime boundary explicit: one immutable Node 22 container, one
unprivileged process, and one separately persistent data mount. The process
serves the Vite-built SPA from `/app/dist` and Express from the same origin.
Form submissions are the only stateful workload and are appended to a
mounted, backed-up `/app/data` volume. The supported Compose definition makes
the container root filesystem read-only; other runtimes must enforce the same
policy explicitly because a Dockerfile cannot do so by itself.

```text
Browser ──HTTPS──> CDN / reverse proxy ──HTTP──> Emryn container
                         |                      ├─ SPA static files
                         |                      ├─ /api/* Express routes
                         |                      └─ /app/data persistent volume
                         └─ TLS, compression, cache and request controls
```

This is intentionally a modular monolith: it keeps content, client UI, and
the small form API deployable as a single release. Split the form persistence
behind its repository interface into managed storage only when operational
requirements (multiple replicas, CRM integration, durable queueing, or data
retention workflows) justify it.

The current release is deliberately **single replica**. JSONL appends and the
in-memory write limiter are process-local; running multiple containers would
fragment submissions and make limits bypassable. `compose.yaml` declares one
replica. Treat any request to scale horizontally as a migration gate: move
submissions to a managed shared store and rate limits to the edge/shared store
before adding a second instance.

## Trust boundaries

| Boundary              | Responsibility                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser → edge        | HTTPS, public hostname, request-size limits, abuse controls, and TLS policy.                                                                              |
| Edge → container      | A controlled proxy hop sets forwarding headers. `TRUST_PROXY` must never trust arbitrary client header chains.                                            |
| Container → volume    | Only validated submissions are written. The volume is persistent, access-controlled, encrypted/backed up by the platform, and never baked into the image. |
| Build context → image | `.dockerignore` excludes environment files, private keys, local dependencies, build outputs, and test artifacts.                                          |

## Environment contract

| Variable          | Production value / rule                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`        | `production`                                                                                                                         |
| `PORT`            | `3001` inside the container                                                                                                          |
| `STATIC_DIR`      | `/app/dist`                                                                                                                          |
| `DATA_DIR`        | `/app/data`, a persistent writable mount                                                                                             |
| `SUBMISSIONS_DIR` | Legacy fallback only. Omit it for new deployments; if an older platform still sets it, keep it equal to `DATA_DIR` during migration. |
| `CORS_ORIGIN`     | Exact public `https://` origin; do not use `*`.                                                                                      |
| `TRUST_PROXY`     | Number of controlled proxy hops (normally `1`); `0`/unset when no proxy is present.                                                  |

Do not place secrets in image build arguments, Dockerfiles, Compose files, or
the repository. This application needs no secret to start. If external
services are added later, inject credentials at runtime with the deployment
platform's secret store and rotate them independently of images.

## Build and run

From the repository root, set the real public origin in the operator shell or
in an untracked Compose environment file, then build and start:

```sh
CORS_ORIGIN=https://www.example.com docker compose build --pull
CORS_ORIGIN=https://www.example.com docker compose up -d
docker compose ps
docker compose logs --tail=100 emryn
```

Wait for `healthy`, then verify the edge URL, a deep link, an asset response,
and the readiness route. The Compose port is loopback-only; configure HTTPS
and cache policy at an edge following
[`deploy/REVERSE-PROXY.md`](../deploy/REVERSE-PROXY.md).
Compose also enforces `read_only: true` plus a restricted `/tmp`. If the image
is launched without Compose, use the platform equivalent of Docker's
`--read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m` and mount only `/app/data`
as writable.

## Backup and restore

The JSONL submission volume is application data. Back it up before every
release and at a schedule appropriate to form volume and privacy obligations.
On Docker hosts, stop writes briefly and archive the named volume with a
temporary helper container; store the encrypted archive outside the host.

```sh
docker compose stop emryn
docker run --rm -v emryn-data:/data -v "${PWD}:/backup" alpine \
  tar -C /data -czf /backup/emryn-data-YYYY-MM-DD.tgz .
docker compose start emryn
```

To restore, stop the service, take a second safety backup, then extract the
known-good archive into `emryn-data` using a helper container. Ensure restored
files are writable by the container's `node` user, start the service, and
validate `/api/ready` plus a controlled form submission. Test restoration in
staging before relying on it in an incident.

## Rollback

Treat an image digest as the release unit. Keep the previous verified digest
and its matching release notes. To roll back, stop the new container, start
the prior digest with the same immutable environment contract and existing
`emryn-data` volume, wait for readiness, then shift edge traffic back. Do not
delete or replace the data volume during an application rollback. Schema or
storage migrations must be backwards-compatible until the rollback window has
expired.

## Release checklist

- [ ] Source, lockfile, deployment files, and content are reviewed and committed as one intended release.
- [ ] `npm ci`, `npx playwright install chromium`, and `npm run verify` pass from a clean checkout.
- [ ] `docker build` completes without secrets in its build context or image history.
- [ ] The runtime enforces a read-only root filesystem and exposes only the persistent submissions mount plus a restricted temporary filesystem.
- [ ] `docker compose up` reaches `healthy`; `/api/ready` verifies durable storage.
- [ ] `CORS_ORIGIN`, `TRUST_PROXY`, public hostname, TLS certificate, and edge forwarding headers match the real topology.
- [ ] CDN/proxy has HTTPS redirect, text compression, immutable asset caching, non-cached HTML/API, API-preserving routing, and no global SPA 200 rewrite.
- [ ] The persistent data volume is encrypted/backed up; backup restoration has been tested; retention/deletion procedures are assigned.
- [ ] CSP, monitoring, alerting, uptime checks, logs, and error reporting have been checked against the final public origin.
- [ ] Monitoring alerts when `/api/ready` is non-200; an unhealthy single replica is investigated rather than blindly restarted, because the persistent mount is likely the failing dependency.
- [ ] Desktop and mobile visual, keyboard, reduced-motion, deep-link, and form tests pass against the immutable release candidate.
- [ ] The previous image digest and a tested rollback operator are available.
