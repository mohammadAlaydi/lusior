import gsap from 'gsap';
import './scroll';
import { splitWords } from './splitWords';

const REVEAL_EASE = 'power4.out';

/**
 * Featured-projects choreography (matched against a live frame study):
 *  - section title: per-word masked reveal; disclaimer eases in
 *  - project tiles enter FULLY RENDERED (the reference has no clip/wipe
 *    reveal) — their only motion is a subtle bend while the page scrolls,
 *    settling flat at rest (velocity-driven, like the reference's WebGL
 *    planes)
 *  - footer: masked rise of the name, fade of the category line
 *  - hover: slight blur pulse, then the cursor pans the artwork like a small
 *    camera-POV move; the masked name + arrow assembly slides 1em right so
 *    the arrow enters the line (no video swap — see setupHover)
 */
export function setupFeaturedSection(): void {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const items = Array.from(document.querySelectorAll<HTMLElement>('.project-item'));

  setupHover(items);

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

  // --- footer reveals (artwork enters as-is, like the reference) -------------
  for (const item of items) {
    const line1 = item.querySelector<HTMLElement>('.project-item-line-1');
    const nameInner = item.querySelector<HTMLElement>('.project-item-line-2-inner');

    const timeline = gsap.timeline({
      scrollTrigger: { trigger: item, start: 'top 85%', once: true },
    });

    if (nameInner) {
      gsap.set(nameInner, { yPercent: 110 });
      timeline.to(nameInner, { yPercent: 0, duration: 0.9, ease: REVEAL_EASE }, 0.1);
    }
    if (line1) {
      gsap.set(line1, { opacity: 0, y: 14 });
      timeline.to(line1, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, 0.2);
    }
  }

  // --- subtle scroll bend (reference: WebGL planes flex while scrolling) -----
  setupScrollBend(items);

  // --- CTA (reference: fades up with a slight rotation settle) ---------------
  const cta = document.getElementById('featured-cta');
  if (cta) {
    gsap.from(cta, {
      opacity: 0,
      y: 26,
      rotation: -5,
      transformOrigin: '50% 100%',
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: cta, start: 'top 90%', once: true },
    });
  }
}

/**
 * The reference tiles bend softly while the page scrolls and settle flat at
 * rest. Approximated with a clamped, smoothed velocity-driven skew on the
 * artwork — kept deliberately faint (the real effect is a WebGL mesh warp).
 */
function setupScrollBend(items: HTMLElement[]): void {
  const mains = items
    .map((item) => item.querySelector<HTMLElement>('.project-item-main'))
    .filter((el): el is HTMLElement => el !== null);
  if (mains.length === 0) return;

  let current = 0;
  let lastY = window.scrollY;

  gsap.ticker.add(() => {
    const y = window.scrollY;
    const velocity = y - lastY;
    lastY = y;

    const target = gsap.utils.clamp(-1.2, 1.2, velocity * 0.035);
    // ease toward the target, then settle back to flat
    current += (target - current) * 0.12;
    if (Math.abs(current) < 0.003 && target === 0) {
      if (current !== 0) {
        current = 0;
        gsap.set(mains, { skewY: 0 });
      }
      return;
    }
    gsap.set(mains, { skewY: current, transformOrigin: '50% 50%' });
  });
}

/** How far the artwork may pan, as a fraction of the tile size. */
const POV_PAN = 0.03;
/** Base over-scale so panning never reveals the tile edges. */
const POV_SCALE = 1.12;

/**
 * Hover behavior, matched against the reference (live pointer study):
 *  - entering blurs the artwork slightly, then it sharpens again
 *  - moving the cursor inside the tile shifts the artwork like a small
 *    camera-POV move (the reference nudges its 3D camera; we pan the
 *    over-scaled artwork toward the cursor) — NO video swap
 *  - the masked name + arrow assembly slides 1em right (GSAP owns the
 *    transform — a CSS transition would fight the scroll-reveal rise)
 */
function setupHover(items: HTMLElement[]): void {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  for (const item of items) {
    const inner = item.querySelector<HTMLElement>('.project-item-line-2-inner');
    const main = item.querySelector<HTMLElement>('.project-item-main');
    const media = item.querySelector<HTMLElement>('.project-item-media');

    const slide = (x: string): void => {
      if (!inner) return;
      if (reducedMotion) {
        gsap.set(inner, { x });
        return;
      }
      gsap.to(inner, { x, duration: 0.45, ease: 'power4.out', overwrite: 'auto' });
    };

    if (reducedMotion || !main || !media) {
      item.addEventListener('pointerenter', () => slide('1em'));
      item.addEventListener('pointerleave', () => slide('0em'));
      item.addEventListener('focusin', () => slide('1em'));
      item.addEventListener('focusout', () => slide('0em'));
      continue;
    }

    // over-scale once so the POV pan never shows the edges
    gsap.set(media, { scale: POV_SCALE });

    const panX = gsap.quickTo(media, 'x', { duration: 0.6, ease: 'power3.out' });
    const panY = gsap.quickTo(media, 'y', { duration: 0.6, ease: 'power3.out' });

    const enter = (): void => {
      slide('1em');
      // slight blur in, then sharpen — the reference's hover pulse
      gsap
        .timeline({ overwrite: 'auto' })
        .to(media, { filter: 'blur(9px)', duration: 0.18, ease: 'power2.in' })
        .to(media, { filter: 'blur(0px)', duration: 0.5, ease: 'power2.out' });
    };

    const move = (event: PointerEvent): void => {
      const rect = main.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      // normalized cursor position from tile center, clamped to [-1, 1]
      const nx = gsap.utils.clamp(-1, 1, ((event.clientX - rect.left) / rect.width) * 2 - 1);
      const ny = gsap.utils.clamp(-1, 1, ((event.clientY - rect.top) / rect.height) * 2 - 1);
      panX(-nx * rect.width * POV_PAN);
      panY(-ny * rect.height * POV_PAN);
    };

    const leave = (): void => {
      slide('0em');
      panX(0);
      panY(0);
      gsap.to(media, { filter: 'blur(0px)', duration: 0.3, ease: 'power2.out', overwrite: 'auto' });
    };

    item.addEventListener('pointerenter', enter);
    item.addEventListener('pointermove', move);
    item.addEventListener('pointerleave', leave);
    // keyboard parity with the old :focus-visible CSS rule
    item.addEventListener('focusin', () => slide('1em'));
    item.addEventListener('focusout', () => slide('0em'));
  }
}
