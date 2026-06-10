import gsap from 'gsap';

/**
 * Boot preloader choreography:
 *  - three digit columns, each holding a vertical glyph strip (0-9 plus a
 *    trailing 0) that rolls via translateY like an odometer
 *  - the displayed value tweens smoothly toward the latest setProgress()
 *    target, so milestone jumps (0 -> 40 -> 80 -> 100) read as continuous
 *    counting; higher digits carry only while the lower digit wraps 9 -> 0
 *  - finish(): roll to 100, hold briefly, honour a minimum visible time,
 *    flag <html> as ready (CSS drops the background), slide the digit row
 *    down out of its overflow mask, then remove the node
 * Plain gsap only — no ScrollTrigger/Lenis dependency, since the preloader
 * runs before smooth scroll exists.
 */

export interface Preloader {
  setProgress(target: number): void;
  finish(): Promise<void>;
}

interface DigitColumn {
  readonly column: HTMLElement;
  readonly strip: HTMLElement;
}

const DIGIT_COLUMN_COUNT = 3;
const STRIP_GLYPHS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const STEP_DURATION_S = 0.6;
const EXIT_DURATION_S = 0.6;
const HOLD_MS = 150;
const MIN_VISIBLE_MS = 800;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function buildDigitColumns(host: HTMLElement): DigitColumn[] {
  const columns: DigitColumn[] = [];

  for (let index = 0; index < DIGIT_COLUMN_COUNT; index += 1) {
    const column = document.createElement('span');
    column.className = 'preloader-percent-digit';

    const strip = document.createElement('span');
    strip.className = 'preloader-percent-strip';

    for (const glyph of STRIP_GLYPHS) {
      const cell = document.createElement('span');
      cell.className = 'preloader-percent-glyph';
      cell.textContent = glyph;
      strip.appendChild(cell);
    }

    column.appendChild(strip);
    host.appendChild(column);
    columns.push({ column, strip });
  }

  return columns;
}

/**
 * Continuous odometer positions (hundreds, tens, ones) for a value in
 * [0, 100]. A higher digit only rolls while the digit below it travels
 * through its 9 -> 0 wrap, exactly like a mechanical counter.
 */
function digitPositions(value: number): [number, number, number] {
  const ones = value % 10;
  const tens = (Math.floor(value / 10) % 10) + (ones > 9 ? ones - 9 : 0);
  const hundreds = (Math.floor(value / 100) % 10) + (tens > 9 ? tens - 9 : 0);
  return [hundreds, tens, ones];
}

/** Fallback when the #preloader markup is absent: never blocks boot. */
function createNoopPreloader(): Preloader {
  return {
    setProgress: (): void => undefined,
    finish: (): Promise<void> => {
      document.documentElement.classList.add('is-ready');
      return Promise.resolve();
    },
  };
}

export function createPreloader(): Preloader {
  const root = document.getElementById('preloader');
  const host = document.getElementById('preloader-percent-digits');
  if (!root || !host) {
    // Missing markup must not dead-lock boot — degrade to an instant pass.
    return createNoopPreloader();
  }
  // narrowed alias: control-flow narrowing does not reach inner closures
  const rootElement: HTMLElement = root;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const startTime = performance.now();
  const columns = buildDigitColumns(host);
  const displayed = { value: 0 };
  let currentTarget = 0;
  let activeTween: gsap.core.Tween | null = null;
  let finishPromise: Promise<void> | null = null;

  function render(): void {
    const value = Math.min(Math.max(displayed.value, 0), 100);
    const positions = digitPositions(value);
    const shown = Math.floor(value);

    columns.forEach((digit, index) => {
      gsap.set(digit.strip, { yPercent: (-positions[index] * 100) / STRIP_GLYPHS.length });
    });

    // blank leading zeros: "7" not "007"; "100" shows all three
    columns[0].column.classList.toggle('is-blank', shown < 100);
    columns[1].column.classList.toggle('is-blank', shown < 10);
  }

  function setProgress(target: number): void {
    const next = Math.min(Math.max(target, 0), 100);
    if (next <= currentTarget) return; // progress only counts forward
    currentTarget = next;

    if (reducedMotion) {
      displayed.value = next;
      render();
      return;
    }

    activeTween?.kill();
    activeTween = gsap.to(displayed, {
      value: next,
      duration: STEP_DURATION_S,
      ease: 'power2.out',
      onUpdate: render,
    });
  }

  function tweenToFull(): Promise<void> {
    if (displayed.value >= 100) return Promise.resolve();

    return new Promise((resolve) => {
      activeTween?.kill();
      activeTween = gsap.to(displayed, {
        value: 100,
        duration: STEP_DURATION_S,
        ease: 'power2.out',
        onUpdate: render,
        onComplete: resolve,
      });
    });
  }

  function slideOut(): Promise<void> {
    return new Promise((resolve) => {
      gsap.to(
        columns.map((digit) => digit.column),
        {
          yPercent: 100,
          y: 0, // cancel the -0.05em optical offset so the row fully clears the mask
          duration: EXIT_DURATION_S,
          ease: 'power4.in',
          onComplete: resolve,
        },
      );
    });
  }

  async function runFinish(): Promise<void> {
    currentTarget = 100;

    if (reducedMotion) {
      displayed.value = 100;
      render();
      document.documentElement.classList.add('is-ready');
      rootElement.remove();
      return;
    }

    await tweenToFull();
    await delay(HOLD_MS);

    // keep the counter readable even on instant loads
    const elapsed = performance.now() - startTime;
    if (elapsed < MIN_VISIBLE_MS) {
      await delay(MIN_VISIBLE_MS - elapsed);
    }

    document.documentElement.classList.add('is-ready');
    await slideOut();
    rootElement.remove();
  }

  function finish(): Promise<void> {
    if (!finishPromise) {
      finishPromise = runFinish();
    }
    return finishPromise;
  }

  render();

  return { setProgress, finish };
}
