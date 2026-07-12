// Smoke test: on mobile the next-project teaser card is tap-operable and
// advances to the next project (northwind -> aurora-bloom).
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('http://localhost:5173/projects/northwind', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.getElementById('preloader'), { timeout: 20000 }).catch(() => {});
  await sleep(4000);
  const before = await page.evaluate(() => document.getElementById('project-details-title')?.textContent);
  // scroll the internal layer to the teaser and tap it
  await page.evaluate(() => {
    const pd = document.getElementById('project-details');
    if (pd) pd.scrollTop = pd.scrollHeight;
  });
  await sleep(400);
  await page.locator('#project-details-preview').click();
  await sleep(4000);
  const after = await page.evaluate(() => document.getElementById('project-details-title')?.textContent);
  const url = page.url();
  console.log(JSON.stringify({ before, after, url, advanced: before !== after }));
  await browser.close();
};
run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
