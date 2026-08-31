import gsap from 'gsap';

const REVEALED = ['#header', '#hero-visual', '#hero-scrollbar'];

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Pre-hides the animated elements synchronously, before any awaited work in
 * boot(). Without this the header/visual/scroll strip paint visible on first
 * paint, then flash to opacity 0 when the intro starts after fonts load.
 * (JS-applied so the page stays fully visible without JavaScript.)
 */
export function prepareIntro(): void {
  if (prefersReducedMotion()) return;
  gsap.set(['#header', '#hero-scrollbar'], { opacity: 0 });
  gsap.set('#hero-visual', { opacity: 0, y: 26 });
}

/** Failsafe: reveal everything immediately (boot errors, reduced motion). */
export function revealAll(): void {
  gsap.set(REVEALED, { opacity: 1, y: 0 });
  // Un-mask the headline words too: hero.css parks them translated + rotated
  // inside overflow-hidden masks, so without this the headline stays blank on
  // the two paths that skip playIntro (deep-link boot and the boot-failure
  // handler) — visible as an empty hero after navigating back home.
  gsap.set('#hero-title .word', { y: 0, rotation: 0 });
}

/**
 * Entrance choreography: masked word reveal on the headline, then the
 * visual container and scroll strip ease in.
 */
export function playIntro(words: HTMLElement[]): void {
  if (prefersReducedMotion()) {
    gsap.set(words, { y: 0, rotation: 0 });
    revealAll();
    return;
  }

  const timeline = gsap.timeline({ defaults: { ease: 'power4.out' } });

  timeline
    .to('#header', { opacity: 1, duration: 0.8 }, 0.1)
    .to(words, { y: 0, rotation: 0, duration: 1.05, stagger: 0.055 }, 0.25)
    .to('#hero-visual', { opacity: 1, y: 0, duration: 0.9 }, 0.45)
    .to('#hero-scrollbar', { opacity: 1, duration: 0.8 }, 0.9);
}
