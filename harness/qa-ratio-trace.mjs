// Fine-grained ratio timeline: wheel at drive-like cadence, sample bar scaleX
// every 50ms to catch whatever resets it.
import { chromium } from 'playwright';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bar = () => {
  const el = document.getElementById('project-details-preview-footer-bar-inner');
  if (!el) return null;
  return +new DOMMatrixReadOnly(getComputedStyle(el).transform).a.toFixed(3);
};

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.text().startsWith('[R]')) console.log(m.text()); });
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

  await page.goto('http://localhost:5173/projects/aurora-bloom', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.getElementById('preloader'), { timeout: 20000 }).catch(() => {});
  await sleep(3200);

  // in-page sampler: logs bar scaleX every 50ms for 4s
  await page.evaluate(() => {
    const el = document.getElementById('project-details-preview-footer-bar-inner');
    const t0 = performance.now();
    const id = setInterval(() => {
      const v = el ? +new DOMMatrixReadOnly(getComputedStyle(el).transform).a.toFixed(3) : null;
      console.log(`[R] t=${Math.round(performance.now() - t0)} bar=${v}`);
      if (performance.now() - t0 > 4200) clearInterval(id);
    }, 50);
  });

  await page.mouse.move(720, 450);
  // reach gallery end fast
  for (let i = 0; i < 26; i++) { await page.mouse.wheel(0, 220); await sleep(60); }
  await sleep(600);
  // now 4 wheels at ~300ms gaps (drive-like)
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 220); await sleep(300); }
  await sleep(1200);
  console.log('FINAL-BAR:', await page.evaluate(bar));
  await browser.close();
};

run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
