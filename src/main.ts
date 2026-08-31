import './styles/tokens.css';
import './styles/global.css';
import './styles/components.css';
import './styles/preloader.css';
import './styles/header.css';
import './styles/projectsHeader.css';
import './styles/menu.css';
import './styles/hero.css';
import './styles/reel.css';
import './styles/featured.css';
import './styles/projectDetail.css';
import './styles/transition.css';
import './styles/goal.css';
import './styles/tunnel.css';
import './styles/end.css';
import './styles/endConfetti.css';
import './styles/footer.css';
import './styles/scrollNav.css';
import './styles/videoOverlay.css';

import { splitWords } from './ui/splitWords';
import { playIntro, prepareIntro, revealAll } from './ui/intro';
import { createPreloader, type Preloader } from './ui/preloader';
import { disposeSmoothScroll, setupSmoothScroll, ScrollTrigger } from './ui/scroll';
import { setupHeaderMenu, setMenuNavigate } from './ui/menu';
import { setupReelSection, setupReelVideo } from './ui/reel';
import { hydrateFeaturedProjects, setupFeaturedSection } from './ui/featured';
import { setupProjectDetail } from './ui/projectDetail';
import { setupRouter, type Router } from './ui/router';
import { createTransition } from './ui/transition';
import { createSoundEngine } from './audio/soundEngine';
import { fetchProject } from './data/projects';
import { setupGoalSection } from './ui/goal';
import { setupTunnelZone } from './ui/tunnel';
import { setupEndSection } from './ui/end';
import { setupEndConfetti } from './scene/endConfetti';
import { setupFooterSection } from './ui/footer';
import { setupScrollNavSection } from './ui/scrollNav';
import { setupVideoOverlay } from './ui/videoOverlay';
import { TrailCursor } from './ui/trailCursor';
import { disposeAppRuntime, getAppRuntime } from './core/appRuntime';
import type { HeroScene as HeroSceneInstance } from './scene/HeroScene';
import type { TunnelScene as TunnelSceneInstance } from './scene/TunnelScene';

function setViewportUnit(): void {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
}

// Module-scoped so the boot failure handler can still clear the black screen.
let preloader: Preloader | null = null;

async function boot(): Promise<void> {
  const lifecycle = new AbortController();
  // Boot always replays from the top (like the reference's preloader flow).
  // This also guarantees ScrollTriggers are never created while the browser
  // restores a deep scroll into a pinned layout — that ordering crashes
  // ScrollTrigger's init refresh ("reading 'end'").
  history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  preloader = createPreloader();

  setViewportUnit();
  let vhRefreshTimer = 0;
  window.addEventListener(
    'resize',
    () => {
      setViewportUnit();
      // GSAP's built-in resize handler can run before --vh updates above, so
      // ScrollTrigger would cache zone heights measured against the OLD unit
      // (#tunnel alone is calc(--vh * 400)) — leaving every later trigger and
      // the scroll-nav progress bar desynced. Re-measure once the resize
      // settles.
      window.clearTimeout(vhRefreshTimer);
      vhRefreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 200);
    },
    { signal: lifecycle.signal },
  );

  const title = document.getElementById('hero-title');
  const canvas = document.getElementById('webgl') as HTMLCanvasElement | null;
  const container = document.getElementById('hero-visual');

  if (!title || !canvas || !container) {
    throw new Error('Hero markup is missing required elements');
  }

  const words = splitWords(title);
  prepareIntro();

  // Dev-only: warn when shared/projects.ts and the hand-written home grid
  // drift (duplicate slugs, broken next-ring, missing tiles). Tree-shaken
  // from production builds.
  if (import.meta.env.DEV) {
    void import('./data/validateProjects').then((m) => m.validateProjectData());
  }

  // Start downloading the heavy chunk (three.js + physics WASM) in parallel
  // with font loading — neither depends on the other.
  const scenePromise = import('./scene/HeroScene');
  // The import may reject before later boot work reaches its await. Attach a
  // handler immediately to avoid a transient unhandledrejection while keeping
  // the original promise rejected so the outer boot fallback still runs.
  void scenePromise.catch(() => undefined);

  const lenis = setupSmoothScroll();
  const headerMenu = setupHeaderMenu();
  const reelSection = setupReelSection();
  const reelVideo = setupReelVideo();
  // Keep the semantic HTML in index.html as the no-JS fallback, then apply the
  // validated API summaries before any featured-card interaction binds.
  await hydrateFeaturedProjects();
  const featuredSection = setupFeaturedSection();

  // --- sound + project-detail routing --------------------------------------
  // The sound engine owns the #sound-btn toggle; the transition wipe and the
  // History router drive the per-project detail layer. The detail controller
  // freezes the shared Lenis controller while a project is open.
  const sound = createSoundEngine({ buttonId: 'sound-btn' });
  const transition = createTransition({ sound });
  let router: Router;
  const detail = setupProjectDetail({
    sound,
    onRequestProject: (slug) => router.navigate(`/projects/${slug}`),
    onRequestClose: () => router.navigate('/'),
  });
  router = setupRouter({ detail, transition, sound, loadProject: fetchProject });
  // Menu links route through the router when a project overlay is open.
  setMenuNavigate(router.navigate);

  setupGoalSection();
  const tunnelZone = setupTunnelZone();
  setupEndSection();
  const endConfetti = setupEndConfetti();
  setupFooterSection(() => {
    if (lenis) {
      lenis.scrollTo(0);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  setupScrollNavSection();
  const videoOverlay = setupVideoOverlay({
    onOpen: () => lenis?.stop(),
    onClose: () => lenis?.start(),
  });
  const runtime = getAppRuntime();
  const trailCursor = TrailCursor.create();
  let heroScene: HeroSceneInstance | null = null;
  let tunnelScene: TunnelSceneInstance | null = null;
  const syncBackgroundSuspension = (suspended: boolean): void => {
    trailCursor?.setSuspended(suspended);
    heroScene?.setSuspended(suspended);
    tunnelScene?.setSuspended(suspended);
    reelSection.setSuspended(suspended);
    reelVideo.setSuspended(suspended);
    featuredSection.setSuspended(suspended);
    endConfetti.setSuspended(suspended);
  };
  const unsubscribeRuntime = runtime.subscribe((state) => {
    syncBackgroundSuspension(state.isBackgroundSuspended);
    sound.setSuspended(state.overlay !== 'none');
  });
  syncBackgroundSuspension(runtime.getState().isBackgroundSuspended);
  sound.setSuspended(runtime.getState().overlay !== 'none');
  const sceneObservers: IntersectionObserver[] = [];

  // Dispose the controllers that own global listeners, observers, tickers,
  // and render loops when this document is truly going away. A persisted
  // pagehide is the browser's back-forward cache, so keep those controllers
  // intact for the subsequent pageshow restore.
  window.addEventListener(
    'pagehide',
    (event) => {
      if (event.persisted) return;
      lifecycle.abort();
      window.clearTimeout(vhRefreshTimer);
      unsubscribeRuntime();
      for (const observer of sceneObservers) observer.disconnect();
      router.dispose();
      detail.dispose();
      videoOverlay.dispose();
      headerMenu.dispose();
      transition.dispose();
      sound.dispose();
      reelSection.dispose();
      reelVideo.dispose();
      featuredSection.dispose();
      endConfetti.dispose();
      trailCursor?.dispose();
      heroScene?.dispose();
      tunnelScene?.dispose();
      disposeSmoothScroll();
      disposeAppRuntime();
    },
    { once: true },
  );

  // Wait for fonts so the masked word reveal doesn't reflow mid-animation.
  await document.fonts.ready;
  if (lifecycle.signal.aborted) return;
  preloader.setProgress(40);

  const { HeroScene } = await scenePromise;
  if (lifecycle.signal.aborted) return;
  preloader.setProgress(80);

  // The preloader rolls to 100 and clears before the hero intro plays.
  await preloader.finish();
  if (lifecycle.signal.aborted) return;

  // Chrome applies history scroll restoration asynchronously, sometimes after
  // boot's initial reset — force the top again now that loading is settled,
  // so the intro always plays from the hero like the reference.
  lenis?.scrollTo(0, { immediate: true });
  window.scrollTo(0, 0);

  // Trigger positions were measured during boot, before fonts settled layout
  // and the reel pin spacer reached its final height — re-measure once now.
  ScrollTrigger.refresh();

  // Activate client-side routing once layout is settled. On a deep-link to
  // /projects/<slug> this opens the detail layer immediately (no transition
  // cover); on '/' it just normalises history.
  router.start();

  // Scene music: crossfade the background bed as the user scrolls the home
  // page through the tunnel and end zones. The router owns the 'project' scene
  // while a detail layer is open, so skip while one is active.
  const sceneZones = { tunnel: false, end: false };
  const refreshScene = (): void => {
    if (runtime.getState().route.kind === 'project') return;
    if (sceneZones.end) sound.setScene('end');
    else if (sceneZones.tunnel) sound.setScene('tunnel');
    else sound.setScene('home');
  };
  const tunnelZoneEl = document.getElementById('tunnel');
  const endZoneEl = document.getElementById('end');
  if (tunnelZoneEl) {
    const observer = new IntersectionObserver(
      ([entry]) => {
        sceneZones.tunnel = entry.isIntersecting;
        refreshScene();
      },
      { threshold: 0.25 },
    );
    observer.observe(tunnelZoneEl);
    sceneObservers.push(observer);
  }
  if (endZoneEl) {
    const observer = new IntersectionObserver(
      ([entry]) => {
        sceneZones.end = entry.isIntersecting;
        refreshScene();
      },
      { threshold: 0.25 },
    );
    observer.observe(endZoneEl);
    sceneObservers.push(observer);
  }

  // On a deep link the project overlay is opening over the page right now —
  // reveal the hero statically instead of playing the masked intro behind a
  // fixed layer nobody can see. The words must still be un-masked, or the
  // hero is blank when the user navigates back home.
  if (window.location.pathname.startsWith('/projects/')) {
    revealAll();
  } else {
    playIntro(words);
  }

  const scene = new HeroScene(canvas, container);
  scene.setSuspended(runtime.getState().isBackgroundSuspended);
  try {
    await scene.start();
  } catch (error) {
    scene.dispose();
    throw error;
  }
  if (lifecycle.signal.aborted) {
    scene.dispose();
    return;
  }
  heroScene = scene;
  scene.setSuspended(runtime.getState().isBackgroundSuspended);

  // Tunnel gem scene: lazy-loaded after the hero is running; its failure must
  // never take down the page (the zone degrades to black bg + title scrub).
  try {
    const tunnelCanvas = document.getElementById('tunnel-canvas') as HTMLCanvasElement | null;
    const tunnelSection = document.getElementById('tunnel');
    if (tunnelCanvas && tunnelSection) {
      const { TunnelScene } = await import('./scene/TunnelScene');
      if (lifecycle.signal.aborted) return;
      const scene = new TunnelScene(tunnelCanvas);
      tunnelScene = scene;
      scene.setSuspended(runtime.getState().isBackgroundSuspended);
      scene.start();
      tunnelZone.onProgress((p) => scene.setProgress(p));
      const tunnelIo = new IntersectionObserver(([entry]) => scene.setActive(entry.isIntersecting));
      tunnelIo.observe(tunnelSection);
      sceneObservers.push(tunnelIo);
    }
  } catch (error) {
    console.error('Tunnel scene failed to start', error);
  }
}

boot().catch((error) => {
  // Surface boot failures (WebGL/WASM unavailable) instead of a hidden hero.
  // Clear the preloader with plain DOM ops — a tween-based exit could itself
  // be broken by whatever killed boot — then reveal the static content.
  document.documentElement.classList.add('is-ready');
  document.getElementById('preloader')?.remove();
  revealAll();
  console.error('Interactive boot failed; showing the static experience instead.', error);
  // Keep an unmistakable failure signal during development without turning a
  // successful production fallback into an uncaught page error on devices
  // where WebGL or WASM is unavailable.
  if (import.meta.env.DEV) {
    window.setTimeout(() => {
      throw error;
    });
  }
});
