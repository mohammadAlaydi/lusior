/*
 * Security middleware: response headers, a light CSP, and a tiny in-memory
 * fixed-window rate limiter for POST endpoints.
 *
 * We hand-roll the headers (helmet-style) rather than add a dependency — the set
 * is small and the values are static. CORS is delegated to the `cors` package
 * but locked to a single origin read from CORS_ORIGIN. The rate limiter is simple
 * (single-process, in-memory) — adequate for a placeholder backend; a real
 * deployment would move this to a shared store.
 */

import cors from 'cors';
import type { CorsOptions } from 'cors';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { ApiResponse } from '../../shared/projects.js';

/** Default browser origin when CORS_ORIGIN is not set in the environment. */
const DEFAULT_ORIGIN = 'http://localhost:5173';

/**
 * Allowed browser origin, read from the environment. Never falls back to '*' —
 * an explicit single origin keeps the API locked to a known caller.
 */
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN ?? DEFAULT_ORIGIN;

/** Static security headers applied to every response. */
const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['X-Frame-Options', 'DENY'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
  // API responses are JSON only — lock the page down hard so a stray HTML
  // response can never execute scripts or load remote resources.
  [
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  ],
];

/**
 * Apply static security headers and strip the framework fingerprint. `app`
 * still has `x-powered-by` enabled by default, so we remove it per-response in
 * addition to `app.disable('x-powered-by')` at bootstrap.
 */
export function securityHeaders(): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.removeHeader('X-Powered-By');
    for (const [name, value] of SECURITY_HEADERS) {
      res.setHeader(name, value);
    }
    next();
  };
}

/** CORS restricted to the configured origin; only the verbs the API uses. */
export function corsMiddleware(): RequestHandler {
  const options: CorsOptions = {
    origin: ALLOWED_ORIGIN,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    maxAge: 86400,
  };
  return cors(options);
}

interface RateLimitOptions {
  /** Sliding window length in milliseconds. */
  windowMs: number;
  /** Max requests allowed per key per window. */
  max: number;
}

interface WindowState {
  count: number;
  /** Epoch ms at which the current window resets. */
  resetAt: number;
}

const RATE_LIMITED: ApiResponse<never> = {
  success: false,
  error: 'Too many requests. Please try again shortly.',
};

/**
 * Fixed-window rate limiter keyed by client IP. Stale windows are pruned
 * opportunistically on each hit to keep the map from growing unbounded under a
 * long-lived process.
 */
export function rateLimit(
  options: RateLimitOptions = { windowMs: 60_000, max: 20 },
): RequestHandler {
  const buckets = new Map<string, WindowState>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';

    // Opportunistic prune of expired windows.
    for (const [bucketKey, state] of buckets) {
      if (state.resetAt <= now) {
        buckets.delete(bucketKey);
      }
    }

    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (existing.count >= options.max) {
      const retryAfterSec = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json(RATE_LIMITED);
      return;
    }

    existing.count += 1;
    next();
  };
}
