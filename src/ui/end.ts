import gsap from 'gsap';
import './scroll';
import { splitWords, splitChars } from './splitWords';

/**
 * End / CTA choreography:
 *  - subtitle: masked word rise
 *  - title: per-character rise out of line masks, staggered across both lines
 *  - decorative underline strokes draw in (scaleX) once the title has landed
 * The looping scroll pill is pure CSS. Everything triggers as the pinned
 * block scrolls into view.
 */
export function setupEndSection(): void {
  const section = document.getElementById('end');
  if (!section) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return;

  const timeline = gsap.timeline({
    scrollTrigger: { trigger: section, start: 'top 65%', once: true },
  });

  // subtitle — masked word rise
  const subtitle = document.getElementById('end-subtitle');
  if (subtitle) {
    const words = splitWords(subtitle);
    gsap.set(words, { yPercent: 120 });
    timeline.to(
      words,
      { yPercent: 0, duration: 0.9, ease: 'power4.out', stagger: 0.04 },
      0,
    );
  }

  // title — per-character rise, both lines staggered as one sequence
  const lineTexts = Array.from(document.querySelectorAll<HTMLElement>('#end-title .end-title-text'));
  const chars = lineTexts.flatMap((line) => splitChars(line));
  if (chars.length) {
    gsap.set(chars, { yPercent: 110 });
    timeline.to(
      chars,
      { yPercent: 0, duration: 1.0, ease: 'power4.out', stagger: 0.035 },
      0.2,
    );
  }

  // The decorative strokes are a hover flourish (CSS-driven), so they are not
  // part of the scroll reveal.
}
