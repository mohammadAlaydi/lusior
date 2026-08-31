# API server

Small Express + TypeScript (ESM) backend for the Reevez production portfolio. It serves
the shared project data and accepts newsletter/contact form submissions. All
responses use the `ApiResponse<T>` envelope from [`shared/projects.ts`](../shared/projects.ts).

## Run

From the **repo root** (scripts live in the root `package.json`):

```bash
npm run server     # tsx watch — API only, http://localhost:3001
npm run dev:all    # web (Vite :5173) + api (:3001) together
```

The Vite dev server proxies `/api` -> `http://localhost:3001`, so the frontend
calls `/api/...` with no CORS hassle. CORS is additionally restricted to the dev
origin `http://localhost:5173` for direct browser calls.

## Environment

Variables are loaded from a `.env` in the repo root (see `.env.example`) via
Node's built-in `process.loadEnvFile` — no dotenv dependency.

| Var               | Default                         | Purpose                                                                                        |
| ----------------- | ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `PORT`            | `3001`                          | API listen port                                                                                |
| `CORS_ORIGIN`     | `http://localhost:5173`         | Single browser origin allowed to call the API                                                  |
| `TRUST_PROXY`     | unset (off)                     | Reverse-proxy hops to trust for client IP; **unset = direct**                                  |
| `STATIC_DIR`      | unset (`dist/` in production)   | Built SPA to serve with History-API fallback; unset = API-only                                 |
| `DATA_DIR`        | `server/data/` from process CWD | Canonical durable directory for validated form JSONL; relative values resolve from process CWD |
| `SUBMISSIONS_DIR` | unset                           | Legacy alias used only when `DATA_DIR` is unset                                                |

## Production

```bash
npm run build          # frontend -> dist/
npm run server:build   # API -> server/dist/
npm run server:start   # serves API + dist/ with SPA fallback (NODE_ENV=production)
```

One process serves both the API and the built site, including deep links to
`/projects/<slug>`. Static and API responses are compressed when the client
supports it. Full deploy notes: [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).

## Endpoints

| Method | Path                  | Body                       | Success                                        |
| ------ | --------------------- | -------------------------- | ---------------------------------------------- |
| GET    | `/api/health`         | —                          | `{ status: 'ok' }`                             |
| GET    | `/api/ready`          | —                          | `{ status: 'ready', submissions: 'writable' }` |
| GET    | `/api/projects`       | —                          | `ProjectSummary[]`                             |
| GET    | `/api/projects/:slug` | —                          | `ProjectDetail`                                |
| POST   | `/api/newsletter`     | `{ email }`                | `201`, no data                                 |
| POST   | `/api/contact`        | `{ name, email, message }` | `201`, no data                                 |

- Unknown `:slug` -> `404` `{ success: false, error: 'Project not found' }`.
- An unavailable submission store -> `/api/ready` returns `503` without
  exposing the configured path or writing a submission.
- Invalid POST body -> `400` `{ success: false, error: 'Invalid fields: ...' }`
  (field names only; raw input is never echoed back).
- Unhandled error -> `500` `{ success: false, error: 'Internal server error' }`
  (no stack trace leaks to the client).

## Storage

Submissions are appended as [JSON Lines](https://jsonlines.org/) to
`<DATA_DIR>/<kind>.jsonl` (`newsletter.jsonl`, `contact.jsonl`). `DATA_DIR`
defaults to `server/data/` relative to the process working directory (the repo
root for the supplied scripts), so a compiled server never writes to
`server/dist/`. `SUBMISSIONS_DIR` remains a legacy alias when `DATA_DIR` is
unset. The directory is created on first write. Each record is
`{ kind, timestamp (ISO-8601), fields }` and stores only validated fields.

In production, set `DATA_DIR` to a writable mounted volume and include that
volume in your backup/retention plan. This file backend is persistence
only: it does **not** send email or deliver submissions to a CRM/ESP. **Do not
commit** generated `.jsonl` files — only `data/.gitkeep` is tracked.

## Security

- Security headers on every response: `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
  a `Permissions-Policy`, a tight `Content-Security-Policy`, and `X-Powered-By`
  removed.
- Zod validation on every POST body (bounded lengths, trimmed, email checked).
- Bounded in-memory fixed-window limiter shared by both write routes (10 writes
  per 60 seconds per IP) returning `429` with `Retry-After`.
- JSON body limit of 16 kb.

The file repository and limiter are process-local. Keep production at one
replica until both move to shared managed services.

## Type-checking

The server has its own `tsconfig.json` (NodeNext ESM, includes `../shared`):

```bash
npx tsc --noEmit -p server/tsconfig.json
```
