import type { SoundEngine } from '../audio/soundEngine';

/**
 * Full-screen page-transition wipe used when routing into / out of a project
 * detail (see docs/project-details-spec.md §4). A set of staggered vertical
 * columns flood across the viewport in the route's accent colour, the swap
 * happens fully-covered (midpoint), then the columns retract the same way.
 *
 * Drawn on the #transition-overlay 2D canvas with requestAnimationFrame (no
 * GSAP dependency — the progress is a plain eased lerp). The canvas is sized to
 * devicePixelRatio and re-sized on window resize. Reduced motion skips the draw
 * entirely: it just awaits midpoint() and resolves (instant swap).
 */

export interface Transition {
  /** Cover the screen, await midpoint(), then reveal. ~0.55s each half. */
  play(midpoint: () => void | Promise<void>, accent?: string): Promise<void>;
  dispose(): void;
}

/** Default flood colour when a route doesn't pass an accent. */
const DEFAULT_ACCENT = '#0b0b10';
/** Number of columns the wipe is split into. */
const COLUMN_COUNT = 7;
/** Duration of each half (cover, reveal) in milliseconds. */
const HALF_DURATION_MS = 550;
/** Fraction of the half spent staggering across the columns. */
const STAGGER_SPAN = 0.4;

// cubic-bezier(.16, 1, .3, 1) — the repo's --ease-out-expo, matched to the CSS
// transitions on the detail layer. Control points: p1=(.16,1), p2=(.3,1).
const C1X = 0.16;
const C1Y = 1;
const C2X = 0.3;
const C2Y = 1;

/** One coordinate of the cubic bezier at parameter t (endpoints 0 and 1). */
function bezier(t: number, p1: number, p2: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t;
}

/** Map linear progress x to eased progress y by inverting bezierX, then bezierY. */
function easeOutExpo(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // Solve bezierX(t) = x with a few Newton-Raphson steps (curve is monotonic).
  let t = x;
  for (let i = 0; i < 6; i += 1) {
    const error = bezier(t, C1X, C2X) - x;
    const slope =
      3 * (1 - t) * (1 - t) * C1X + 6 * (1 - t) * t * (C2X - C1X) + 3 * t * t * (1 - C2X);
    if (Math.abs(slope) < 1e-5) break;
    t = Math.min(1, Math.max(0, t - error / slope));
  }
  return bezier(t, C1Y, C2Y);
}

interface OverlayCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

function queryOverlay(): OverlayCanvas | null {
  const canvas = document.getElementById('transition-overlay');
  if (!(canvas instanceof HTMLCanvasElement)) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  return { canvas, ctx };
}

/**
 * Per-column coverage at a given global progress p in [0,1], where 1 = fully
 * covered. Columns are staggered left-to-right so the wipe reads directional.
 */
function columnCoverage(index: number, p: number): number {
  const delay = (index / Math.max(1, COLUMN_COUNT - 1)) * STAGGER_SPAN;
  const local = (p - delay) / (1 - STAGGER_SPAN);
  return Math.min(1, Math.max(0, local));
}

export function createTransition(deps?: { sound?: SoundEngine }): Transition {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const overlay = queryOverlay();

  // No canvas (or reduced motion) -> no visual; just bridge the midpoint swap.
  if (!overlay || reducedMotion) {
    let disposed = false;
    return {
      play: async (midpoint, _accent): Promise<void> => {
        if (disposed) return;
        deps?.sound?.playUI('page');
        await midpoint();
      },
      dispose: (): void => {
        disposed = true;
      },
    };
  }

  const { canvas, ctx } = overlay;
  let dpr = 1;
  let cssWidth = 0;
  let cssHeight = 0;
  let disposed = false;
  let activeFrame = 0;
  let resolveAnimation: (() => void) | null = null;

  function resize(): void {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssWidth = window.innerWidth;
    cssHeight = window.innerHeight;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener('resize', resize);

  /** Paint the wipe at progress p (1 = fully covered). */
  function draw(p: number, accent: string): void {
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    if (p <= 0) return;
    ctx.fillStyle = accent;
    const colW = cssWidth / COLUMN_COUNT;
    for (let i = 0; i < COLUMN_COUNT; i += 1) {
      const cover = columnCoverage(i, p);
      if (cover <= 0) continue;
      const h = cssHeight * cover;
      // Columns grow from the top; +1 overlap kills sub-pixel seams.
      ctx.fillRect(i * colW, 0, colW + 1, h);
    }
  }

  /** rAF-driven tween of progress from `from`->`to`, easing each frame. */
  function animate(from: number, to: number, accent: string): Promise<void> {
    if (disposed) return Promise.resolve();
    return new Promise((resolve) => {
      resolveAnimation = resolve;
      const start = performance.now();
      const tick = (now: number): void => {
        if (disposed) {
          resolveAnimation = null;
          resolve();
          return;
        }
        const t = Math.min(1, (now - start) / HALF_DURATION_MS);
        const eased = easeOutExpo(t);
        draw(from + (to - from) * eased, accent);
        if (t < 1) {
          activeFrame = requestAnimationFrame(tick);
        } else {
          activeFrame = 0;
          resolveAnimation = null;
          resolve();
        }
      };
      activeFrame = requestAnimationFrame(tick);
    });
  }

  /** One full cover -> midpoint -> reveal cycle. */
  async function runOnce(midpoint: () => void | Promise<void>, accent?: string): Promise<void> {
    const colour = accent ?? DEFAULT_ACCENT;
    resize();

    canvas.classList.add('is-active');
    canvas.setAttribute('aria-hidden', 'true');
    deps?.sound?.playUI('page');

    try {
      await animate(0, 1, colour); // cover
      if (disposed) return;
      draw(1, colour); // hold fully covered while the swap runs
      await midpoint();
      if (disposed) return;
      await animate(1, 0, colour); // reveal
      ctx.clearRect(0, 0, cssWidth, cssHeight);
    } finally {
      canvas.classList.remove('is-active');
    }
  }

  // Serialise overlapping plays: each call chains onto the previous so every
  // cover -> midpoint -> reveal runs to completion before the next begins.
  let playChain: Promise<void> = Promise.resolve();

  function play(midpoint: () => void | Promise<void>, accent?: string): Promise<void> {
    if (disposed) return Promise.resolve();
    const next = playChain.then(() => runOnce(midpoint, accent));
    // Keep the serialization chain alive even if THIS play rejects — otherwise a
    // single failed transition (e.g. a throwing midpoint) would wedge every
    // future navigation. The returned promise still rejects for the caller.
    playChain = next.catch(() => undefined);
    return next;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    window.removeEventListener('resize', resize);
    if (activeFrame) cancelAnimationFrame(activeFrame);
    activeFrame = 0;
    resolveAnimation?.();
    resolveAnimation = null;
    canvas.classList.remove('is-active');
    ctx.clearRect(0, 0, cssWidth, cssHeight);
  }

  return { play, dispose };
}
