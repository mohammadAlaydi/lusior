// Screenshot + interaction driver for the lusion recreation.
// Opens a project, drives the horizontal gallery scroll, and logs the internal
// scroll metrics so we can see exactly how the "next project" advance behaves.
//
//   node harness/drive.mjs [slug] [wheelSteps] [wheelDelta]
//
// Screens land in harness/shots/NN-name.png. Re-run after each fix.

import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, 'shots');
const URL = 'http://localhost:5173/';
const SLUG = process.argv[2] ?? 'aurora-bloom';
const WHEEL_STEPS = Number(process.argv[3] ?? 70);
const WHEEL_DELTA = Number(process.argv[4] ?? 220);
const VW = 1440;
const VH = 900;

rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const pad = (i) => String(i).padStart(2, '0');

function readGalleryMetrics() {
  const root = document.getElementById('project-details');
  const move = document.getElementById('project-details-items-move-container');
  const wrap = document.getElementById('project-details-items-wrapper');
  const barInner = document.getElementById('project-details-preview-footer-bar-inner');
  const preview = document.getElementById('project-details-preview');
  const items = Array.from(document.querySelectorAll('.project-details-item'));
  const tx = (el) => {
    if (!el) return null;
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return Math.round(m.m41);
  };
  const move_x = tx(move);
  const max = move && wrap ? Math.max(0, move.scrollWidth - wrap.clientWidth) : 0;
  return {
    scrollWidth: move ? move.scrollWidth : 0,
    wrapClientWidth: wrap ? wrap.clientWidth : 0,
    maxScroll: max,
    moveTranslateX: move_x,
    visualAtEndPct: max ? Math.round((-move_x / max) * 100) : 0,
    nextRatio: root ? getComputedStyle(root).getPropertyValue('--next-ratio').trim() : '',
    barScaleX: barInner ? +new DOMMatrixReadOnly(getComputedStyle(barInner).transform).a.toFixed(3) : 0,
    itemCount: items.length,
    visibleItems: items.filter((i) => getComputedStyle(i).visibility === 'visible').length,
    title: (document.getElementById('project-details-title')?.textContent ?? '').trim(),
    previewTitle: (document.getElementById('project-details-preview-title')?.textContent ?? '').trim(),
  };
}

async function shot(page, name) {
  const file = join(SHOTS, `${pad(n++)}-${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });

  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(`console.error: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  console.log(`→ ${URL}  slug=${SLUG} steps=${WHEEL_STEPS} delta=${WHEEL_DELTA}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page
    .waitForFunction(() => !document.getElementById('preloader'), { timeout: 20000 })
    .catch(() => console.log('  (preloader still present after 20s)'));
  await sleep(1000);

  // Open the project by clicking its tile (router intercepts the click).
  const clicked = await page.evaluate((slug) => {
    const a = document.querySelector(`a[href="/projects/${slug}"]`);
    if (!a) return false;
    a.click();
    return true;
  }, SLUG);
  console.log(`click /projects/${SLUG}: ${clicked}`);
  await sleep(2100); // transition cover + reveal + open choreography
  await shot(page, 'project-open');

  let m = await page.evaluate(readGalleryMetrics);
  console.log('OPEN:', JSON.stringify(m));
  const firstTitle = m.title;

  await page.mouse.move(VW / 2, VH / 2);
  const trace = [];
  const bands = [0.25, 0.5, 0.75, 0.95];
  let bandIdx = 0;
  let endShot = false;
  let advancedShot = false;

  for (let i = 0; i < WHEEL_STEPS; i++) {
    await page.mouse.wheel(0, WHEEL_DELTA);
    await sleep(110);
    m = await page.evaluate(readGalleryMetrics);
    trace.push({ s: i + 1, xPct: m.visualAtEndPct, r: m.nextRatio || '0', bar: m.barScaleX, t: m.title });

    // The gallery has visually landed at its end (just before the bar fills).
    if (!endShot && m.visualAtEndPct >= 99 && m.barScaleX < 0.02) {
      await shot(page, 'gallery-end');
      endShot = true;
    }
    // Banded next-fill frames so we can see the held, dwellable preview.
    if (bandIdx < bands.length && m.barScaleX >= bands[bandIdx]) {
      await shot(page, `next-fill-${String(Math.round(bands[bandIdx] * 100)).padStart(2, '0')}`);
      bandIdx++;
    }
    // First advance: the title changed to the next project. Capture and stop.
    if (m.title && m.title !== firstTitle) {
      if (!advancedShot) {
        await sleep(3200); // let the wipe finish + next project open + settle
        m = await page.evaluate(readGalleryMetrics);
        await shot(page, 'advanced-to-next');
        advancedShot = true;
      }
      break;
    }
  }

  console.log('FINAL:', JSON.stringify(m));
  console.log(`stepsToReachEnd≈${trace.findIndex((r) => r.xPct >= 99) + 1}, ` +
    `stepsEndToAdvance≈${trace.length - (trace.findIndex((r) => r.xPct >= 99) + 1)}`);
  console.log('TRACE:');
  for (const r of trace) console.log('  ', JSON.stringify(r));
  console.log('ERRORS:', errors.length ? '\n  ' + errors.slice(0, 20).join('\n  ') : 'none');

  await browser.close();
};

run().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
