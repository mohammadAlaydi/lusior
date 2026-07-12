/**
 * End-section confetti field — a hundred-odd flat, colourful 2D shapes
 * scattered on the off-white page behind the closing CTA. Canvas-2D with a
 * seeded layout (identical arrangement on every load), gentle idle
 * tumble/bob, scroll parallax computed from plain bounding-rect math, and a
 * soft pointer repel. The rAF loop only runs while #end is on screen, and
 * prefers-reduced-motion renders a single static frame instead.
 * All shapes are drawn procedurally — no external assets.
 */

type Rng = () => number;

type ShapeKind =
  | 'circle'
  | 'ring'
  | 'pentagon'
  | 'triangle'
  | 'bowtie'
  | 'roundedSquare'
  | 'oval'
  | 'halfDisc'
  | 'sparkle'
  | 'crescent';

interface ConfettiShape {
  readonly ux: number;
  readonly uy: number;
  readonly size: number;
  readonly color: string;
  readonly kind: ShapeKind;
  readonly depth: number;
  readonly spin: number;
  readonly bobAmp: number;
  readonly bobPhase: number;
  readonly bobSpeed: number;
  rotation: number;
  repelX: number;
  repelY: number;
}

interface Weighted {
  readonly weight: number;
}

const TWO_PI = Math.PI * 2;
const LAYOUT_SEED = 0x10ad5eed;
const MAX_DPR = 2;
const COUNT_MIN = 92;
const COUNT_MAX = 128;
const MAX_PLACEMENT_TRIES_PER_SHAPE = 40;
/* Elliptical keep-out around the centered title: ~55vw x 45vh (half-axes in
 * unit space). A small quota of clamped shapes is still allowed inside. */
const KEEPOUT_RADIUS_X = 0.275;
const KEEPOUT_RADIUS_Y = 0.225;
const KEEPOUT_QUOTA = 6;
const KEEPOUT_MAX_SIZE = 18;
/* Outside the hard keep-out, the size cap tapers back up to SIZE_MAX over this
 * wider ring (in ellipse-radius multiples) instead of jumping straight to the
 * uncapped range — without the taper, a ~50-70px shape can land immediately
 * adjacent to the keep-out edge and read as a big smudge crowding the title. */
const KEEPOUT_BUFFER_SCALE = 1.6;
const SIZE_MIN = 10;
const SIZE_MAX = 56;
const SIZE_JUMBO_MAX = 72;
const JUMBO_CHANCE = 0.05;
/* pow(u, k) with k < 1 biases u toward 1 — toward the edges / the bottom. */
const EDGE_BIAS_EXPONENT = 0.72;
const BOTTOM_BIAS_EXPONENT = 0.74;
const DEPTH_MIN = 0.2;
const DEPTH_MAX = 1.0;
const PARALLAX_RANGE_PX = 140;
const BOB_AMP_MIN = 2;
const BOB_AMP_MAX = 6;
const BOB_SPEED_MIN = 0.35;
const BOB_SPEED_MAX = 0.85;
const SPIN_MAX_RAD_PER_SEC = 0.45;
const REPEL_RADIUS_PX = 130;
const REPEL_STRENGTH_PX = 14;
const REPEL_EASE = 0.12;
const MAX_FRAME_DT_SEC = 0.05;
const POINTER_FAR_AWAY = -1e9;
const COLOR_WHITE = '#ffffff';
const WHITE_HAIRLINE_STROKE = '#d6d9e6';

const COLOR_WEIGHTS: ReadonlyArray<{ readonly color: string } & Weighted> = [
  { color: '#c5cbd9', weight: 38 },
  { color: '#15161a', weight: 20 },
  { color: '#6b7180', weight: 10 },
  { color: '#1a2ffb', weight: 8 },
  { color: '#ff4c41', weight: 6 },
  { color: '#21c93f', weight: 6 },
  { color: '#c1ff00', weight: 4 },
  { color: '#8832f7', weight: 4 },
  { color: '#ff37b8', weight: 2 },
  { color: COLOR_WHITE, weight: 2 },
];

const KIND_WEIGHTS: ReadonlyArray<{ readonly kind: ShapeKind } & Weighted> = [
  { kind: 'circle', weight: 18 },
  { kind: 'ring', weight: 12 },
  { kind: 'triangle', weight: 12 },
  { kind: 'roundedSquare', weight: 10 },
  { kind: 'oval', weight: 10 },
  { kind: 'pentagon', weight: 8 },
  { kind: 'bowtie', weight: 8 },
  { kind: 'halfDisc', weight: 8 },
  { kind: 'sparkle', weight: 7 },
  { kind: 'crescent', weight: 7 },
];

/** Tiny deterministic PRNG so the scatter never changes between reloads. */
function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

function pickWeighted<T extends Weighted>(rng: Rng, entries: readonly T[]): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  let chosen: T | null = null;
  for (const entry of entries) {
    chosen = entry;
    roll -= entry.weight;
    if (roll <= 0) {
      break;
    }
  }
  if (!chosen) {
    throw new Error('pickWeighted requires a non-empty entries list');
  }
  return chosen;
}

function sampleUnitX(rng: Rng): number {
  const side = rng() < 0.5 ? -1 : 1;
  return 0.5 + side * 0.5 * Math.pow(rng(), EDGE_BIAS_EXPONENT);
}

function sampleUnitY(rng: Rng): number {
  return Math.pow(rng(), BOTTOM_BIAS_EXPONENT);
}

/** Normalized elliptical distance from the keep-out center: <1 = inside the
 * hard keep-out, 1..KEEPOUT_BUFFER_SCALE = the size-taper ring, beyond that
 * the field is at full size. */
function keepOutDistance(ux: number, uy: number): number {
  const nx = (ux - 0.5) / KEEPOUT_RADIUS_X;
  const ny = (uy - 0.5) / KEEPOUT_RADIUS_Y;
  return Math.sqrt(nx * nx + ny * ny);
}

function createShape(rng: Rng, ux: number, uy: number, sizeCapPx: number): ConfettiShape {
  const jumboRoll = rng();
  const sizeRoll = rng();
  let size = SIZE_MIN + sizeRoll * (SIZE_MAX - SIZE_MIN);
  if (jumboRoll < JUMBO_CHANCE) {
    size = SIZE_MAX + sizeRoll * (SIZE_JUMBO_MAX - SIZE_MAX);
  }
  size = Math.min(size, sizeCapPx);
  return {
    ux,
    uy,
    size,
    color: pickWeighted(rng, COLOR_WEIGHTS).color,
    kind: pickWeighted(rng, KIND_WEIGHTS).kind,
    depth: DEPTH_MIN + rng() * (DEPTH_MAX - DEPTH_MIN),
    spin: (rng() - 0.5) * 2 * SPIN_MAX_RAD_PER_SEC,
    bobAmp: BOB_AMP_MIN + rng() * (BOB_AMP_MAX - BOB_AMP_MIN),
    bobPhase: rng() * TWO_PI,
    bobSpeed: BOB_SPEED_MIN + rng() * (BOB_SPEED_MAX - BOB_SPEED_MIN),
    rotation: rng() * TWO_PI,
    repelX: 0,
    repelY: 0,
  };
}

function createShapes(rng: Rng): ConfettiShape[] {
  const count = COUNT_MIN + Math.floor(rng() * (COUNT_MAX - COUNT_MIN + 1));
  const shapes: ConfettiShape[] = [];
  let keepOutUsed = 0;
  let tries = 0;
  while (shapes.length < count && tries < count * MAX_PLACEMENT_TRIES_PER_SHAPE) {
    tries += 1;
    const ux = sampleUnitX(rng);
    const uy = sampleUnitY(rng);
    const dist = keepOutDistance(ux, uy);
    const inKeepOut = dist < 1;
    if (inKeepOut && keepOutUsed >= KEEPOUT_QUOTA) {
      continue; // rejection sampling keeps the title area mostly clear
    }
    if (inKeepOut) {
      keepOutUsed += 1;
    }
    const sizeCapPx = inKeepOut
      ? KEEPOUT_MAX_SIZE
      : dist < KEEPOUT_BUFFER_SCALE
        ? KEEPOUT_MAX_SIZE + (SIZE_MAX - KEEPOUT_MAX_SIZE) * ((dist - 1) / (KEEPOUT_BUFFER_SCALE - 1))
        : SIZE_JUMBO_MAX;
    shapes.push(createShape(rng, ux, uy, sizeCapPx));
  }
  return shapes;
}

/* --- procedural shape paths (path only; fill/stroke happen in drawShape) -- */

type ShapePainter = (ctx: CanvasRenderingContext2D, size: number) => void;

function paintPolygon(ctx: CanvasRenderingContext2D, radius: number, sides: number): void {
  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * TWO_PI - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}

function paintRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

const SHAPE_PAINTERS: Record<ShapeKind, ShapePainter> = {
  circle: (ctx, size) => {
    ctx.arc(0, 0, size / 2, 0, TWO_PI);
  },
  ring: (ctx, size) => {
    const outer = size / 2;
    const inner = outer * 0.55;
    ctx.arc(0, 0, outer, 0, TWO_PI, false);
    ctx.moveTo(inner, 0);
    ctx.arc(0, 0, inner, 0, TWO_PI, true); // opposite winding cuts the hole
  },
  pentagon: (ctx, size) => {
    paintPolygon(ctx, size / 2, 5);
  },
  triangle: (ctx, size) => {
    paintPolygon(ctx, size / 2, 3);
  },
  bowtie: (ctx, size) => {
    const w = size / 2;
    const h = size * 0.3;
    ctx.moveTo(-w, -h);
    ctx.lineTo(0, 0);
    ctx.lineTo(-w, h);
    ctx.closePath();
    ctx.moveTo(w, -h);
    ctx.lineTo(0, 0);
    ctx.lineTo(w, h);
    ctx.closePath();
  },
  roundedSquare: (ctx, size) => {
    paintRoundedRect(ctx, -size / 2, -size / 2, size, size, size * 0.22);
  },
  oval: (ctx, size) => {
    ctx.ellipse(0, 0, size / 2, size * 0.31, 0, 0, TWO_PI);
  },
  halfDisc: (ctx, size) => {
    ctx.arc(0, 0, size / 2, 0, Math.PI);
    ctx.closePath();
  },
  sparkle: (ctx, size) => {
    const outer = size / 2;
    const inner = outer * 0.32;
    for (let i = 0; i < 8; i += 1) {
      const radius = i % 2 === 0 ? outer : inner;
      const angle = (i / 8) * TWO_PI - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
  },
  crescent: (ctx, size) => {
    /* Outer arc is the right half of a circle; the back arc is a wider
     * circle through the same tips, leaving a thin sliver (~0.3R thick). */
    const outer = size / 2;
    const backCenterX = -outer * 0.364;
    const backRadius = outer * 1.064;
    const meetAngle = Math.atan2(outer, -backCenterX);
    ctx.arc(0, 0, outer, -Math.PI / 2, Math.PI / 2, false);
    ctx.arc(backCenterX, 0, backRadius, meetAngle, -meetAngle, true);
    ctx.closePath();
  },
};

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: ConfettiShape,
  x: number,
  y: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(shape.rotation);
  ctx.beginPath();
  SHAPE_PAINTERS[shape.kind](ctx, shape.size);
  ctx.fillStyle = shape.color;
  ctx.fill();
  if (shape.color === COLOR_WHITE) {
    // hairline so white shapes still read on the off-white page
    ctx.lineWidth = 1;
    ctx.strokeStyle = WHITE_HAIRLINE_STROKE;
    ctx.stroke();
  }
  ctx.restore();
}

/* --- field driver --------------------------------------------------------- */

class ConfettiField {
  private readonly shapes: ConfettiShape[] = createShapes(mulberry32(LAYOUT_SEED));
  private readonly pointer = { x: POINTER_FAR_AWAY, y: POINTER_FAR_AWAY };
  private width = 0;
  private height = 0;
  private rafId = 0;
  private running = false;
  private lastTime = 0;

  constructor(
    private readonly section: HTMLElement,
    private readonly inner: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
    private readonly reducedMotion: boolean,
  ) {}

  init(): void {
    const resizeObserver = new ResizeObserver(() => this.resize());
    resizeObserver.observe(this.inner);
    this.resize();
    if (this.reducedMotion) {
      return; // static frame only — no rAF, no parallax, no repel
    }
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', this.onPointerLeave);
    const intersectionObserver = new IntersectionObserver((entries) => {
      const latest = entries[entries.length - 1];
      if (latest && latest.isIntersecting) {
        this.start();
      } else {
        this.stop();
      }
    });
    intersectionObserver.observe(this.section);
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
  };

  private readonly onPointerLeave = (): void => {
    this.pointer.x = POINTER_FAR_AWAY;
    this.pointer.y = POINTER_FAR_AWAY;
  };

  private resize(): void {
    const rect = this.inner.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Positions live in unit space, so the same seed simply rescales here.
    if (this.reducedMotion) {
      this.renderStatic();
    } else if (!this.running) {
      this.render(performance.now() / 1000, 0);
    }
  }

  private start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.lastTime = 0;
    this.rafId = window.requestAnimationFrame(this.frame);
  }

  private stop(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    window.cancelAnimationFrame(this.rafId);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) {
      return;
    }
    const dt = this.lastTime === 0 ? 0 : Math.min((now - this.lastTime) / 1000, MAX_FRAME_DT_SEC);
    this.lastTime = now;
    this.render(now / 1000, dt);
    this.rafId = window.requestAnimationFrame(this.frame);
  };

  /** 0 at section top entering, 1 fully scrolled past — plain rect math. */
  private readSectionProgress(): number {
    const rect = this.section.getBoundingClientRect();
    const range = rect.height - window.innerHeight;
    if (range <= 0) {
      return 0.5; // degenerate layout: park at the neutral (zero-offset) point
    }
    return Math.min(1, Math.max(0, -rect.top / range));
  }

  private applyRepel(shape: ConfettiShape, x: number, y: number, px: number, py: number): void {
    let targetX = 0;
    let targetY = 0;
    const dx = x - px;
    const dy = y - py;
    const dist = Math.hypot(dx, dy);
    if (dist > 0 && dist < REPEL_RADIUS_PX) {
      const push = (1 - dist / REPEL_RADIUS_PX) * REPEL_STRENGTH_PX;
      targetX = (dx / dist) * push;
      targetY = (dy / dist) * push;
    }
    shape.repelX += (targetX - shape.repelX) * REPEL_EASE;
    shape.repelY += (targetY - shape.repelY) * REPEL_EASE;
  }

  private render(timeSec: number, dt: number): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
    const progress = this.readSectionProgress();
    const canvasRect = this.canvas.getBoundingClientRect();
    const px = this.pointer.x - canvasRect.left;
    const py = this.pointer.y - canvasRect.top;
    for (const shape of this.shapes) {
      shape.rotation += shape.spin * dt;
      const x = shape.ux * this.width;
      const y =
        shape.uy * this.height +
        Math.sin(timeSec * shape.bobSpeed + shape.bobPhase) * shape.bobAmp +
        shape.depth * (progress - 0.5) * PARALLAX_RANGE_PX;
      this.applyRepel(shape, x, y, px, py);
      drawShape(this.ctx, shape, x + shape.repelX, y + shape.repelY);
    }
  }

  private renderStatic(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
    for (const shape of this.shapes) {
      drawShape(this.ctx, shape, shape.ux * this.width, shape.uy * this.height);
    }
  }
}

/**
 * Wires the confetti field to <canvas id="end-confetti"> inside #end-inner.
 * No-ops when the markup is absent or a 2D context is unavailable.
 */
export function setupEndConfetti(): void {
  const section = document.getElementById('end');
  const inner = document.getElementById('end-inner');
  const canvas = document.getElementById('end-confetti');
  if (!section || !inner || !(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  new ConfettiField(section, inner, canvas, ctx, reducedMotion).init();
}
