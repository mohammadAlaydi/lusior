// Quick due-diligence: home page top + horizontal overflow at mobile widths.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, 'qa-shots-home-mobile');
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  for (const vw of [375, 812]) {
    const page = await browser.newPage({ viewport: { width: vw, height: 812 }, deviceScaleFactor: 1, isMobile: vw <= 812, hasTouch: vw <= 812 });
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.getElementById('preloader'), { timeout: 20000 }).catch(() => {});
    await sleep(2500);
    const info = await page.evaluate(() => ({
      docOverflowX: document.documentElement.scrollWidth > innerWidth + 1,
      scrollW: document.documentElement.scrollWidth, vw: innerWidth,
    }));
    console.log(`HOME@${vw}:`, JSON.stringify(info));
    await page.screenshot({ path: join(SHOTS, `home-${vw}.png`) });
    await page.close();
  }
  await browser.close();
};
run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
