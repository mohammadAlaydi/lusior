import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Lenis smooth scroll wired into GSAP's ticker so ScrollTrigger scrubs and
 * the physics scene all share one clock.
 */
export function setupSmoothScroll(): Lenis | null {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return null; // native scrolling; ScrollTrigger still works
  }

  const lenis = new Lenis({
    duration: 1.1,
    smoothWheel: true,
  });

  lenis.on('scroll', ScrollTrigger.update);

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  // Expose the instance globally so other modules (the project-detail layer's
  // scroll freeze) and dev tooling can drive Lenis instead of fighting it via
  // window.scrollTo.
  (window as typeof window & { __lenis?: Lenis }).__lenis = lenis;

  return lenis;
}

export { ScrollTrigger };
