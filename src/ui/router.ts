import type { ProjectDetail } from '../../shared/projects';
import type { SoundEngine } from '../audio/soundEngine';
import type { Transition } from './transition';
import type { ProjectDetailController } from './projectDetail';

/**
 * History-API router for the single-page app (see docs/project-details-spec.md
 * §4). Two routes only:
 *   '/'                 -> home (detail layer closed)
 *   '/projects/:slug'   -> the project detail layer open over the home page
 *
 * Navigation is driven through the page-transition wipe: the route swap (open /
 * close the detail layer, flip the global active flag, crossfade music) runs at
 * the transition's covered midpoint, so the user never sees the layer pop in.
 * Clicks on featured tiles (`a[href^="/projects/"]`) are intercepted and routed
 * client-side; back/forward (`popstate`) re-derives the route without pushing.
 */

export interface Router {
  /** Resolve the current URL and open the matching route (no history push). */
  start(): void;
  /** Navigate to a path, running the transition + history update. */
  navigate(path: string, opts?: { replace?: boolean }): void;
}

export interface RouterDeps {
  detail: ProjectDetailController;
  transition: Transition;
  sound?: SoundEngine;
  loadProject: (slug: string) => Promise<ProjectDetail | null>;
}

/** Parsed route: home, or a project by slug. */
type Route = { kind: 'home' } | { kind: 'project'; slug: string };

const HOME_PATH = '/';
const PROJECT_PREFIX = '/projects/';
const ACTIVE_CLASS = 'is-project-details-active';
const BASE_TITLE = 'Northwind Studio';

/** Derive a Route from a pathname. Unknown paths fall back to home. */
function routeFromPath(pathname: string): Route {
  if (pathname.startsWith(PROJECT_PREFIX)) {
    const slug = pathname.slice(PROJECT_PREFIX.length).replace(/\/+$/, '');
    if (slug.length > 0) return { kind: 'project', slug };
  }
  return { kind: 'home' };
}

/** True when two routes address the same place. */
function routesEqual(a: Route, b: Route): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'project' && b.kind === 'project') return a.slug === b.slug;
  return true;
}

/** Path string for a route (canonical, trailing-slash free). */
function pathForRoute(route: Route): string {
  return route.kind === 'project' ? `${PROJECT_PREFIX}${route.slug}` : HOME_PATH;
}

/**
 * Is this an in-app left-click we should intercept? Mirrors the standard SPA
 * guard: primary button, no modifier keys, same-origin, not target=_blank,
 * not a download.
 */
function isInterceptableClick(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download')) return false;
  if (anchor.origin !== window.location.origin) return false;
  return true;
}

export function setupRouter(deps: RouterDeps): Router {
  // The destination of the most recently queued navigation. Dedupe uses this
  // rather than the last-committed route: mid-flight, the committed route is
  // stale, so a rapid second click would either re-queue the same trip or be
  // silently dropped.
  let targetRoute: Route = { kind: 'home' };
  // Serialises overlapping navigations so a fast double-click can't interleave
  // two transitions / swaps.
  let pending: Promise<void> = Promise.resolve();

  async function setHomeState(): Promise<void> {
    await deps.detail.close();
    document.documentElement.classList.remove(ACTIVE_CLASS);
    deps.sound?.setScene('home');
    document.title = BASE_TITLE;
  }

  async function applyProject(project: ProjectDetail, immediate: boolean): Promise<void> {
    await deps.detail.open(project, { immediate });
    document.documentElement.classList.add(ACTIVE_CLASS);
    deps.sound?.setScene('project');
    document.title = `${project.title} — ${BASE_TITLE}`;
  }

  /** Write the resolved route to the History stack per `pushMode`. */
  function commitHistory(route: Route, pushMode: 'push' | 'replace' | 'none'): void {
    const path = pathForRoute(route);
    if (pushMode === 'push') {
      window.history.pushState({ path }, '', path);
    } else if (pushMode === 'replace') {
      window.history.replaceState({ path }, '', path);
    }
  }

  /**
   * Apply a route change to the DOM at the transition's covered midpoint. The
   * project (if any) is pre-loaded so the wipe colour matches and we never
   * fetch twice. `pushMode` controls history; `immediate` skips animation.
   */
  async function commitRoute(
    target: Route,
    project: ProjectDetail | null,
    pushMode: 'push' | 'replace' | 'none',
    immediate: boolean,
  ): Promise<void> {
    if (target.kind === 'project' && project) {
      commitHistory(target, pushMode);
      await applyProject(project, immediate);
      return;
    }
    commitHistory({ kind: 'home' }, pushMode);
    await setHomeState();
  }

  /**
   * Run a route change behind the transition wipe (or instantly when
   * `immediate`). Loads the target project up front so an unknown slug resolves
   * to home before any history/animation commits.
   */
  function runNavigation(
    target: Route,
    pushMode: 'push' | 'replace' | 'none',
    immediate: boolean,
  ): void {
    targetRoute = target;
    pending = pending
      .then(async () => {
        const project =
          target.kind === 'project' ? await deps.loadProject(target.slug) : null;
        // Unknown slug -> home (and rewrite a bad project URL in history).
        const resolved: Route =
          target.kind === 'project' && !project ? { kind: 'home' } : target;
        const mode = target.kind === 'project' && !project ? 'replace' : pushMode;
        if (!routesEqual(resolved, target) && routesEqual(targetRoute, target)) {
          targetRoute = resolved;
        }

        if (immediate) {
          await commitRoute(resolved, project, mode, true);
          return;
        }
        const accent = project?.accent;
        await deps.transition.play(async () => {
          await commitRoute(resolved, project, mode, false);
        }, accent);
      })
      .catch(async () => {
        // A failed load/open must not wedge the queue for later navigations —
        // and the recovery itself must never reject, or `pending` stays a
        // rejected promise and every subsequent navigation is skipped.
        try {
          if (routesEqual(targetRoute, target)) targetRoute = { kind: 'home' };
          await setHomeState();
        } catch {
          // Leave the DOM as-is; the next navigation will retry from here.
        }
      });
  }

  function navigate(path: string, opts?: { replace?: boolean }): void {
    const target = routeFromPath(path);
    if (routesEqual(target, targetRoute)) return;
    runNavigation(target, opts?.replace ? 'replace' : 'push', false);
  }

  function onClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    const anchor = target?.closest('a');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    if (!anchor.getAttribute('href')?.startsWith(PROJECT_PREFIX)) return;
    if (!isInterceptableClick(event, anchor)) return;
    event.preventDefault();
    navigate(anchor.pathname);
  }

  function onPopState(): void {
    const target = routeFromPath(window.location.pathname);
    if (routesEqual(target, targetRoute)) return;
    // History already moved; don't write it again — and animate the change.
    runNavigation(target, 'none', false);
  }

  function start(): void {
    document.addEventListener('click', onClick);
    window.addEventListener('popstate', onPopState);

    const target = routeFromPath(window.location.pathname);
    if (target.kind === 'project') {
      // Deep-link / refresh on a project URL: open immediately (no cover) and
      // normalise the history entry.
      runNavigation(target, 'replace', true);
    } else {
      // Normalise any junk path to '/'.
      targetRoute = { kind: 'home' };
      if (window.location.pathname !== HOME_PATH) {
        window.history.replaceState({ path: HOME_PATH }, '', HOME_PATH);
      }
    }
  }

  return { start, navigate };
}
