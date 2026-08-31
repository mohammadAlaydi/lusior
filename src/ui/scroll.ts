import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Module-scoped so getLenis() gives other modules a TYPED handle on the
// running instance — the window.__lenis stash below is only the dev-tooling /
// harness hook, not the in-app contract.
let activeLenis: Lenis | null = null;
let activeTicker: ((time: number) => void) | null = null;

/**
 * The running Lenis instance, or null (reduced motion, or before
 * setupSmoothScroll ran). Import this instead of reading window.__lenis —
 * the compiler can check this boundary; it cannot check the window stash.
 */
export function getLenis(): Lenis | null {
  return activeLenis;
}

/**
 * Lenis smooth scroll wired into GSAP's ticker so ScrollTrigger scrubs and
 * the physics scene all share one clock.
 */
export function setupSmoothScroll(): Lenis | null {
  // Idempotent across HMR, embedded remounts, and focused tests.
  disposeSmoothScroll();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return null; // native scrolling; ScrollTrigger still works
  }

  const lenis = new Lenis({
    duration: 1.1,
    smoothWheel: true,
  });

  lenis.on('scroll', ScrollTrigger.update);

  const ticker = (time: number): void => {
    lenis.raf(time * 1000);
  };
  gsap.ticker.add(ticker);
  activeTicker = ticker;
  gsap.ticker.lagSmoothing(0);

  // Expose the instance globally so dev tooling and the QA harness can drive
  // Lenis instead of fighting it via window.scrollTo (see
  // docs/verification-playbook.md). App modules use getLenis() above.
  (window as typeof window & { __lenis?: Lenis }).__lenis = lenis;
  activeLenis = lenis;

  return lenis;
}

/** Release the singleton Lenis instance and its global GSAP ticker hook. */
export function disposeSmoothScroll(): void {
  if (activeTicker) {
    gsap.ticker.remove(activeTicker);
    activeTicker = null;
  }
  activeLenis?.destroy();
  const harnessWindow = window as typeof window & { __lenis?: Lenis };
  if (harnessWindow.__lenis === activeLenis) {
    delete harnessWindow.__lenis;
  }
  activeLenis = null;
}

export { ScrollTrigger };
