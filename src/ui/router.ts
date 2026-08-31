import type { ProjectDetail } from '../../shared/projects';
import { getAppRuntime, type AppRoute } from '../core/appRuntime';
import type { SoundEngine } from '../audio/soundEngine';
import type { Transition } from './transition';
import type { ProjectDetailController } from './projectDetail';

/** History-API router for the home and project-detail routes. */
export interface Router {
  start(): void;
  navigate(path: string, opts?: { replace?: boolean }): void;
  dispose(): void;
}

export interface RouterDeps {
  detail: ProjectDetailController;
  transition: Transition;
  sound?: SoundEngine;
  loadProject: (slug: string) => Promise<ProjectDetail | null>;
  /** Optional structured logger; navigation always recovers to a usable home. */
  onNavigationError?: (error: unknown, path: string) => void;
}

interface LocationParts {
  pathname: string;
  search: string;
  hash: string;
}

type Route =
  | { kind: 'home'; location: LocationParts }
  | { kind: 'project'; slug: string; location: LocationParts }
  | { kind: 'unknown'; location: LocationParts };

const HOME_PATH = '/';
const PROJECT_PREFIX = '/projects/';
const BASE_TITLE = 'Reevez Studio';

function locationParts(input: string): LocationParts {
  const url = new URL(input, window.location.origin);
  return { pathname: url.pathname, search: url.search, hash: url.hash };
}

/** Parse explicitly: unknown paths are never represented as home in memory. */
function routeFromPath(input: string): Route {
  const location = locationParts(input);
  if (location.pathname === HOME_PATH) return { kind: 'home', location };
  if (location.pathname.startsWith(PROJECT_PREFIX)) {
    const slug = location.pathname.slice(PROJECT_PREFIX.length).replace(/\/+$/, '');
    if (slug) {
      return {
        kind: 'project',
        slug,
        location: { ...location, pathname: `${PROJECT_PREFIX}${slug}` },
      };
    }
  }
  return { kind: 'unknown', location };
}

function routesEqual(a: Route, b: Route): boolean {
  if (a.kind !== b.kind || a.location.pathname !== b.location.pathname) return false;
  if (a.location.search !== b.location.search || a.location.hash !== b.location.hash) return false;
  return a.kind !== 'project' || b.kind !== 'project' || a.slug === b.slug;
}

function urlFor(location: LocationParts): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

function runtimeRoute(route: Route): AppRoute {
  if (route.kind === 'project') return { kind: 'project', slug: route.slug };
  if (route.kind === 'unknown') return { kind: 'not-found', pathname: route.location.pathname };
  return { kind: 'home' };
}

function isInterceptableClick(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download') || anchor.origin !== window.location.origin) return false;
  return true;
}

export function setupRouter(deps: RouterDeps): Router {
  const runtime = getAppRuntime();
  let targetRoute: Route = { kind: 'home', location: locationParts(HOME_PATH) };
  let pending: Promise<void> = Promise.resolve();
  let started = false;
  let disposed = false;

  async function setHomeState(route: Extract<Route, { kind: 'home' | 'unknown' }>): Promise<void> {
    await deps.detail.close();
    runtime.setRoute(runtimeRoute(route));
    deps.sound?.setScene('home');
    document.title = BASE_TITLE;
  }

  async function applyProject(
    project: ProjectDetail,
    route: Extract<Route, { kind: 'project' }>,
    immediate: boolean,
  ): Promise<void> {
    // The coordinator projects the only global project-active class. Set the
    // state before opening so dependent work pauses behind the detail layer.
    runtime.setRoute(runtimeRoute(route));
    await deps.detail.open(project, { immediate });
    deps.sound?.setScene('project');
    document.title = `${project.title} — ${BASE_TITLE}`;
  }

  function commitHistory(location: LocationParts, mode: 'push' | 'replace' | 'none'): void {
    if (mode === 'push') window.history.pushState({ path: urlFor(location) }, '', urlFor(location));
    if (mode === 'replace')
      window.history.replaceState({ path: urlFor(location) }, '', urlFor(location));
  }

  async function commitRoute(
    route: Route,
    project: ProjectDetail | null,
    mode: 'push' | 'replace' | 'none',
    immediate: boolean,
  ): Promise<void> {
    if (route.kind === 'project' && project) {
      commitHistory(route.location, mode);
      await applyProject(project, route, immediate);
      return;
    }

    // Unknown locations normalize to home in history, but remain explicitly
    // not-found in runtime state. Preserve query and fragment when doing so.
    const normalized = { ...route.location, pathname: HOME_PATH };
    commitHistory(normalized, mode);
    const settledRoute: Extract<Route, { kind: 'home' | 'unknown' }> =
      route.kind === 'project' ? { kind: 'unknown', location: route.location } : route;
    await setHomeState(settledRoute);
  }

  function recover(error: unknown, route: Route): Promise<void> {
    if (disposed) return Promise.resolve();
    deps.onNavigationError?.(error, urlFor(route.location));
    console.error('Navigation failed; recovering to home', error);
    targetRoute = { kind: 'home', location: locationParts(HOME_PATH) };
    const normalized = { ...route.location, pathname: HOME_PATH };
    window.history.replaceState({ path: urlFor(normalized) }, '', urlFor(normalized));
    return setHomeState(targetRoute).catch((recoveryError: unknown) => {
      console.error('Navigation recovery failed', recoveryError);
    });
  }

  function runNavigation(
    route: Route,
    mode: 'push' | 'replace' | 'none',
    immediate: boolean,
  ): void {
    if (disposed) return;
    targetRoute = route;
    pending = pending
      .then(async () => {
        if (disposed) return;
        const project = route.kind === 'project' ? await deps.loadProject(route.slug) : null;
        if (disposed) return;
        const resolved: Route =
          route.kind === 'project' && !project
            ? { kind: 'unknown', location: route.location }
            : route;
        if (routesEqual(targetRoute, route)) targetRoute = resolved;
        const resolvedMode = resolved.kind === 'unknown' ? 'replace' : mode;

        if (immediate) {
          await commitRoute(resolved, project, resolvedMode, true);
          return;
        }
        await deps.transition.play(
          () => commitRoute(resolved, project, resolvedMode, false),
          project?.accent,
        );
      })
      .catch((error: unknown) => recover(error, route));
  }

  function navigate(path: string, opts?: { replace?: boolean }): void {
    if (disposed) return;
    const route = routeFromPath(path);
    if (routesEqual(route, targetRoute)) return;
    runNavigation(route, opts?.replace ? 'replace' : 'push', false);
  }

  function onClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    const anchor = target?.closest('a');
    if (!(anchor instanceof HTMLAnchorElement) || !anchor.href) return;
    const path = anchor.getAttribute('href');
    if (!path?.startsWith(PROJECT_PREFIX) || !isInterceptableClick(event, anchor)) return;
    event.preventDefault();
    navigate(`${anchor.pathname}${anchor.search}${anchor.hash}`);
  }

  function onPopState(): void {
    const route = routeFromPath(window.location.href);
    if (!routesEqual(route, targetRoute)) runNavigation(route, 'none', false);
  }

  function start(): void {
    if (started || disposed) return;
    started = true;
    document.addEventListener('click', onClick);
    window.addEventListener('popstate', onPopState);
    const route = routeFromPath(window.location.href);
    if (route.kind === 'home') {
      targetRoute = route;
      runtime.setRoute(runtimeRoute(route));
      return;
    }
    runNavigation(route, 'replace', true);
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    if (started) {
      document.removeEventListener('click', onClick);
      window.removeEventListener('popstate', onPopState);
    }
  }

  return { start, navigate, dispose };
}
