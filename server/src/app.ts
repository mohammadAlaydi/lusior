/*
 * Express application factory.
 *
 * This module is deliberately safe to import: it wires and returns an app,
 * but never binds a port or installs process signal handlers. The thin
 * process entrypoint lives in index.ts.
 */

import './env.js';

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import compression from 'compression';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';

import { findProject, type ApiResponse } from '../../shared/projects.js';
import { FileSubmissionRepository } from './repository.js';
import { createApiRouter } from './routes.js';
import { corsMiddleware, securityHeaders } from './security.js';

const DEFAULT_PORT = 3001;
const JSON_BODY_LIMIT = '16kb';
const PROJECT_ROUTE = /^\/projects\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;

/**
 * Resolve Express's `trust proxy` setting from TRUST_PROXY. Unset means the
 * server is reached directly, so client-supplied X-Forwarded-For must NOT be
 * trusted (a spoofed header would defeat the IP-keyed rate limiter). Behind a
 * real reverse proxy set the hop count (`TRUST_PROXY=1`) or a keyword/CIDR
 * (`loopback`, `10.0.0.0/8`); `true` is accepted but mapped to one hop, since
 * trusting arbitrary chains is exactly the spoofing hole.
 */
export function resolveTrustProxy(): boolean | number | string {
  const raw = process.env.TRUST_PROXY?.trim();
  if (!raw || raw === 'false' || raw === '0') {
    return false;
  }
  if (raw === 'true') {
    return 1;
  }
  const hops = Number.parseInt(raw, 10);
  return Number.isFinite(hops) && String(hops) === raw ? hops : raw;
}

/**
 * Directory of the built SPA to serve, or '' to run API-only (the dev setup,
 * where Vite serves the frontend and proxies /api here). STATIC_DIR opts in
 * explicitly; NODE_ENV=production defaults to the repo's dist/ build output.
 */
export function resolveStaticDir(): string {
  const raw = process.env.STATIC_DIR?.trim();
  if (raw) {
    return resolve(raw);
  }
  return process.env.NODE_ENV === 'production' ? resolve('dist') : '';
}

/**
 * Resolve the durable directory used for validated form submissions. DATA_DIR
 * is canonical; SUBMISSIONS_DIR remains a backwards-compatible alias and is
 * only consulted when DATA_DIR is unset. Either value may be absolute or
 * relative to the process working directory. The default intentionally derives
 * from process.cwd(), not this compiled module's path, so production builds
 * never write into server/dist.
 */
export function resolveDataDir(): string {
  const configured = process.env.DATA_DIR?.trim() || process.env.SUBMISSIONS_DIR?.trim();
  return configured ? resolve(configured) : resolve(process.cwd(), 'server', 'data');
}

/** True only for page routes the client can actually resolve. */
function isKnownPagePath(path: string): boolean {
  if (path === '/') return true;
  const match = PROJECT_ROUTE.exec(path);
  return match !== null && findProject(match[1]) !== undefined;
}

/** Build a fully wired app without binding a port (handy for tests). */
export function createApp(): express.Express {
  const app = express();

  // Don't advertise the framework.
  app.disable('x-powered-by');
  app.set('trust proxy', resolveTrustProxy());

  app.use(securityHeaders());
  app.use(corsMiddleware());
  app.use(compression());
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  // Rate limiting is applied per-route to the state-changing POSTs only (see
  // routes.ts); GET reads are cheap and cacheable, so they stay unthrottled.
  const repo = new FileSubmissionRepository(resolveDataDir());
  app.use('/api', createApiRouter(repo));

  // Vite omits dot-prefixed public directories from its release copy. Keep
  // the RFC 9116 contact at its canonical well-known URL as an explicit,
  // versioned server contract instead of enabling arbitrary static dotfiles.
  app.get('/.well-known/security.txt', (_req: Request, res: Response): void => {
    res
      .type('text/plain')
      .set('Cache-Control', 'public, max-age=3600')
      .send(
        [
          'Contact: mailto:contact@reevez.com',
          'Expires: 2027-08-31T23:59:59Z',
          'Canonical: https://reevez.com/.well-known/security.txt',
          'Preferred-Languages: en',
          '',
        ].join('\n'),
      );
  });

  // Production single-process deploy: serve the built SPA and answer deep
  // links (/projects/<slug>) with the shell so client routing can take over.
  // Hashed assets under /assets are immutable; the shell itself must revalidate.
  const staticDir = resolveStaticDir();
  if (staticDir && existsSync(join(staticDir, 'index.html'))) {
    app.use(
      express.static(staticDir, {
        setHeaders: (res, filePath) => {
          if (/[\\/]assets[\\/][^\\/]*-[\w-]{8,}\./.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    app.use((req: Request, res: Response, next: NextFunction): void => {
      const isPageRequest = isKnownPagePath(req.path);
      if ((req.method !== 'GET' && req.method !== 'HEAD') || !isPageRequest) {
        next();
        return;
      }
      res.sendFile(join(staticDir, 'index.html'));
    });
  }

  // Unknown route -> JSON 404 envelope (keeps the contract for the SPA fetch).
  app.use((_req: Request, res: Response<ApiResponse<never>>): void => {
    res.status(404).json({ success: false, error: 'Not found' });
  });

  // Central error handler. The 4-arg signature is required for Express to treat
  // this as an error handler — `_next` is unused but must be present.
  app.use(
    (err: unknown, _req: Request, res: Response<ApiResponse<never>>, next: NextFunction): void => {
      if (res.headersSent) {
        // Let Express's final handler close/finish a response that failed after
        // headers were committed instead of silently abandoning the chain.
        next(err);
        return;
      }
      // body-parser (and friends) attach the real HTTP status: malformed JSON
      // is a 400, an oversized body a 413, a bad charset a 415. Answer with
      // that status and a generic message — client noise must not surface as
      // 500s, and err.message can embed raw body fragments, so it is never
      // logged for client errors.
      const status = statusFromError(err);
      if (status >= 400 && status < 500) {
        res.status(status).json({ success: false, error: clientErrorMessage(status) });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      // Server-side detail only; never sent to the client.
      process.stderr.write(`[api] unhandled error: ${message}\n`);
      res.status(500).json({ success: false, error: 'Internal server error' });
    },
  );

  return app;
}

/** Pull an HTTP status off an error-like object, defaulting to 500. */
function statusFromError(err: unknown): number {
  if (typeof err === 'object' && err !== null) {
    const candidate =
      (err as { status?: unknown }).status ?? (err as { statusCode?: unknown }).statusCode;
    if (typeof candidate === 'number' && candidate >= 400 && candidate < 600) {
      return candidate;
    }
  }
  return 500;
}

/** Generic client-error text per status — never echoes request content. */
function clientErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Invalid request body';
    case 413:
      return 'Payload too large';
    case 415:
      return 'Unsupported content type';
    default:
      return 'Bad request';
  }
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
