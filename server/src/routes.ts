/*
 * API routes. Every handler returns the shared `ApiResponse<T>` envelope so the
 * frontend can treat success/error uniformly. Handlers stay thin: validate,
 * delegate to the repository, respond. The `:slug` lookup is guarded against
 * unknown projects (404 envelope) rather than leaking an undefined.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import {
  findProject,
  projectSummaries,
  type ApiResponse,
  type ProjectDetail,
  type ProjectSummary,
} from '../../shared/projects.js';
import type { SubmissionRepository } from './repository.js';
import { rateLimit } from './security.js';
import { parseContact, parseNewsletter } from './validation.js';

/** Strict limiter for state-changing POSTs: 10 writes per minute per client. */
const WRITE_RATE_LIMIT = { windowMs: 60_000, max: 10 } as const;

/** Build a typed success envelope. */
function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

/** Build a typed error envelope (message only — never raw input). */
function fail(error: string): ApiResponse<never> {
  return { success: false, error };
}

interface HealthStatus {
  status: 'ok';
}

interface ReadinessStatus {
  status: 'ready';
  submissions: 'writable';
}

/**
 * Assemble the API router. The repository is injected so routes have no direct
 * filesystem coupling (and tests can pass a fake).
 */
export function createApiRouter(repo: SubmissionRepository): Router {
  const router = Router();

  // Shared strict limiter guarding every write endpoint (one window per client
  // across both POSTs). GET reads below are intentionally left unthrottled.
  const writeLimiter = rateLimit(WRITE_RATE_LIMIT);

  router.get('/health', (_req: Request, res: Response<ApiResponse<HealthStatus>>): void => {
    res.json(ok({ status: 'ok' }));
  });

  router.get(
    '/ready',
    async (_req: Request, res: Response<ApiResponse<ReadinessStatus>>): Promise<void> => {
      try {
        await repo.checkWritable();
        res.json(ok({ status: 'ready', submissions: 'writable' }));
      } catch {
        // Keep host paths and filesystem details server-side. A 503 lets load
        // balancers stop traffic while liveness (`/health`) remains healthy.
        res.status(503).json(fail('Submission store unavailable'));
      }
    },
  );

  router.get('/projects', (_req: Request, res: Response<ApiResponse<ProjectSummary[]>>): void => {
    res.json(ok(projectSummaries()));
  });

  router.get(
    '/projects/:slug',
    (req: Request<{ slug: string }>, res: Response<ApiResponse<ProjectDetail>>): void => {
      const project = findProject(req.params.slug);
      if (!project) {
        res.status(404).json(fail('Project not found'));
        return;
      }
      res.json(ok(project));
    },
  );

  router.post(
    '/newsletter',
    writeLimiter,
    async (req: Request, res: Response<ApiResponse<never>>): Promise<void> => {
      const parsed = parseNewsletter(req.body);
      if (!parsed.ok) {
        res.status(400).json(fail(`Invalid fields: ${parsed.fields.join(', ')}`));
        return;
      }
      await repo.save('newsletter', parsed.value);
      res.status(201).json({ success: true });
    },
  );

  router.post(
    '/contact',
    writeLimiter,
    async (req: Request, res: Response<ApiResponse<never>>): Promise<void> => {
      const parsed = parseContact(req.body);
      if (!parsed.ok) {
        res.status(400).json(fail(`Invalid fields: ${parsed.fields.join(', ')}`));
        return;
      }
      await repo.save('contact', parsed.value);
      res.status(201).json({ success: true });
    },
  );

  return router;
}
