/**
 * Small, framework-free application coordinator.
 *
 * UI modules may own their markup and animation, but this module owns the
 * application-wide mode and the document classes derived from it. Keeping
 * this boundary narrow makes lifecycle work (pausing render loops, audio, or
 * input) observable without adding a framework or a second event bus.
 */

export type AppRoute =
  { kind: 'home' } | { kind: 'project'; slug: string } | { kind: 'not-found'; pathname: string };

export type AppOverlay = 'none' | 'menu' | 'video';

export interface AppRuntimeState {
  readonly route: AppRoute;
  readonly overlay: AppOverlay;
  /** True whenever a fixed/modal experience should suspend background work. */
  readonly isBackgroundSuspended: boolean;
  readonly revision: number;
}

export type AppRuntimeListener = (state: AppRuntimeState, previous: AppRuntimeState) => void;
export type EscapeHandler = () => void;
export type EscapeScope = Exclude<AppOverlay, 'none'> | 'project';

export interface AppRuntime {
  getState(): AppRuntimeState;
  subscribe(listener: AppRuntimeListener): () => void;
  setRoute(route: AppRoute): void;
  setOverlay(overlay: AppOverlay): void;
  registerEscapeHandler(scope: EscapeScope, handler: EscapeHandler): () => void;
  dispose(): void;
}

const PROJECT_ACTIVE_CLASS = 'is-project-details-active';
function equalRoute(a: AppRoute, b: AppRoute): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'project' && b.kind === 'project') return a.slug === b.slug;
  if (a.kind === 'not-found' && b.kind === 'not-found') return a.pathname === b.pathname;
  return true;
}

function deriveState(route: AppRoute, overlay: AppOverlay, revision: number): AppRuntimeState {
  return {
    route,
    overlay,
    isBackgroundSuspended: route.kind === 'project' || overlay !== 'none',
    revision,
  };
}

/** Creates an isolated coordinator; useful for an embedded app or tests. */
export function createAppRuntime(root: HTMLElement = document.documentElement): AppRuntime {
  const ownerDocument = root.ownerDocument;
  let state = deriveState({ kind: 'home' }, 'none', 0);
  let disposed = false;
  const listeners = new Set<AppRuntimeListener>();
  const escapeHandlers = new Map<EscapeScope, EscapeHandler>();

  function publish(nextRoute: AppRoute, nextOverlay: AppOverlay): void {
    if (disposed) return;
    if (equalRoute(state.route, nextRoute) && state.overlay === nextOverlay) return;
    const previous = state;
    state = deriveState(nextRoute, nextOverlay, previous.revision + 1);
    // This class is a projection of state, never an input read by app logic.
    root.classList.toggle(PROJECT_ACTIVE_CLASS, state.route.kind === 'project');
    for (const listener of listeners) listener(state, previous);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const overlay = state.overlay;
    if (overlay !== 'none') {
      const handler = escapeHandlers.get(overlay);
      if (handler) {
        event.preventDefault();
        handler();
      }
      return;
    }
    // A project is not a competing DOM overlay: it is the final Escape target
    // after transient overlays, so a registered project handler runs last.
    if (state.route.kind === 'project') {
      const handler = escapeHandlers.get('project');
      if (handler) {
        event.preventDefault();
        handler();
      }
    }
  }

  ownerDocument.addEventListener('keydown', onKeyDown, true);

  return {
    getState: () => state,
    subscribe(listener: AppRuntimeListener): () => void {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setRoute(route: AppRoute): void {
      publish(route, state.overlay);
    },
    setOverlay(overlay: AppOverlay): void {
      publish(state.route, overlay);
    },
    registerEscapeHandler(scope, handler): () => void {
      if (disposed) return () => undefined;
      const key = scope;
      escapeHandlers.set(key, handler);
      return () => {
        if (escapeHandlers.get(key) === handler) escapeHandlers.delete(key);
      };
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      ownerDocument.removeEventListener('keydown', onKeyDown, true);
      listeners.clear();
      escapeHandlers.clear();
      root.classList.remove(PROJECT_ACTIVE_CLASS);
    },
  };
}

// The site is a single application root. Expose a singleton for backwards-
// compatible setup functions, while still exporting createAppRuntime for
// focused tests and future multi-root use.
let sharedRuntime: AppRuntime | null = null;

export function getAppRuntime(): AppRuntime {
  if (!sharedRuntime) sharedRuntime = createAppRuntime();
  return sharedRuntime;
}

/** Dispose and clear the single application runtime (page teardown/tests). */
export function disposeAppRuntime(): void {
  sharedRuntime?.dispose();
  sharedRuntime = null;
}
