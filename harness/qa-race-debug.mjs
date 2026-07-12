// Click-then-switch race debug: tap history writes + API calls, real tile clicks.
import { chromium } from 'playwright';

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('[TAP]') || m.type() === 'error') console.log(t.slice(0, 220));
  });
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
  page.on('response', (r) => {
    if (r.url().includes('/api/')) console.log(`[api] ${r.status()} ${r.url().split('5173')[1]}`);
  });
  await page.addInitScript(() => {
    const wrap = (name) => {
      const orig = history[name].bind(history);
      history[name] = (...args) => {
        console.log(`[TAP] history.${name} -> ${args[2]}`);
        return orig(...args);
      };
    };
    wrap('pushState');
    wrap('replaceState');
    window.addEventListener('unhandledrejection', (e) => {
      console.log('[TAP] UNHANDLED REJECTION: ' + (e.reason && (e.reason.message || String(e.reason))));
    });
  });

  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.getElementById('preloader'), { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1500));

  console.log('--- click aurora, then meridian 120ms later (real tiles) ---');
  await page.evaluate(() => {
    document.querySelector('#featured a[href="/projects/aurora-bloom"]').click();
    setTimeout(() => {
      const el = document.querySelector('#featured a[href="/projects/meridian"]');
      console.log('[TAP] second click, meridian tile found: ' + !!el);
      el?.click();
    }, 120);
  });
  await new Promise((r) => setTimeout(r, 6000));
  console.log('STATE:', JSON.stringify(await page.evaluate(() => ({
    path: location.pathname,
    title: document.getElementById('project-details-title')?.textContent?.trim() ?? null,
    docTitle: document.title,
  }))));
  await browser.close();
};

run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
