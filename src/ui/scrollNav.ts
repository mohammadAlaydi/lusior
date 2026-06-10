import gsap from 'gsap';
import './scroll';
import { splitWords } from './splitWords';

/**
 * Scroll-nav choreography:
 *  - green progress bar scrubs scaleX 0 -> 1 as the strip rises into view,
 *    landing on full exactly at page bottom (an overscroll / "next page"
 *    progress indicator)
 *  - kicker + big title get a one-time masked word rise as the strip enters
 * On the real site a full bar navigates to the next page; this recreation is
 * single-page, so the full bar is simply the end state and nothing more
 * happens.
 */
export function setupScrollNavSection(): void {
  const section = document.getElementById('scroll-nav');
  const barInner = document.getElementById('scroll-nav-next-bar-inner');
  if (!section || !barInner) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    // Bar stays at the CSS resting scaleX(.5); no scrub, no reveal.
    return;
  }

  gsap.fromTo(
    barInner,
    { scaleX: 0 },
    {
      scaleX: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top bottom',
        end: 'bottom bottom',
        scrub: true,
      },
    },
  );

  const timeline = gsap.timeline({
    scrollTrigger: { trigger: section, start: 'top 95%', once: true },
  });

  const subtitle = document.getElementById('scroll-nav-subtitle');
  if (subtitle) {
    const words = splitWords(subtitle);
    gsap.set(words, { yPercent: 120 });
    timeline.to(words, { yPercent: 0, duration: 0.7, ease: 'power3.out', stagger: 0.05 }, 0);
  }

  const text = document.getElementById('scroll-nav-text');
  if (text) {
    const words = splitWords(text);
    gsap.set(words, { yPercent: 110 });
    timeline.to(words, { yPercent: 0, duration: 0.8, ease: 'power3.out', stagger: 0.06 }, 0.08);
  }
}
