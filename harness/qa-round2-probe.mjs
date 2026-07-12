// Round-2 bug probe: horizontal overflow source, wide-viewport overlaps,
// back-button hover state, links list styling — on /projects/northwind @1999px.
import { chromium } from 'playwright';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1999, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

  await page.goto('http://localhost:5173/projects/northwind', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.getElementById('preloader'), { timeout: 20000 }).catch(() => {});
  await sleep(3500);

  const report = await page.evaluate(() => {
    const iw = innerWidth;
    // widest offenders creating document overflow
    const offenders = [...document.querySelectorAll('body *')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.right > iw + 4 && r.width > 40)
      .sort((a, b) => b.r.right - a.r.right)
      .slice(0, 6)
      .map(({ el, r }) => `${el.tagName.toLowerCase()}#${el.id || ''}.${(el.className?.toString() || '').split(' ')[0]} right=${Math.round(r.right)} w=${Math.round(r.width)}`);
    const title = document.getElementById('project-details-title');
    const right = document.getElementById('project-details-right');
    const tr = title?.getBoundingClientRect();
    const rr = right?.getBoundingClientRect();
    const linkItems = [...document.querySelectorAll('#project-details-right a, #project-details-right li')].slice(0, 8)
      .map((a) => ({ t: (a.textContent || '').trim().slice(0, 16), display: getComputedStyle(a).display }));
    const overlap = tr && rr ? !(tr.right < rr.left || rr.right < tr.left || tr.bottom < rr.top || rr.bottom < tr.top) : null;
    return {
      slugOk: !!title,
      docOverflowX: document.scrollingElement.scrollWidth - iw,
      htmlOverflowX: getComputedStyle(document.documentElement).overflowX,
      bodyOverflowX: getComputedStyle(document.body).overflowX,
      offenders,
      titleRect: tr ? { l: Math.round(tr.left), r: Math.round(tr.right), b: Math.round(tr.bottom) } : null,
      rightColRect: rr ? { l: Math.round(rr.left), t: Math.round(rr.top) } : null,
      titleOverlapsRightCol: overlap,
      linkItems,
    };
  });
  console.log('PROBE:', JSON.stringify(report, null, 1));

  // back button hover
  const backBtn = page.locator('#header-center-project-back-btn');
  if (await backBtn.count()) {
    const before = await page.evaluate(() => {
      const b = document.getElementById('header-center-project-back-btn');
      const svg = b.querySelector('svg, [class*="arrow"]');
      return { svgOpacity: svg ? getComputedStyle(svg).opacity : null, svgTransform: svg ? getComputedStyle(svg).transform : null, btnBg: getComputedStyle(b).backgroundColor, inner: b.innerHTML.slice(0, 300) };
    });
    await backBtn.hover();
    await sleep(700);
    const after = await page.evaluate(() => {
      const b = document.getElementById('header-center-project-back-btn');
      const svg = b.querySelector('svg, [class*="arrow"]');
      const all = [...b.querySelectorAll('*')].map((el) => `${el.tagName.toLowerCase()}.${(el.className?.toString?.() || el.className?.baseVal || '').split(' ')[0]} op=${getComputedStyle(el).opacity} tx=${getComputedStyle(el).transform.slice(0, 40)}`);
      return { svgOpacity: svg ? getComputedStyle(svg).opacity : null, btnBg: getComputedStyle(b).backgroundColor, children: all.slice(0, 6) };
    });
    console.log('BACKBTN before:', JSON.stringify(before));
    console.log('BACKBTN hover:', JSON.stringify(after));
  } else {
    console.log('BACKBTN: not found');
  }

  await browser.close();
};

run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
