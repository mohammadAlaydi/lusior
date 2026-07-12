// Quick probe: stacking order of header vs tunnel canvas + hit-testing at the
// LET'S TALK pill while the tunnel zone is active.
import { chromium } from 'playwright';

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.getElementById('preloader'), { timeout: 20000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));

  const goal = await page.evaluate(() => {
    const g = document.getElementById('goal').getBoundingClientRect();
    return { top: g.top + window.scrollY, height: g.height };
  });
  await page.evaluate((y) => window.__lenis?.scrollTo(y, { immediate: true }), goal.top + goal.height * 0.65 - 900);
  await new Promise((r) => setTimeout(r, 800));

  const report = await page.evaluate(() => {
    const zOf = (el) => {
      let cur = el;
      const chain = [];
      while (cur && cur !== document.body) {
        const cs = getComputedStyle(cur);
        chain.push(`${cur.tagName.toLowerCase()}#${cur.id || ''}.${(cur.className && cur.className.toString().split(' ')[0]) || ''} z=${cs.zIndex} pos=${cs.position}`);
        cur = cur.parentElement;
      }
      return chain;
    };
    const header = document.querySelector('header');
    const tunnelCanvas = document.querySelector('#tunnel-inner canvas');
    const pill = [...document.querySelectorAll('a,button')].find((b) => /let.s talk/i.test(b.textContent || ''));
    const pr = pill ? pill.getBoundingClientRect() : null;
    const atPill = pr ? document.elementFromPoint(pr.left + pr.width / 2, pr.top + pr.height / 2) : null;
    return {
      headerChain: header ? zOf(header).slice(-3) : null,
      canvasChain: tunnelCanvas ? zOf(tunnelCanvas) : null,
      pillFound: !!pill,
      elementAtPillCenter: atPill ? `${atPill.tagName.toLowerCase()}#${atPill.id || ''}.${(atPill.className && atPill.className.toString().split(' ')[0]) || ''}` : null,
    };
  });
  console.log(JSON.stringify(report, null, 1));
  await browser.close();
};

run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
