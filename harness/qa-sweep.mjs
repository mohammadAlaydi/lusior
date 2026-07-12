// Full home-page QA sweep for the lusion recreation.
// Boots the site, walks every section via Lenis, screenshots each landmark,
// and logs console errors / page errors / failed requests / state probes.
//
//   node harness/qa-sweep.mjs
//
// Shots land in harness/qa-shots/NN-name.png. JSON report on stdout.

import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, 'qa-shots');
const URL = 'http://localhost:5173/';
const VW = 1440;
const VH = 900;

rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const pad = (i) => String(i).padStart(2, '0');

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });

  const problems = [];
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning') problems.push(`console.${t}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} — ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`);
  });

  const shot = async (name) => {
    const file = join(SHOTS, `${pad(n++)}-${name}.png`);
    await page.screenshot({ path: file });
    console.log(`SHOT ${file}`);
  };

  console.log(`→ ${URL} @ ${VW}x${VH}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  // Boot: preloader should remove itself.
  const preloaderGone = await page
    .waitForFunction(() => !document.getElementById('preloader'), { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  console.log(`preloader removed: ${preloaderGone}`);
  await sleep(1500); // intro reveal
  await shot('boot-hero');

  // Landmarks: id, top offset, height.
  const landmarks = await page.evaluate(() => {
    const ids = ['hero', 'reel', 'featured', 'goal', 'end'];
    const list = [];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) { list.push({ id, missing: true }); continue; }
      const r = el.getBoundingClientRect();
      list.push({ id, top: Math.round(r.top + window.scrollY), height: Math.round(r.height) });
    }
    const footer = document.querySelector('footer');
    if (footer) {
      const r = footer.getBoundingClientRect();
      list.push({ id: 'footer', top: Math.round(r.top + window.scrollY), height: Math.round(r.height) });
    }
    const sn = document.getElementById('scroll-nav');
    if (sn) {
      const r = sn.getBoundingClientRect();
      list.push({ id: 'scroll-nav', top: Math.round(r.top + window.scrollY), height: Math.round(r.height) });
    }
    return {
      list,
      docHeight: document.documentElement.scrollHeight,
      lastElement: document.body.lastElementChild?.id || document.body.lastElementChild?.tagName,
    };
  });
  console.log('LANDMARKS:', JSON.stringify(landmarks));

  const probe = () => page.evaluate(() => ({
    y: Math.round(window.scrollY),
    htmlClass: document.documentElement.className,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    barScaleX: (() => {
      const el = document.querySelector('#scroll-nav [class*="bar"], #scroll-nav-progress, .scroll-nav-bar-inner');
      if (!el) return null;
      return +new DOMMatrixReadOnly(getComputedStyle(el).transform).a.toFixed(3);
    })(),
  }));

  // Scroll plan: each landmark start (+ mid/late points for tall zones).
  const stops = [];
  for (const lm of landmarks.list) {
    if (lm.missing) continue;
    stops.push({ name: `${lm.id}-top`, y: Math.max(0, lm.top - 1) });
    if (lm.height > VH * 1.6) {
      for (const p of [0.25, 0.5, 0.75, 0.92]) {
        stops.push({ name: `${lm.id}-${Math.round(p * 100)}`, y: Math.round(lm.top + (lm.height - VH) * p) });
      }
    }
  }
  stops.push({ name: 'bottom', y: 10 ** 7 });

  for (const s of stops) {
    await page.evaluate((y) => window.__lenis?.scrollTo(y, { immediate: true }), s.y);
    await sleep(140); // let ScrollTrigger see the new position
    // scrub catch-up: nudge a few real wheel events so velocity-based effects run
    await page.mouse.move(VW / 2, VH / 2);
    await page.mouse.wheel(0, 6);
    await sleep(700);
    const st = await probe();
    console.log(`STOP ${s.name}: ${JSON.stringify(st)}`);
    await shot(s.name);
  }

  // Full-page state after sweep
  const final = await probe();
  console.log('FINAL:', JSON.stringify(final));

  console.log('PROBLEMS:', problems.length ? '\n  ' + problems.slice(0, 60).join('\n  ') : 'none');
  await browser.close();
};

run().catch((e) => {
  console.error('DRIVER FAILED:', e);
  process.exit(1);
});
