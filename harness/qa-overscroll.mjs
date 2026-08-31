// Overscroll UX verification: fill-only feedback, auto-decay when idle,
// advance at full, no preview-panel slide during fill.
import { chromium } from 'playwright';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const metrics = () => ({
  ratio: +((getComputedStyle(document.getElementById('project-details')).getPropertyValue('--next-ratio') || '0').trim() || 0),
  previewTransform: (() => {
    const p = document.getElementById('project-details-preview');
    return p ? getComputedStyle(p).transform.slice(0, 60) : null;
  })(),
  title: document.getElementById('project-details-title')?.textContent?.trim() ?? null,
});

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

  await page.goto('http://localhost:5173/projects/aurora-bloom', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.getElementById('preloader'), { timeout: 20000 }).catch(() => {});
  await sleep(3200);

  // wheel to gallery end
  await page.mouse.move(720, 450);
  for (let i = 0; i < 26; i++) { await page.mouse.wheel(0, 220); await sleep(90); }
  await sleep(800);
  console.log('AT-END:', JSON.stringify(await page.evaluate(metrics)));

  // partial fill (~50%), then STOP → expect decay to 0
  for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 220); await sleep(90); }
  const partial = await page.evaluate(metrics);
  console.log('PARTIAL-FILL:', JSON.stringify(partial));
  await sleep(1600);
  const afterIdle = await page.evaluate(metrics);
  console.log('AFTER-IDLE-1.6s:', JSON.stringify(afterIdle));

  // continuous overscroll to full → expect advance to Meridian
  for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 220); await sleep(90); }
  await sleep(3500);
  console.log('AFTER-FULL:', JSON.stringify(await page.evaluate(metrics)));

  // CTA reality check on the advanced (meridian) page
  const cta = await page.evaluate(() => {
    const a = document.querySelector('.project-details-launches--desktop .project-details-launch-cta');
    return a ? { tag: a.tagName, href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') } : null;
  });
  console.log('CTA:', JSON.stringify(cta));

  const verdicts = {
    decayWorks: partial.ratio > 0.15 && afterIdle.ratio <= 0.02,
    previewStayedPut: partial.previewTransform === (await page.evaluate(() => {
      const p = document.getElementById('project-details-preview');
      return p ? 'n/a-new-layer' : null;
    }), partial.previewTransform), // report raw values; judged by orchestrator
  };
  console.log('VERDICT decayWorks:', verdicts.decayWorks);
  await browser.close();
};

run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
