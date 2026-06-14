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
import { setupSmoothScroll, ScrollTrigger } from './ui/scroll';
import { setupHeaderMenu } from './ui/menu';
import { setupReelSection, setupReelVideo } from './ui/reel';
import { setupFeaturedSection } from './ui/featured';
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

function setViewportUnit(): void {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
}

// Module-scoped so the boot failure handler can still clear the black screen.
let preloader: Preloader | null = null;

async function boot(): Promise<void> {
  // Boot always replays from the top (like the reference's preloader flow).
  // This also guarantees ScrollTriggers are never created while the browser
  // restores a deep scroll into a pinned layout — that ordering crashes
  // ScrollTrigger's init refresh ("reading 'end'").
  history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  preloader = createPreloader();

  setViewportUnit();
  window.addEventListener('resize', setViewportUnit);

  const title = document.getElementById('hero-title');
  const canvas = document.getElementById('webgl') as HTMLCanvasElement | null;
  const container = document.getElementById('hero-visual');

  if (!title || !canvas || !container) {
    throw new Error('Hero markup is missing required elements');
  }

  const words = splitWords(title);
  prepareIntro();

  // Start downloading the heavy chunk (three.js + physics WASM) in parallel
  // with font loading — neither depends on the other.
  const scenePromise = import('./scene/HeroScene');

  const lenis = setupSmoothScroll();
  setupHeaderMenu();
  setupReelSection();
  setupReelVideo();
  setupFeaturedSection();

  // --- sound + project-detail routing --------------------------------------
  // The sound engine owns the #sound-btn toggle; the transition wipe and the
  // History router drive the per-project detail layer. The detail controller
  // freezes Lenis itself (via window.__lenis) while a project is open.
  const sound = createSoundEngine({ buttonId: 'sound-btn' });
  const transition = createTransition({ sound });
  let router: Router;
  const detail = setupProjectDetail({
    sound,
    onRequestProject: (slug) => router.navigate(`/projects/${slug}`),
    onRequestClose: () => router.navigate('/'),
  });
  router = setupRouter({ detail, transition, sound, loadProject: fetchProject });

  setupGoalSection();
  const tunnelZone = setupTunnelZone();
  setupEndSection();
  setupEndConfetti();
  setupFooterSection(() => {
    if (lenis) {
      lenis.scrollTo(0);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  setupScrollNavSection();
  setupVideoOverlay({ onOpen: () => lenis?.stop(), onClose: () => lenis?.start() });
  TrailCursor.create();

  // Wait for fonts so the masked word reveal doesn't reflow mid-animation.
  await document.fonts.ready;
  preloader.setProgress(40);

  const { HeroScene } = await scenePromise;
  preloader.setProgress(80);

  // The preloader rolls to 100 and clears before the hero intro plays.
  await preloader.finish();

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
    if (document.documentElement.classList.contains('is-project-details-active')) return;
    if (sceneZones.end) sound.setScene('end');
    else if (sceneZones.tunnel) sound.setScene('tunnel');
    else sound.setScene('home');
  };
  const tunnelZoneEl = document.getElementById('tunnel');
  const endZoneEl = document.getElementById('end');
  if (tunnelZoneEl) {
    new IntersectionObserver(
      ([entry]) => {
        sceneZones.tunnel = entry.isIntersecting;
        refreshScene();
      },
      { threshold: 0.25 },
    ).observe(tunnelZoneEl);
  }
  if (endZoneEl) {
    new IntersectionObserver(
      ([entry]) => {
        sceneZones.end = entry.isIntersecting;
        refreshScene();
      },
      { threshold: 0.25 },
    ).observe(endZoneEl);
  }

  playIntro(words);

  const scene = new HeroScene(canvas, container);
  await scene.start();

  // Tunnel gem scene: lazy-loaded after the hero is running; its failure must
  // never take down the page (the zone degrades to black bg + title scrub).
  try {
    const tunnelCanvas = document.getElementById('tunnel-canvas') as HTMLCanvasElement | null;
    const tunnelSection = document.getElementById('tunnel');
    if (tunnelCanvas && tunnelSection) {
      const { TunnelScene } = await import('./scene/TunnelScene');
      const tunnelScene = new TunnelScene(tunnelCanvas);
      tunnelScene.start();
      tunnelZone.onProgress((p) => tunnelScene.setProgress(p));
      const tunnelIo = new IntersectionObserver(([entry]) =>
        tunnelScene.setActive(entry.isIntersecting),
      );
      tunnelIo.observe(tunnelSection);
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
  throw error;
});
