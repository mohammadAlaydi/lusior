import gsap from 'gsap';
import { ScrollTrigger } from './scroll';

/**
 * Tunnel zone choreography — the scroll-driven "scrolling video" stretch
 * inside #goal. One scrubbed ScrollTrigger spans the 400vh zone and, per
 * frame, (a) broadcasts progress to registered listeners (the WebGL gem
 * tunnel scene), (b) drives the big white title with quickSetters (no new
 * tweens per frame), and (c) toggles the html.is-black-bg page state.
 *
 * Everything is computed purely from progress, so scrubbing backwards is
 * always correct and idempotent.
 */

export interface TunnelZone {
  onProgress(cb: (p: number) => void): void;
}

type ProgressCallback = (p: number) => void;
type NumberSetter = (value: number) => void;

/* page state — dark while inside the zone, light again near the exit so the
 * following End section lands back on off-white */
const BLACK_BG_ENTER = 0.03;
const BLACK_BG_EXIT = 0.99;

/* per-line masked rise: line i runs [start + i * stagger, + duration]. Kept
 * brisk — the full title must be readable well before mid-zone; the long
 * stretch that follows is the hold, not the reveal. */
const LINE_RISE_START = 0.06;
const LINE_RISE_DURATION = 0.09;
const LINE_RISE_STAGGER = 0.035;
const LINE_HIDDEN_Y_PERCENT = 120;

/* hold drift (subtle depth parallax), then fly past the camera and vanish.
 * The drift start is DERIVED from the rise window of the actual line count
 * (+ margin) in setupTunnelZone — never hardcode it to the rise end, or a
 * copy/timing edit leaves the last line half-masked while the title already
 * scales away. */
const DRIFT_MARGIN = 0.03;
const DRIFT_EXTRA_SCALE = 0.06;
const FLY_START = 0.6;
const FLY_END = 0.82;
const FLY_MAX_SCALE = 2.4;

/** End of the staggered rise for `count` lines. */
function riseEndFor(count: number): number {
  return LINE_RISE_START + Math.max(0, count - 1) * LINE_RISE_STAGGER + LINE_RISE_DURATION;
}

export function setupTunnelZone(): TunnelZone {
  const callbacks: ProgressCallback[] = [];
  const zone: TunnelZone = {
    onProgress(cb: ProgressCallback): void {
      callbacks.push(cb);
    },
  };

  const tunnel = document.getElementById('tunnel');
  if (!tunnel) return zone; // no markup — inert stub, callbacks never fire

  // Query inside the zone: an older static placeholder with the same id may
  // still exist elsewhere in #goal.
  const title = tunnel.querySelector<HTMLElement>('#goal-tunnel-title');
  const lines = Array.from(
    tunnel.querySelectorAll<HTMLElement>('.goal-tunnel-title-line'),
  );

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotionQuery.matches) {
    // Static fallback: title fully visible, no ScrollTrigger, no class
    // toggling — tunnel.css gives #tunnel-inner its own dark backdrop.
    // (Lenis is also off here, so nothing may depend on smooth scroll.)
    const staticTargets: HTMLElement[] = [
      ...(title ? [title] : []),
      ...lines.flatMap((line) => spansOf(line)),
    ];
    if (staticTargets.length) {
      gsap.set(staticTargets, { clearProps: 'all' });
    }
    return zone;
  }

  const setLineY: NumberSetter[] = lines.map((line) =>
    quickSetterFor(spansOf(line), 'yPercent'),
  );
  const setTitleScale = title ? quickSetterFor(title, 'scale') : noopSetter;
  const setTitleOpacity = title ? quickSetterFor(title, 'opacity') : noopSetter;
  let isTitleHidden = false;

  // Drift may only begin once every line has fully risen (+ margin), and must
  // still leave room before the fly-out.
  const driftStart = Math.min(riseEndFor(lines.length) + DRIFT_MARGIN, FLY_START - 0.05);

  const applyTitleState = (p: number): void => {
    // masked rise — each line translates from 120 to 0 across its window
    setLineY.forEach((setY, index) => {
      const start = LINE_RISE_START + index * LINE_RISE_STAGGER;
      const rise = segmentProgress(p, start, start + LINE_RISE_DURATION);
      setY(LINE_HIDDEN_Y_PERCENT * (1 - rise));
    });

    // hold with a subtle scale drift, then fly past the camera and fade
    const drift = 1 + DRIFT_EXTRA_SCALE * segmentProgress(p, driftStart, FLY_START);
    const fly = segmentProgress(p, FLY_START, FLY_END);
    setTitleScale(drift + (FLY_MAX_SCALE - drift) * fly);
    setTitleOpacity(1 - fly);

    // fully hidden past the fly-out so the faded title never paints
    const shouldHide = p >= FLY_END;
    if (title && shouldHide !== isTitleHidden) {
      isTitleHidden = shouldHide;
      title.style.visibility = shouldHide ? 'hidden' : '';
    }
  };

  // Seed the resting state (lines masked below) before the first scroll tick.
  applyTitleState(0);

  const trigger = ScrollTrigger.create({
    trigger: tunnel,
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    invalidateOnRefresh: true,
    onUpdate: (self: ScrollTrigger): void => {
      const p = self.progress;
      // add > ENTER, remove <= ENTER and >= EXIT; pure function of p, so
      // scrubbing back through the zone re-applies it correctly
      setBlackBg(p > BLACK_BG_ENTER && p < BLACK_BG_EXIT);
      applyTitleState(p);
      for (const cb of callbacks) cb(p);
    },
    // belt & braces: never leave the page black outside the zone
    onLeave: (): void => setBlackBg(false),
    onLeaveBack: (): void => setBlackBg(false),
  });

  // If the OS switches to reduced motion mid-session, degrade to the static
  // fallback live (tunnel.css's reduce block re-evaluates on its own; the JS
  // scrub must stop driving masked spans or words animate un-clipped). The
  // opposite switch (reduce -> motion) keeps the static state until reload.
  reducedMotionQuery.addEventListener('change', (e: MediaQueryListEvent): void => {
    if (!e.matches) return;
    trigger.kill();
    setBlackBg(false);
    const staticTargets: HTMLElement[] = [
      ...(title ? [title] : []),
      ...lines.flatMap((line) => spansOf(line)),
    ];
    if (staticTargets.length) gsap.set(staticTargets, { clearProps: 'all' });
    if (title) title.style.visibility = '';
  });

  return zone;
}

/** Direct spans of a title line (the animated, masked words). */
function spansOf(line: HTMLElement): HTMLElement[] {
  return Array.from(line.querySelectorAll<HTMLElement>('span'));
}

/** Typed wrapper around gsap.quickSetter for per-frame numeric writes. */
function quickSetterFor(targets: gsap.TweenTarget, property: string): NumberSetter {
  const setter = gsap.quickSetter(targets, property);
  return (value: number): void => {
    setter(value);
  };
}

const noopSetter: NumberSetter = (): void => {
  /* no title element — nothing to drive */
};

/** Linear 0→1 progress of p across [start, end], clamped. */
function segmentProgress(p: number, start: number, end: number): number {
  if (end <= start) return p >= end ? 1 : 0;
  return Math.min(1, Math.max(0, (p - start) / (end - start)));
}

function setBlackBg(active: boolean): void {
  document.documentElement.classList.toggle('is-black-bg', active);
}
