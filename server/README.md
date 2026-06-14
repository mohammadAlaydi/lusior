# API server

Small Express + TypeScript (ESM) backend for the Lusion recreation. It serves the
shared project data and accepts the newsletter/contact form submissions. All
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

| Var    | Default | Purpose            |
| ------ | ------- | ------------------ |
| `PORT` | `3001`  | API listen port    |

## Endpoints

| Method | Path                  | Body                        | Success            |
| ------ | --------------------- | --------------------------- | ------------------ |
| GET    | `/api/health`         | —                           | `{ status: 'ok' }` |
| GET    | `/api/projects`       | —                           | `ProjectSummary[]` |
| GET    | `/api/projects/:slug` | —                           | `ProjectDetail`    |
| POST   | `/api/newsletter`     | `{ email }`                 | `201`, no data     |
| POST   | `/api/contact`        | `{ name, email, message }`  | `201`, no data     |

- Unknown `:slug` -> `404` `{ success: false, error: 'Project not found' }`.
- Invalid POST body -> `400` `{ success: false, error: 'Invalid fields: ...' }`
  (field names only; raw input is never echoed back).
- Unhandled error -> `500` `{ success: false, error: 'Internal server error' }`
  (no stack trace leaks to the client).

## Storage

Submissions are appended as [JSON Lines](https://jsonlines.org/) to
`server/data/<kind>.jsonl` (`newsletter.jsonl`, `contact.jsonl`). The `data/`
directory is created on first write. Each record is
`{ kind, timestamp (ISO-8601), fields }` and stores only validated fields.
**Do not commit** the generated `.jsonl` files — only `data/.gitkeep` is tracked.

## Security

- Security headers on every response: `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
  a `Permissions-Policy`, a tight `Content-Security-Policy`, and `X-Powered-By`
  removed.
- Zod validation on every POST body (bounded lengths, trimmed, email checked).
- In-memory fixed-window rate limiter on `/api` (20 req / 60 s per IP) returning
  `429` with `Retry-After`.
- JSON body limit of 16 kb.

## Type-checking

The server has its own `tsconfig.json` (NodeNext ESM, includes `../shared`):

```bash
npx tsc --noEmit -p server/tsconfig.json
```
