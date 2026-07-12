// Verifies the next-project advance is CANCELLABLE: fill the bar partway, then
// scroll back — the bar must drain to 0 and the project must NOT advance.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, 'shots-reverse');
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const metrics = () => {
  const root = document.getElementById('project-details');
  const bar = document.getElementById('project-details-preview-footer-bar-inner');
  return {
    ratio: root ? getComputedStyle(root).getPropertyValue('--next-ratio').trim() || '0' : '0',
    bar: bar ? +new DOMMatrixReadOnly(getComputedStyle(bar).transform).a.toFixed(3) : 0,
    title: (document.getElementById('project-details-title')?.textContent ?? '').trim(),
  };
};

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.getElementById('preloader'), { timeout: 20000 }).catch(() => {});
  await sleep(1000);
  await page.evaluate(() => document.querySelector('a[href="/projects/aurora-bloom"]')?.click());
  await sleep(2100);
  const startTitle = (await page.evaluate(metrics)).title;
  await page.mouse.move(720, 450);

  // Forward to the end + partway into the bar.
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 220);
    await sleep(90);
    if ((await page.evaluate(metrics)).bar >= 0.5) break;
  }
  const atHalf = await page.evaluate(metrics);
  await page.screenshot({ path: join(SHOTS, '00-bar-half.png') });
  console.log('FILLED:', JSON.stringify(atHalf));

  // Now reverse — the bar must drain and the title must not change.
  let drained = atHalf;
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel(0, -260);
    await sleep(90);
    drained = await page.evaluate(metrics);
    if (drained.bar <= 0.001) break;
  }
  await sleep(400);
  drained = await page.evaluate(metrics);
  await page.screenshot({ path: join(SHOTS, '01-after-reverse.png') });
  console.log('AFTER-REVERSE:', JSON.stringify(drained));

  const pass = drained.bar <= 0.02 && drained.title === startTitle;
  console.log(`REVERSE-CANCEL ${pass ? 'PASS' : 'FAIL'} (bar=${drained.bar}, title="${drained.title}", expected "${startTitle}")`);
  await browser.close();
};
run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
