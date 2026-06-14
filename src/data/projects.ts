/**
 * Frontend data loader for the project-detail layer. Talks to the Express
 * backend (`/api/projects[/:slug]`, proxied by Vite in dev) and unwraps the
 * shared `ApiResponse<T>` envelope. On ANY failure — network error, non-ok
 * status, malformed envelope — it degrades gracefully to the offline copy of
 * the data baked into `shared/projects.ts`, so the UI never blocks on the API.
 *
 * A tiny in-memory cache keeps the layer snappy on repeat navigations (the
 * "next project" ring revisits the same slugs); it is intentionally process-
 * lived only (no persistence) and never caches a fallback as if it were live.
 */
import type { ProjectDetail, ProjectSummary, ApiResponse } from '../../shared/projects';
import { PROJECTS, findProject, projectSummaries } from '../../shared/projects';

/** Cache of the full summary list once resolved (live or fallback). */
let summaryCache: ProjectSummary[] | null = null;
/** Per-slug cache of resolved details. */
const detailCache = new Map<string, ProjectDetail>();

/** Narrow an unknown JSON body to a well-formed `ApiResponse<T>`. */
function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { success?: unknown }).success === 'boolean'
  );
}

/**
 * GET a `/api` endpoint and return its unwrapped `data`, or `null` on any
 * failure. Never throws — callers treat `null` as "use the fallback".
 */
async function fetchEnvelope<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;

    const body: unknown = await res.json();
    if (!isApiResponse<T>(body) || !body.success || body.data === undefined) {
      return null;
    }
    return body.data;
  } catch {
    // Network failure, JSON parse error, aborted request — fall back silently.
    return null;
  }
}

/**
 * Resolve the project summary list for the home grid. Tries the API first,
 * falls back to the bundled `projectSummaries()`. Result is cached.
 */
export async function fetchProjectList(): Promise<ProjectSummary[]> {
  if (summaryCache) return summaryCache;

  const live = await fetchEnvelope<ProjectSummary[]>('/api/projects');
  const list = Array.isArray(live) && live.length > 0 ? live : projectSummaries();

  summaryCache = list;
  return list;
}

/**
 * Resolve one full case study by slug. Tries `/api/projects/:slug`, falls back
 * to the bundled `findProject(slug)`. Returns `null` only when the slug is
 * unknown in both the API and the offline data. Result is cached per slug.
 */
export async function fetchProject(slug: string): Promise<ProjectDetail | null> {
  const cached = detailCache.get(slug);
  if (cached) return cached;

  const live = await fetchEnvelope<ProjectDetail>(`/api/projects/${encodeURIComponent(slug)}`);
  const detail = live ?? findProject(slug) ?? null;

  if (detail) detailCache.set(slug, detail);
  return detail;
}

/** Test/escape hatch: the offline data the loader falls back to. */
export const FALLBACK_PROJECTS: readonly ProjectDetail[] = PROJECTS;
