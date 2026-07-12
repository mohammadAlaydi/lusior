// Deep-link regression debug: full console + request trace + state dump.
import { chromium } from 'playwright';

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  page.on('console', (m) => console.log(`[console.${m.type()}] ${m.text().slice(0, 200)}`));
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => console.log(`[requestfailed] ${r.url()}`));
  page.on('response', (r) => {
    if (r.url().includes('/api/')) console.log(`[api] ${r.status()} ${r.url()}`);
  });
  await page.addInitScript(() => {
    window.addEventListener('unhandledrejection', (e) => {
      console.error('UNHANDLED REJECTION:', e.reason && (e.reason.stack || e.reason.message || String(e.reason)));
    });
    window.addEventListener('error', (e) => {
      console.error('WINDOW ERROR:', e.message, e.filename, e.lineno);
    });
  });

  await page.goto('http://localhost:5173/projects/meridian', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.getElementById('preloader'), { timeout: 20000 }).catch(() => console.log('preloader stuck'));
  await new Promise((r) => setTimeout(r, 4000));

  const state = await page.evaluate(() => {
    const d = document.getElementById('project-details');
    return {
      path: location.pathname,
      docTitle: document.title,
      htmlClass: document.documentElement.className,
      details: d ? { display: getComputedStyle(d).display, children: d.childElementCount, ariaHidden: d.getAttribute('aria-hidden') } : null,
    };
  });
  console.log('STATE:', JSON.stringify(state));
  await browser.close();
};

run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
