/*
 * Security middleware: response headers, strict API/browser CSPs, and a
 * bounded in-memory fixed-window rate limiter for POST endpoints.
 *
 * We hand-roll the headers (helmet-style) rather than add a dependency — the set
 * is small and the values are static. CORS is delegated to the `cors` package
 * but locked to a single origin read from CORS_ORIGIN. The rate limiter is simple
 * (single-process, in-memory) — adequate for this deliberately single-replica
 * release; move it to a shared/edge store before horizontal scaling.
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
  ['Cross-Origin-Opener-Policy', 'same-origin'],
  ['Origin-Agent-Cluster', '?1'],
];

/**
 * API responses are JSON only — lock those down hard so a stray HTML response
 * can never execute scripts or load remote resources. Scoped to /api because
 * in production the same process also serves the SPA, whose HTML this policy
 * would break (a site-wide CSP is a separate, deliberate exercise — see
 * docs/DEPLOYMENT.md).
 */
const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";

/**
 * The production SPA is fully self-hosted. Inline styles are currently needed
 * by the authored document and motion system; scripts remain external and
 * Rapier requires the narrow WebAssembly compilation capability.
 */
const SPA_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Apply static security headers and strip the framework fingerprint. `app`
 * still has `x-powered-by` enabled by default, so we remove it per-response in
 * addition to `app.disable('x-powered-by')` at bootstrap.
 */
export function securityHeaders(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.removeHeader('X-Powered-By');
    for (const [name, value] of SECURITY_HEADERS) {
      res.setHeader(name, value);
    }
    if (req.path.startsWith('/api')) {
      res.setHeader('Content-Security-Policy', API_CSP);
      res.setHeader('Cache-Control', 'no-store');
    } else {
      res.setHeader('Content-Security-Policy', SPA_CSP);
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
  /** Fixed-window length in milliseconds. */
  windowMs: number;
  /** Max requests allowed per key per window. */
  max: number;
  /** Hard memory bound for unique client keys in one process. */
  maxKeys?: number;
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
  options: RateLimitOptions = { windowMs: 60_000, max: 20, maxKeys: 10_000 },
): RequestHandler {
  const buckets = new Map<string, WindowState>();
  const maxKeys = options.maxKeys ?? 10_000;
  let nextPruneAt = 0;

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';

    // Prune at most once per window. Scanning the entire key set on every hit
    // turns a distributed-IP flood into avoidable O(n) work per request.
    if (now >= nextPruneAt) {
      for (const [bucketKey, state] of buckets) {
        if (state.resetAt <= now) {
          buckets.delete(bucketKey);
        }
      }
      nextPruneAt = now + options.windowMs;
    }

    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      // Fail closed when the bounded key table is saturated. The public edge
      // remains the primary distributed-abuse control; this protects a lone
      // application process from unbounded memory growth if the edge fails.
      if (!existing && buckets.size >= maxKeys) {
        res.setHeader('Retry-After', String(Math.ceil(options.windowMs / 1000)));
        res.status(429).json(RATE_LIMITED);
        return;
      }
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
