// Router race tests: double-click a tile, and click-then-immediately-navigate-home.
// Verifies dedupe works against the in-flight target (not stale committed state).
import { chromium } from 'playwright';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const boot = async (browser) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console.error: ${m.text().slice(0, 160)}`));
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.getElementById('preloader'), { timeout: 20000 }).catch(() => {});
  await sleep(1200);
  return { page, problems };
};

const state = (page) => page.evaluate(() => ({
  url: location.pathname,
  active: document.documentElement.classList.contains('is-project-details-active'),
  title: document.getElementById('project-details-title')?.textContent?.trim() ?? null,
}));

const run = async () => {
  const browser = await chromium.launch({ headless: true });

  // ---- Race 1: rapid double-click same tile ----
  {
    const { page, problems } = await boot(browser);
    await page.evaluate(() => {
      const a = document.querySelector('#featured a[href="/projects/aurora-bloom"]');
      a.click();
      a.click(); // immediate second click, same target
    });
    await sleep(3500);
    console.log('DOUBLE-CLICK:', JSON.stringify(await state(page)), 'problems:', JSON.stringify(problems));
    await page.close();
  }

  // ---- Race 2: click project, then home before commit ----
  {
    const { page, problems } = await boot(browser);
    await page.evaluate(() => {
      document.querySelector('#featured a[href="/projects/aurora-bloom"]').click();
    });
    await sleep(120); // mid-transition
    await page.evaluate(() => {
      // Simulate a home navigation racing the in-flight project nav (menu
      // Home / logo click path routes through router.navigate('/')).
      window.history.back ? null : null;
      const ev = new PopStateEvent('popstate');
      // Direct popstate without history change is unreliable — use pushState
      // round-trip: the router's navigate is not exposed, so drive an anchor.
      const a = document.createElement('a');
      a.href = '/projects/meridian';
      document.body.appendChild(a);
      a.click(); // second, DIFFERENT in-flight target before first commits
    });
    await sleep(4500);
    const s = await state(page);
    console.log('CLICK-THEN-SWITCH:', JSON.stringify(s), 'problems:', JSON.stringify(problems));
    // expected: ends on meridian (last click wins), no dropped/ignored nav
    await page.close();
  }

  // ---- Race 3: click project then browser Back immediately ----
  {
    const { page, problems } = await boot(browser);
    await page.evaluate(() => {
      document.querySelector('#featured a[href="/projects/aurora-bloom"]').click();
    });
    await sleep(150);
    await page.goBack().catch(() => {});
    await sleep(4000);
    console.log('CLICK-THEN-BACK:', JSON.stringify(await state(page)), 'problems:', JSON.stringify(problems));
    await page.close();
  }

  await browser.close();
};

run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
