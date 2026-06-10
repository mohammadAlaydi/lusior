import gsap from 'gsap';
import './scroll';
import { splitWords } from './splitWords';

const REVEAL_EASE = 'power4.out';

/**
 * Featured-projects choreography:
 *  - section title: per-word masked reveal
 *  - each project: clip-path wipe on the artwork, masked rise of the name,
 *    fade-in of the category line — triggered per item as it enters
 *  - gentle column parallax so the two columns drift at slightly different
 *    rates, giving the editorial, staggered rhythm
 *  - hover plays the project video (when real media is wired in); the gradient
 *    placeholder simply scales on hover via CSS
 */
export function setupFeaturedSection(): void {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const items = Array.from(document.querySelectorAll<HTMLElement>('.project-item'));

  setupHoverSlide(items);

  if (reducedMotion) return;

  // --- section title: per-word masked reveal -------------------------------
  const title = document.getElementById('featured-title');
  if (title) {
    const words = splitWords(title);
    gsap.set(words, { yPercent: 120, rotation: 5, transformOrigin: '0% 100%' });
    gsap.to(words, {
      yPercent: 0,
      rotation: 0,
      duration: 1.1,
      ease: REVEAL_EASE,
      stagger: 0.08,
      scrollTrigger: { trigger: '#featured-head', start: 'top 80%', once: true },
    });
  }

  const disclaimer = document.getElementById('featured-disclaimer');
  if (disclaimer) {
    gsap.from(disclaimer, {
      opacity: 0,
      y: 18,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: '#featured-head', start: 'top 70%', once: true },
    });
  }

  // --- per-project reveal ---------------------------------------------------
  for (const item of items) {
    const main = item.querySelector<HTMLElement>('.project-item-main');
    const line1 = item.querySelector<HTMLElement>('.project-item-line-1');
    const nameInner = item.querySelector<HTMLElement>('.project-item-line-2-inner');

    const timeline = gsap.timeline({
      scrollTrigger: { trigger: item, start: 'top 85%', once: true },
    });

    if (main) {
      gsap.set(main, { clipPath: 'inset(100% 0% 0% 0% round 15px)' });
      timeline.to(
        main,
        { clipPath: 'inset(0% 0% 0% 0% round 15px)', duration: 1.1, ease: REVEAL_EASE },
        0,
      );
    }
    if (nameInner) {
      gsap.set(nameInner, { yPercent: 110 });
      timeline.to(nameInner, { yPercent: 0, duration: 0.9, ease: REVEAL_EASE }, 0.15);
    }
    if (line1) {
      gsap.set(line1, { opacity: 0, y: 14 });
      timeline.to(line1, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, 0.25);
    }
  }

  // (No column parallax: the reference keeps both columns level — rows align.)

  // --- CTA ------------------------------------------------------------------
  const cta = document.getElementById('featured-cta');
  if (cta) {
    gsap.from(cta, {
      opacity: 0,
      y: 24,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: cta, start: 'top 90%', once: true },
    });
  }
}

/**
 * Hover: the masked name + arrow assembly slides 1em right so the arrow
 * enters the line mask (the reference mechanism). GSAP owns this transform —
 * a CSS transition on the same element would fight the scroll-reveal rise.
 *
 * NOTE: hover VIDEO playback is intentionally disabled. On the reference the
 * hover video is the same artwork in motion, so the media never appears to
 * change; with unrelated placeholder clips it read as an image swap. The
 * <video data-src> hooks stay in the markup (the project-detail overlay uses
 * them) — re-enable playback here once per-project matching media exists.
 */
function setupHoverSlide(items: HTMLElement[]): void {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  for (const item of items) {
    const inner = item.querySelector<HTMLElement>('.project-item-line-2-inner');
    if (!inner) continue;

    const slide = (x: string): void => {
      if (reducedMotion) {
        gsap.set(inner, { x });
        return;
      }
      gsap.to(inner, { x, duration: 0.45, ease: 'power4.out', overwrite: 'auto' });
    };

    item.addEventListener('pointerenter', () => slide('1em'));
    item.addEventListener('pointerleave', () => slide('0em'));
    // keyboard parity with the old :focus-visible CSS rule
    item.addEventListener('focusin', () => slide('1em'));
    item.addEventListener('focusout', () => slide('0em'));
  }
}
