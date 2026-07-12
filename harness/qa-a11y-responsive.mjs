// Reduced-motion + mobile viewport sanity for the lusion recreation.
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, 'qa-shots-a11y');
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  const browser = await chromium.launch({ headless: true });

  // ---- A. prefers-reduced-motion boot ----
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && problems.push(`console.error: ${m.text().slice(0, 160)}`));
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    const gone = await page.waitForFunction(() => !document.getElementById('preloader'), { timeout: 15000 }).then(() => true).catch(() => false);
    await sleep(1200);
    const state = await page.evaluate(() => ({
      htmlClass: document.documentElement.className,
      heroTitleOpacity: (() => { const t = document.querySelector('#hero h1, #hero [class*="title"]'); return t ? getComputedStyle(t).opacity : null; })(),
      docHeight: document.documentElement.scrollHeight,
    }));
    console.log('REDUCED-MOTION:', JSON.stringify({ preloaderGone: gone, ...state, problems: problems.slice(0, 10) }));
    await page.screenshot({ path: join(SHOTS, 'rm-boot.png') });
    // scroll to tunnel + end to confirm static fallbacks hold
    await page.evaluate(() => window.__lenis ? window.__lenis.scrollTo(document.documentElement.scrollHeight * 0.6, { immediate: true }) : window.scrollTo(0, document.documentElement.scrollHeight * 0.6));
    await sleep(900);
    await page.screenshot({ path: join(SHOTS, 'rm-tunnel.png') });
    console.log('REDUCED-MOTION problems after scroll:', JSON.stringify(problems.slice(0, 10)));
    await ctx.close();
  }

  // ---- B. Mobile viewport (390x844) ----
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && problems.push(`console.error: ${m.text().slice(0, 160)}`));
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    const gone = await page.waitForFunction(() => !document.getElementById('preloader'), { timeout: 15000 }).then(() => true).catch(() => false);
    await sleep(1500);
    const state = await page.evaluate(() => ({
      docHeight: document.documentElement.scrollHeight,
      overflowX: document.documentElement.scrollWidth > window.innerWidth ? `HORIZONTAL OVERFLOW ${document.documentElement.scrollWidth}` : 'none',
    }));
    console.log('MOBILE:', JSON.stringify({ preloaderGone: gone, ...state, problems: problems.slice(0, 10) }));
    await page.screenshot({ path: join(SHOTS, 'mobile-hero.png') });
    for (const [name, frac] of [['mobile-reel', 0.15], ['mobile-featured', 0.35], ['mobile-end', 0.85], ['mobile-footer', 1]]) {
      await page.evaluate((f) => {
        const y = (document.documentElement.scrollHeight - innerHeight) * f;
        window.__lenis ? window.__lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y);
      }, frac);
      await sleep(900);
      await page.screenshot({ path: join(SHOTS, `${name}.png`) });
    }
    console.log('MOBILE problems after sweep:', JSON.stringify(problems.slice(0, 10)));
    await ctx.close();
  }

  await browser.close();
};

run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
