/*
 * Express app bootstrap.
 *
 * Wiring order matters: security headers + CORS first, then a bounded JSON body
 * parser, then the API router (POST routes carry their own strict rate limiter),
 * and finally the 404 + central error handlers. The error handler returns a
 * generic 500 envelope and never leaks a stack trace (details go to stderr only).
 */

import express from 'express';
import type { NextFunction, Request, Response } from 'express';

import type { ApiResponse } from '../../shared/projects.js';
import { FileSubmissionRepository } from './repository.js';
import { createApiRouter } from './routes.js';
import { corsMiddleware, securityHeaders } from './security.js';

const DEFAULT_PORT = 3001;
const JSON_BODY_LIMIT = '16kb';

/** Build a fully wired app without binding a port (handy for tests). */
export function createApp(): express.Express {
  const app = express();

  // Don't advertise the framework.
  app.disable('x-powered-by');
  // We sit behind the Vite dev proxy; trust it so req.ip is the real client.
  app.set('trust proxy', true);

  app.use(securityHeaders());
  app.use(corsMiddleware());
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  // Rate limiting is applied per-route to the state-changing POSTs only (see
  // routes.ts); GET reads are cheap and cacheable, so they stay unthrottled.
  const repo = new FileSubmissionRepository();
  app.use('/api', createApiRouter(repo));

  // Unknown route -> JSON 404 envelope (keeps the contract for the SPA fetch).
  app.use((_req: Request, res: Response<ApiResponse<never>>): void => {
    res.status(404).json({ success: false, error: 'Not found' });
  });

  // Central error handler. The 4-arg signature is required for Express to treat
  // this as an error handler — `_next` is unused but must be present.
  app.use(
    (
      err: unknown,
      _req: Request,
      res: Response<ApiResponse<never>>,
      _next: NextFunction,
    ): void => {
      const message = err instanceof Error ? err.message : String(err);
      // Server-side detail only; never sent to the client.
      process.stderr.write(`[api] unhandled error: ${message}\n`);
      if (res.headersSent) {
        return;
      }
      res.status(500).json({ success: false, error: 'Internal server error' });
    },
  );

  return app;
}

/** Resolve the listen port from the environment, falling back to 3001. */
export function resolvePort(): number {
  const raw = process.env.PORT;
  if (!raw) {
    return DEFAULT_PORT;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

const port = resolvePort();
createApp().listen(port, (): void => {
  process.stdout.write(`[api] listening on http://localhost:${port}\n`);
});
