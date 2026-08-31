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
import type {
  ProjectDetail,
  ProjectLaunch,
  ProjectSummary,
  ApiResponse,
} from '../../shared/projects';
import { PROJECTS, findProject, projectSummaries } from '../../shared/projects';

/** Cache of the full summary list once resolved (live or fallback). */
let summaryCache: ProjectSummary[] | null = null;
/** Per-slug cache of resolved details. */
const detailCache = new Map<string, ProjectDetail>();

const PROJECT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;
const CSS_DIMENSION = /^\d+(?:\.\d+)?(?:px|em|rem|vw|vh|%)$/;

/** Narrow an unknown JSON body to a well-formed `ApiResponse<T>`. */
function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { success?: unknown }).success === 'boolean'
  );
}

function isProjectSummary(value: unknown): value is ProjectSummary {
  if (typeof value !== 'object' || value === null) return false;
  const project = value as Partial<ProjectSummary>;
  return (
    typeof project.slug === 'string' &&
    PROJECT_SLUG.test(project.slug) &&
    isText(project.title) &&
    isText(project.category) &&
    typeof project.accent === 'string' &&
    HEX_COLOUR.test(project.accent) &&
    isSafeUrl(project.thumb) &&
    (project.thumbVideo === undefined || isSafeUrl(project.thumbVideo))
  );
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Only root-relative or HTTP(S) assets may become media/link URLs. */
function isSafeUrl(value: unknown): value is string {
  if (!isText(value) || value.includes('\\')) return false;
  try {
    if (value.startsWith('/')) {
      if (value.startsWith('//')) return false;
      const url = new URL(value, window.location.origin);
      return url.origin === window.location.origin && url.protocol === window.location.protocol;
    }

    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

function isCssDimension(value: unknown, allowFill = false): value is string {
  return (
    typeof value === 'string' && (CSS_DIMENSION.test(value) || (allowFill && value === 'fill'))
  );
}

function isThemePalette(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const theme = value as Record<string, unknown>;
  return [
    'bg',
    'bgAlt',
    'text',
    'highlight',
    'btnBg',
    'btnText',
    'btnTextHover',
    'iconBg',
    'iconColor',
  ].every((key) => typeof theme[key] === 'string' && HEX_COLOUR.test(theme[key]));
}

function isSideListGroup(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const group = value as { title?: unknown; items?: unknown; asLinks?: unknown };
  return (
    isText(group.title) &&
    Array.isArray(group.items) &&
    group.items.every(isText) &&
    (group.asLinks === undefined || typeof group.asLinks === 'boolean')
  );
}

function isProjectLaunch(value: unknown): value is ProjectLaunch {
  if (typeof value !== 'object' || value === null) return false;
  const launch = value as Partial<ProjectLaunch>;
  return isText(launch.label) && isSafeUrl(launch.url);
}

function isMediaItem(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const media = value as Record<string, unknown>;
  if (media.kind === 'image') {
    return (
      isSafeUrl(media.src) &&
      isCssDimension(media.width) &&
      isCssDimension(media.height, true) &&
      isText(media.alt) &&
      (media.caption === undefined || isText(media.caption)) &&
      (media.fit === undefined || media.fit === 'cover' || media.fit === 'contain')
    );
  }
  if (media.kind === 'video') {
    return (
      isSafeUrl(media.src) &&
      (media.poster === undefined || isSafeUrl(media.poster)) &&
      isCssDimension(media.width) &&
      isCssDimension(media.height, true) &&
      isText(media.alt) &&
      (media.caption === undefined || isText(media.caption)) &&
      (media.fit === undefined || media.fit === 'cover' || media.fit === 'contain')
    );
  }
  if (media.kind === 'panel') {
    return (
      (media.tone === 'accent' || media.tone === 'dark' || media.tone === 'light') &&
      isCssDimension(media.width) &&
      isCssDimension(media.height, true) &&
      (media.label === undefined || isText(media.label)) &&
      (media.caption === undefined || isText(media.caption))
    );
  }
  return media.kind === 'text' && isText(media.text) && isCssDimension(media.width);
}

function isProjectDetail(value: unknown): value is ProjectDetail {
  if (!isProjectSummary(value)) return false;
  const project = value as Partial<ProjectDetail>;
  return (
    isText(project.year) &&
    Array.isArray(project.description) &&
    project.description.every(isText) &&
    Array.isArray(project.sideLists) &&
    project.sideLists.every(isSideListGroup) &&
    Array.isArray(project.launches) &&
    project.launches.length > 0 &&
    project.launches.every(isProjectLaunch) &&
    isThemePalette(project.theme) &&
    Array.isArray(project.media) &&
    project.media.every(isMediaItem) &&
    typeof project.nextSlug === 'string' &&
    PROJECT_SLUG.test(project.nextSlug)
  );
}

/**
 * The home grid intentionally has one semantic, server-rendered card per project. A
 * partial, duplicate, differently-shaped, or unknown-slug list cannot be
 * applied safely to those cards and server routes, so it is treated as an
 * invalid live response. The API may reorder the known card shells.
 */
function isFeaturedProjectList(value: unknown): value is ProjectSummary[] {
  if (!Array.isArray(value) || value.length !== PROJECTS.length || !value.every(isProjectSummary)) {
    return false;
  }

  const knownSlugs = new Set(PROJECTS.map((project) => project.slug));
  const liveSlugs = value.map((project) => project.slug);
  return (
    new Set(liveSlugs).size === value.length &&
    liveSlugs.every((slug) => knownSlugs.has(slug)) &&
    knownSlugs.size === liveSlugs.length
  );
}

function warnInvalidList(): void {
  if (import.meta.env.DEV) {
    console.warn('[projects-data] Ignoring an invalid /api/projects list; using bundled fallback.');
  }
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
  const list = isFeaturedProjectList(live) ? live : projectSummaries();
  if (live !== null && !isFeaturedProjectList(live)) warnInvalidList();

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
  const detail =
    live && live.slug === slug && isProjectDetail(live) ? live : (findProject(slug) ?? null);

  if (detail) detailCache.set(slug, detail);
  return detail;
}

/** Test/escape hatch: the offline data the loader falls back to. */
export const FALLBACK_PROJECTS: readonly ProjectDetail[] = PROJECTS;
