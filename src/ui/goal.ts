import gsap from 'gsap';
import './scroll';
import { splitWords } from './splitWords';

const REVEAL_EASE = 'power4.out';

/**
 * Goal / philosophy choreography:
 *  - title: masked LINE reveal — each .line rises out of its overflow-hidden
 *    mask with a slight settle rotation (same gesture as the reel lines)
 *  - texts: per-word rise via splitWords, tight stagger
 *  - media frames: one-time scale + clip-path reveal, plus a gentle scrubbed
 *    parallax while in view. (On the real site these reveals are driven by
 *    the WebGL canvas — this is our DOM approximation until that lands.)
 * The tunnel title stays static: it belongs to the future tunnel scroll zone.
 */
export function setupGoalSection(): void {
  const section = document.getElementById('goal');
  if (!section) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    // Static fallback: CSS already renders the final state; clear any
    // residual inline props so nothing is stuck mid-reveal.
    gsap.set(['#goal-title .line', '.goal-image-frame'], { clearProps: 'all' });
    return;
  }

  setupTitleReveal();
  setupTextsReveal();
  setupImageFrames();
  setupRibbonDraw();
}

/**
 * The cyan ribbon draws itself in head-first from the right edge, scrubbed
 * by scroll across the title + texts zone (~1.4 viewports), exactly like the
 * reel's blue ribbon but mirrored. Reduced motion never reaches here (the
 * fully-drawn rest state simply shows).
 */
function setupRibbonDraw(): void {
  const ribbon = document.getElementById('goal-ribbon-path') as SVGPathElement | null;
  if (!ribbon) return;

  const length = ribbon.getTotalLength();
  gsap.set(ribbon, { strokeDasharray: length, strokeDashoffset: length });
  gsap.to(ribbon, {
    strokeDashoffset: 0,
    ease: 'none',
    scrollTrigger: {
      trigger: '#goal',
      start: 'top 92%',
      end: '+=140%',
      scrub: 0.5,
    },
  });
}

/** Masked line reveal for the three title lines. */
function setupTitleReveal(): void {
  const lines = Array.from(document.querySelectorAll<HTMLElement>('#goal-title .line'));
  if (!lines.length) return;

  gsap.set(lines, { yPercent: 115, rotation: 6, transformOrigin: '0% 100%' });
  gsap.to(lines, {
    yPercent: 0,
    rotation: 0,
    duration: 1.15,
    ease: REVEAL_EASE,
    stagger: 0.09,
    scrollTrigger: { trigger: '#goal-title', start: 'top 80%', once: true },
  });
}

/** Per-word rise for the philosophy paragraphs. */
function setupTextsReveal(): void {
  const paragraphs = Array.from(document.querySelectorAll<HTMLElement>('.goal-texts-paragraph'));
  if (!paragraphs.length) return;

  const words = paragraphs.flatMap((paragraph) => splitWords(paragraph));
  gsap.set(words, { yPercent: 110 });
  gsap.to(words, {
    yPercent: 0,
    duration: 0.9,
    ease: 'power3.out',
    stagger: 0.012,
    scrollTrigger: { trigger: '#goal-texts', start: 'top 85%', once: true },
  });
}

/**
 * Media frames: one-time scale 1.15 -> 1 + clip-path inset wipe when each
 * frame enters, then a gentle +/-6% parallax scrubbed across its visit
 * through the viewport. Triggers use the static aspect-ratio wrapper so the
 * frame's own transforms never skew the trigger measurements.
 */
function setupImageFrames(): void {
  const radius = getGlobalRadius();
  const frames = Array.from(document.querySelectorAll<HTMLElement>('.goal-image-frame'));

  for (const frame of frames) {
    const wrapper = frame.parentElement ?? frame;

    gsap.set(frame, { scale: 1.15, clipPath: `inset(12% round ${radius})` });
    gsap.to(frame, {
      scale: 1,
      clipPath: `inset(0% round ${radius})`,
      duration: 1.2,
      ease: 'power3.out',
      scrollTrigger: { trigger: wrapper, start: 'top 85%', once: true },
    });

    gsap.fromTo(
      frame,
      { yPercent: -6 },
      {
        yPercent: 6,
        ease: 'none',
        scrollTrigger: {
          trigger: wrapper,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
          invalidateOnRefresh: true,
        },
      },
    );
  }
}

/** Reads the shared corner radius token so the clip wipe matches the CSS. */
function getGlobalRadius(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--global-border-radius')
    .trim();
  return value || '20px';
}
