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

  setupHoverPlayback(items);

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

  // --- column parallax ------------------------------------------------------
  items.forEach((item, index) => {
    const depth = index % 2 === 0 ? 1 : -1;
    gsap.fromTo(
      item,
      { y: 0 },
      {
        y: () => depth * Math.min(window.innerHeight * 0.06, 80),
        ease: 'none',
        scrollTrigger: {
          trigger: item,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
          invalidateOnRefresh: true,
        },
      },
    );
  });

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
 * Plays a project's <video> on hover when a real source is wired in (via a
 * `data-src` attribute), pausing on leave. Without a source it is a no-op and
 * the gradient placeholder stands in.
 */
function setupHoverPlayback(items: HTMLElement[]): void {
  if (window.matchMedia('(pointer: coarse)').matches) return;

  for (const item of items) {
    const video = item.querySelector<HTMLVideoElement>('.project-item-video');
    if (!video) continue;

    item.addEventListener('pointerenter', () => {
      const src = video.dataset.src;
      if (src && !video.src) video.src = src;
      if (!video.src) return;
      void video.play().then(() => video.classList.add('is-playing')).catch(() => {});
    });

    item.addEventListener('pointerleave', () => {
      if (!video.src) return;
      video.classList.remove('is-playing');
      video.pause();
    });
  }
}
