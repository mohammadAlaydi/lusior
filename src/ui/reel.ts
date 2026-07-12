import gsap from 'gsap';
import { ScrollTrigger } from './scroll';
import { splitWords } from './splitWords';

/**
 * Showreel scroll choreography (matched frame-by-frame against the reference):
 *  - masked line reveal for the two title lines
 *  - description + CTA ease in
 *  - one continuous ribbon draws itself across the whole section
 *  - the video morphs from a 5-column 16:9 thumb (blue duotone, beside the
 *    description) to the full-width 1728:680 frame, then holds pinned for
 *    ~a viewport while the reel plays before releasing
 *  - "Play [pill] Reel" overlay + corner crosses appear near full expansion
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

  // --- the ribbon draws itself in across the section -------------------------
  // It spans from beside the title, loops around the video thumb, and waves
  // out the right edge — fully drawn by the time the video finishes expanding.
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
        end: '+=170%',
        scrub: 0.5,
        invalidateOnRefresh: true,
      },
    });
  }

  // --- thumb -> fullwidth morph (reference: rect-to-rect lerp) ---------------
  const container = document.getElementById('reel-container');
  const frame = document.getElementById('reel-frame');
  const thumb = document.getElementById('reel-thumb');
  const sizer = document.getElementById('reel-sizer');
  if (!container || !frame || !thumb || !sizer) return;

  // Start/end rects are cached on every ScrollTrigger refresh (with pins
  // reverted) and the morph lerps between them — gsap's recorded fromTo
  // values would go stale when fonts/pin-spacers settle layout after boot.
  interface MorphRect {
    top: number;
    width: number;
    height: number;
  }
  let fromRect: MorphRect = { top: 0, width: 0, height: 0 };
  let toRect: MorphRect = { top: 0, width: 0, height: 0 };
  const measureRects = (): void => {
    const c = container.getBoundingClientRect();
    const t = thumb.getBoundingClientRect();
    const s = sizer.getBoundingClientRect();
    fromRect = { top: t.top - c.top, width: t.width, height: t.width * (9 / 16) };
    toRect = { top: s.top - c.top, width: s.width, height: s.width * (680 / 1728) };
  };
  measureRects();

  gsap.set(frame, { transformPerspective: 1400, transformOrigin: '50% 50%' });

  const morph = { p: 0 };
  const lerp = (a: number, b: number): number => a + (b - a) * morph.p;
  const applyMorph = (): void => {
    gsap.set(frame, {
      top: lerp(fromRect.top, toRect.top),
      width: lerp(fromRect.width, toRect.width),
      height: lerp(fromRect.height, toRect.height),
      // soft cloth-like flex while in motion (the reference's plane bend);
      // flat at rest on both ends
      rotationX: Math.sin(morph.p * Math.PI) * -2.4,
    });
  };

  ScrollTrigger.addEventListener('refreshInit', measureRects);
  ScrollTrigger.addEventListener('refresh', applyMorph);

  const overlayWords = gsap.utils.toArray<HTMLElement>('.reel-overlay-word');
  gsap.set(overlayWords, { opacity: 0, yPercent: 30 });
  gsap.set('#reel-watch', { opacity: 0, scale: 0.6 });
  gsap.set('.reel-deco .cross', { opacity: 0, scale: 0, transformOrigin: '50% 50%' });

  // The tile stays small while the description is read (reference behavior);
  // growth happens between the container reaching mid-viewport and the pin.
  const expand = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: container,
      start: 'top 52%',
      end: 'top 12%',
      scrub: 0.5,
    },
  });

  expand
    .to(morph, { p: 1, duration: 1, onUpdate: applyMorph }, 0)
    // blue duotone fades out as the frame grows
    .to('#reel-tint', { opacity: 0, duration: 0.55 }, 0.25)
    .to(
      ['#reel-video', '#reel-placeholder'],
      { filter: 'grayscale(0) brightness(1) contrast(1)', duration: 0.55 },
      0.25,
    )
    // the ghost "Play / Reel" words are already fading in behind the small
    // tile (reference shows them at ~half opacity before expansion begins)
    .to(overlayWords, { opacity: 1, yPercent: 0, duration: 0.5, stagger: 0.06 }, 0.02)
    .to('#reel-watch', { opacity: 1, scale: 1, duration: 0.26, ease: 'power2.out' }, 0.72)
    // all children must end within t=1 or the scrub range skews early
    .to(
      '.reel-deco .cross',
      { opacity: 1, scale: 1, duration: 0.14, stagger: 0.02, ease: 'power2.out' },
      0.78,
    );

  applyMorph();

  // --- pinned hold at full size (reference holds ~1 viewport) ----------------
  ScrollTrigger.create({
    trigger: container,
    start: 'top 12%',
    end: '+=90%',
    pin: true,
    pinSpacing: true,
    invalidateOnRefresh: true,
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
      // A transient/superseded load also fires 'error' (e.g. an aborted
      // request) — only hide for a genuine failure where no data was ever
      // buffered, mirroring the defensive readyState check in
      // videoOverlay.ts, so a transient abort can't permanently hide a
      // video that goes on to load fine.
      if (video.error && video.readyState === HTMLMediaElement.HAVE_NOTHING) {
        video.hidden = true;
      }
    },
    { once: true },
  );

  video.addEventListener('canplay', () => {
    video.hidden = false;
    void video.play().catch(() => {
      /* autoplay blocked: poster gradient stays */
    });
  });
}
