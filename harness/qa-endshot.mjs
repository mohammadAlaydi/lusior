// End-section screenshots at 1440 and 1999 (strokes + confetti check).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, 'qa-shots-end');
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  for (const vw of [1440, 1999]) {
    const page = await browser.newPage({ viewport: { width: vw, height: Math.round(vw * 0.55) }, deviceScaleFactor: 1 });
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.getElementById('preloader'), { timeout: 20000 }).catch(() => {});
    await sleep(1200);
    await page.evaluate(() => {
      const end = document.getElementById('end');
      const r = end.getBoundingClientRect();
      window.__lenis?.scrollTo(r.top + window.scrollY + 5, { immediate: true });
    });
    await sleep(1800); // let the reveal + stroke draw-in finish
    await page.screenshot({ path: join(SHOTS, `end-${vw}.png`) });
    console.log(`SHOT end-${vw}`);
    await page.close();
  }
  await browser.close();
};

run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
