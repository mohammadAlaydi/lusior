// Interaction QA for the lusion recreation: hovers, overlay, menu, newsletter,
// tunnel title trace, scroll-nav bar, sound toggle, deep link + history.
//
//   node harness/qa-interact.mjs
//
// Shots land in harness/qa-shots-interact/. Report on stdout.

import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, 'qa-shots-interact');
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
    if (t === 'error' || t === 'warning') problems.push(`console.${t}: ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });

  const shot = async (name) => {
    await page.screenshot({ path: join(SHOTS, `${pad(n++)}-${name}.png`) });
    console.log(`SHOT ${name}`);
  };
  const lenisTo = async (y) => {
    await page.evaluate((yy) => window.__lenis?.scrollTo(yy, { immediate: true }), y);
    await sleep(600);
  };

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.getElementById('preloader'), { timeout: 20000 }).catch(() => {});
  await sleep(1200);

  // ---- 1. Featured tile hover ----
  const tileInfo = await page.evaluate(() => {
    const a = document.querySelector('#featured a[href^="/projects/"]');
    if (!a) return null;
    const r = a.getBoundingClientRect();
    return { top: r.top + window.scrollY, href: a.getAttribute('href') };
  });
  console.log('TILE:', JSON.stringify(tileInfo));
  if (tileInfo) {
    await lenisTo(tileInfo.top - 200);
    await shot('featured-before-hover');
    await page.locator('#featured a[href^="/projects/"]').first().hover();
    await sleep(900);
    await shot('featured-hover');
    const hoverState = await page.evaluate(() => {
      const a = document.querySelector('#featured a[href^="/projects/"]');
      const media = a.querySelector('img, video, [class*="media"], [class*="thumb"]');
      const name = a.querySelector('[class*="name"], [class*="title"], h3, h2');
      const tx = (el) => el ? getComputedStyle(el).transform : null;
      return { mediaTransform: tx(media), nameTransform: tx(name), mediaFilter: media ? getComputedStyle(media).filter : null };
    });
    console.log('HOVER-STATE:', JSON.stringify(hoverState));
    await page.mouse.move(VW / 2, 40); // unhover
    await sleep(500);
  }

  // ---- 2. Video overlay via watch pill ----
  const watch = await page.evaluate(() => {
    const el = document.getElementById('reel-watch') || document.querySelector('[id*="watch"], .reel-watch');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top + window.scrollY, id: el.id };
  });
  console.log('WATCH:', JSON.stringify(watch));
  if (watch) {
    await lenisTo(watch.top - VH / 2);
    const pill = page.locator('#' + watch.id);
    await pill.click({ force: true });
    await sleep(1500);
    const overlayState = await page.evaluate(() => {
      const ov = document.querySelector('#video-overlay, [class*="video-overlay"], [id*="overlay"]');
      const v = ov ? ov.querySelector('video') : null;
      return {
        overlayFound: !!ov,
        overlayVisible: ov ? getComputedStyle(ov).display + '/' + getComputedStyle(ov).opacity + '/' + getComputedStyle(ov).visibility : null,
        video: v ? { src: v.currentSrc, readyState: v.readyState, paused: v.paused, error: v.error ? v.error.code : null } : null,
        lenisStopped: window.__lenis ? window.__lenis.isStopped : null,
      };
    });
    console.log('OVERLAY:', JSON.stringify(overlayState));
    await shot('video-overlay-open');
    await page.keyboard.press('Escape');
    await sleep(1000);
    const afterClose = await page.evaluate(() => ({
      overlayVisible: (() => { const ov = document.querySelector('#video-overlay, [class*="video-overlay"]'); return ov ? getComputedStyle(ov).display + '/' + getComputedStyle(ov).opacity : null; })(),
      lenisStopped: window.__lenis ? window.__lenis.isStopped : null,
      scrollY: Math.round(window.scrollY),
    }));
    console.log('OVERLAY-CLOSED:', JSON.stringify(afterClose));
    await shot('video-overlay-closed');
  }

  // ---- 3. Menu open/close ----
  await lenisTo(0);
  const menuBtn = page.locator('text=MENU').first();
  await menuBtn.click({ force: true });
  await sleep(1200);
  await shot('menu-open');
  const menuState = await page.evaluate(() => {
    const m = document.querySelector('#menu, .menu, [class*="menu-panel"], [class*="menu-overlay"]');
    const links = [...document.querySelectorAll('#menu a, .menu a, nav a')].map((a) => a.getAttribute('href')).slice(0, 12);
    return { found: !!m, visible: m ? getComputedStyle(m).visibility + '/' + getComputedStyle(m).opacity : null, links };
  });
  console.log('MENU:', JSON.stringify(menuState));
  await page.keyboard.press('Escape');
  await sleep(900);
  await shot('menu-closed');

  // ---- 4. Footer newsletter ----
  await lenisTo(10 ** 7);
  await sleep(800);
  const nl = await page.evaluate(() => {
    const input = document.querySelector('footer input[type="email"], footer input');
    const form = input ? input.closest('form') : null;
    return input ? { found: true, formAction: form ? form.getAttribute('action') : null } : { found: false };
  });
  console.log('NEWSLETTER:', JSON.stringify(nl));
  if (nl.found) {
    const input = page.locator('footer input').first();
    await input.fill('not-an-email');
    await input.press('Enter');
    await sleep(900);
    await shot('newsletter-invalid');
    const invalidState = await page.evaluate(() => {
      const input = document.querySelector('footer input');
      const msg = document.querySelector('footer [class*="error"], footer [class*="message"], footer [class*="status"], footer [aria-live]');
      return { value: input?.value, msg: msg ? msg.textContent?.trim().slice(0, 80) : null, validity: input?.validity?.valid };
    });
    console.log('NEWSLETTER-INVALID:', JSON.stringify(invalidState));
    await input.fill('qa-test@example.com');
    const respPromise = page.waitForResponse((r) => r.url().includes('/api/'), { timeout: 5000 }).catch(() => null);
    await input.press('Enter');
    const resp = await respPromise;
    await sleep(900);
    await shot('newsletter-valid');
    const validState = await page.evaluate(() => {
      const msg = document.querySelector('footer [class*="error"], footer [class*="message"], footer [class*="status"], footer [aria-live]');
      return { msg: msg ? msg.textContent?.trim().slice(0, 120) : null };
    });
    console.log('NEWSLETTER-SUBMIT:', JSON.stringify({ apiStatus: resp ? resp.status() : 'NO API CALL', apiUrl: resp ? resp.url() : null, ...validState }));
  }

  // ---- 5. Scroll-nav bar at bottom ----
  const snState = await page.evaluate(() => {
    const sn = document.getElementById('scroll-nav');
    if (!sn) return null;
    const all = [...sn.querySelectorAll('*')];
    const scaled = all
      .map((el) => {
        const t = getComputedStyle(el).transform;
        if (!t || t === 'none') return null;
        const m = new DOMMatrixReadOnly(t);
        return { cls: el.className, scaleX: +m.a.toFixed(3) };
      })
      .filter(Boolean);
    return { scrollY: Math.round(window.scrollY), max: document.documentElement.scrollHeight - innerHeight, scaled, html: sn.outerHTML.slice(0, 800) };
  });
  console.log('SCROLLNAV:', JSON.stringify(snState));

  // ---- 6. Back-to-top button ----
  const btt = await page.evaluate(() => {
    const b = document.querySelector('footer button[class*="top"], footer [class*="back-to-top"], footer [class*="to-top"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  console.log('BTT:', JSON.stringify(btt));
  if (btt) {
    await page.mouse.click(btt.x, btt.y);
    await sleep(2500);
    console.log('BTT-AFTER:', JSON.stringify(await page.evaluate(() => Math.round(window.scrollY))));
  }

  // ---- 7. Tunnel title trace ----
  const goal = await page.evaluate(() => {
    const g = document.getElementById('goal');
    const r = g.getBoundingClientRect();
    return { top: r.top + window.scrollY, height: r.height };
  });
  const tunnelProbe = () => page.evaluate(() => {
    const title = document.querySelector('[class*="tunnel"] [class*="title"], #tunnel-title, [class*="tunnel-title"]');
    if (!title) return { found: false };
    const cs = getComputedStyle(title);
    const lines = [...title.querySelectorAll('span, div')].slice(0, 6).map((l) => {
      const c = getComputedStyle(l);
      return { t: (l.textContent || '').trim().slice(0, 24), transform: c.transform, opacity: c.opacity, clipPath: c.clipPath };
    });
    return { found: true, opacity: cs.opacity, transform: cs.transform, text: title.textContent?.trim().slice(0, 60), lines };
  });
  for (const p of [0.35, 0.5, 0.65, 0.8]) {
    await lenisTo(goal.top + goal.height * p - VH);
    await sleep(400);
    console.log(`TUNNEL@${p}:`, JSON.stringify(await tunnelProbe()));
    await shot(`tunnel-${Math.round(p * 100)}`);
  }

  // ---- 8. Deep link + history ----
  await page.goto(URL + 'projects/meridian', { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const deep = await page.evaluate(() => ({
    url: location.pathname,
    detailsVisible: (() => { const d = document.getElementById('project-details'); return d ? getComputedStyle(d).display + '/' + getComputedStyle(d).visibility : null; })(),
    title: document.getElementById('project-details-title')?.textContent?.trim() ?? null,
    preloaderGone: !document.getElementById('preloader'),
  }));
  console.log('DEEPLINK:', JSON.stringify(deep));
  await shot('deeplink-meridian');
  await page.goBack();
  await sleep(2000);
  console.log('BACK:', JSON.stringify(await page.evaluate(() => ({
    url: location.pathname,
    detailsGone: (() => { const d = document.getElementById('project-details'); return !d || getComputedStyle(d).display === 'none' || getComputedStyle(d).visibility === 'hidden'; })(),
    scrollY: Math.round(window.scrollY),
  }))));
  await shot('after-back');
  await page.goForward();
  await sleep(2000);
  console.log('FORWARD:', JSON.stringify(await page.evaluate(() => ({
    url: location.pathname,
    detailsVisible: (() => { const d = document.getElementById('project-details'); return d ? getComputedStyle(d).display + '/' + getComputedStyle(d).visibility : null; })(),
  }))));
  await shot('after-forward');

  console.log('PROBLEMS:', problems.length ? '\n  ' + problems.slice(0, 60).join('\n  ') : 'none');
  await browser.close();
};

run().catch((e) => { console.error('DRIVER FAILED:', e); process.exit(1); });
