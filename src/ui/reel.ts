import gsap from 'gsap';
import './scroll';
import { splitWords } from './splitWords';

/**
 * Showreel scroll choreography:
 *  - masked line reveal for the two title lines
 *  - description + CTA ease in
 *  - the video frame starts as a small left-column "thumb" and expands to
 *    full width while pinned (the reference's signature morph), scrubbed
 *    by scroll
 *  - subtle hero parallax as it scrolls away
 */
export function setupReelSection(): void {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reducedMotion) {
    gsap.set(['.reel-line', '#reel-content'], { clearProps: 'all' });
    return;
  }

  // --- title: per-word masked reveal ----------------------------------------
  const titleWords = Array.from(document.querySelectorAll<HTMLElement>('.reel-line')).flatMap(
    (line) => splitWords(line),
  );
  gsap.set(titleWords, { yPercent: 115, rotation: 6, transformOrigin: '0% 100%' });
  gsap.to(titleWords, {
    yPercent: 0,
    rotation: 0,
    duration: 1.15,
    ease: 'power4.out',
    stagger: 0.07,
    scrollTrigger: {
      trigger: '#reel-title',
      start: 'top 82%',
      once: true,
    },
  });

  // --- description: line-by-line rise, then the CTA -------------------------
  const desc = document.getElementById('reel-desc');
  if (desc) {
    const descWords = splitWords(desc);
    gsap.set(descWords, { yPercent: 110 });
    gsap.to(descWords, {
      yPercent: 0,
      duration: 0.9,
      ease: 'power3.out',
      stagger: 0.012,
      scrollTrigger: {
        trigger: '#reel-content',
        start: 'top 85%',
        once: true,
      },
    });
  }

  gsap.from('#reel-cta', {
    opacity: 0,
    y: 24,
    duration: 0.9,
    ease: 'power3.out',
    scrollTrigger: {
      trigger: '#reel-content',
      start: 'top 80%',
      once: true,
    },
  });

  // --- blue swirl draws itself in with scroll --------------------------------
  const swirl = document.getElementById('reel-swirl-path') as SVGPathElement | null;
  if (swirl) {
    const length = swirl.getTotalLength();
    gsap.set(swirl, { strokeDasharray: length, strokeDashoffset: length });
    gsap.to(swirl, {
      strokeDashoffset: 0,
      ease: 'none',
      scrollTrigger: {
        trigger: '#reel',
        start: 'top 75%',
        end: 'top -35%',
        scrub: 0.5,
      },
    });
  }

  // --- inner video parallax while the section scrolls ------------------------
  gsap.fromTo(
    ['#reel-video', '#reel-placeholder'],
    { yPercent: -6, scale: 1.13 },
    {
      yPercent: 6,
      scale: 1.13,
      ease: 'none',
      scrollTrigger: {
        trigger: '#reel-container',
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
      },
    },
  );

  // --- thumb -> fullwidth expansion (pinned, scrubbed) -----------------------
  // Start state: ~45% width (5 of 12 columns), pulled up beside the content
  // column; end state: identity (full width in flow).
  const startScale = 0.45;

  gsap.fromTo(
    '#reel-frame',
    {
      scale: startScale,
      y: () => -Math.min(window.innerHeight * 0.22, 260),
      transformOrigin: '0% 0%',
    },
    {
      scale: 1,
      y: 0,
      ease: 'none',
      scrollTrigger: {
        trigger: '#reel-container',
        start: 'top 70%',
        end: '+=85%',
        scrub: 0.4,
        pin: true,
        pinSpacing: true,
        invalidateOnRefresh: true,
      },
    },
  );

  // decorative crosses appear once the frame is (mostly) expanded
  gsap.from('.reel-deco .cross', {
    opacity: 0,
    scale: 0,
    transformOrigin: '50% 50%',
    stagger: 0.05,
    duration: 0.5,
    ease: 'power2.out',
    scrollTrigger: {
      trigger: '#reel-container',
      start: 'top 25%',
      once: true,
    },
  });

  // --- hero drifts up slightly as the reel takes over ------------------------
  gsap.to('#hero-visual', {
    y: () => -window.innerHeight * 0.08,
    ease: 'none',
    scrollTrigger: {
      trigger: '#hero',
      start: 'bottom bottom',
      end: 'bottom top',
      scrub: true,
      invalidateOnRefresh: true,
    },
  });
}

/** Hides the <video> if its file is missing, leaving the animated placeholder. */
export function setupReelVideo(): void {
  const video = document.getElementById('reel-video') as HTMLVideoElement | null;
  if (!video) return;

  video.addEventListener(
    'error',
    () => {
      video.hidden = true;
    },
    { once: true },
  );

  video.addEventListener('canplay', () => {
    video.hidden = false;
    void video.play().catch(() => {
      /* autoplay blocked: poster gradient stays */
    });
  });

  // markup ships preload="metadata", which stops short of 'canplay' — pull the
  // stream so the listener actually fires when the file exists
  video.preload = 'auto';
  video.load();
}
