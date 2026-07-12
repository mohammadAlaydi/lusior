// Responsive audit of the project-detail page: does the gallery band overlap
// the meta (title/desc), and is the back button on-screen and clear of text?
// Screenshots + box geometry across a width sweep.
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, 'qa-shots-responsive');
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rectsOverlap = (a, b) =>
  a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const probe = () => {
  const box = (sel) => {
    const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      left: Math.round(r.left), right: Math.round(r.right),
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      w: Math.round(r.width), h: Math.round(r.height),
      pos: cs.position, display: cs.display, vis: cs.visibility,
    };
  };
  const overlap = (a, b) =>
    a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

  const title = box('#project-details-title');
  const desc = box('#project-details-desc');
  const wrapper = box('#project-details-items-wrapper');
  const firstItem = box('.project-details-item');
  const meta = box('#project-details-meta');
  const backBtn = box('#header-center-project-back-btn');

  return {
    vw: innerWidth, vh: innerHeight,
    scrollH: document.getElementById('project-details')?.scrollHeight,
    clientH: document.getElementById('project-details')?.clientHeight,
    title, desc, wrapper, firstItem, meta, backBtn,
    titleOverGallery: overlap(title, firstItem),
    descOverGallery: overlap(desc, firstItem),
    metaOverGallery: overlap(meta, wrapper),
    backOverMeta: overlap(backBtn, meta),
    backOverTitle: overlap(backBtn, title),
    backOnScreen: backBtn ? backBtn.left >= 0 && backBtn.right <= innerWidth : null,
    docOverflowX: document.documentElement.scrollWidth > innerWidth + 1,
    docScrollW: document.documentElement.scrollWidth,
  };
};

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  for (const vw of [375, 480, 640, 768, 812, 900, 1024, 1200]) {
    const isMob = vw <= 812;
    const page = await browser.newPage({
      viewport: { width: vw, height: 812 },
      deviceScaleFactor: 1, isMobile: isMob, hasTouch: isMob,
    });
    await page.goto('http://localhost:5173/projects/northwind', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.getElementById('preloader'), { timeout: 20000 }).catch(() => {});
    await sleep(4000);
    const state = await page.evaluate(probe);
    console.log(`@${vw}:`, JSON.stringify(state));
    await page.screenshot({ path: join(SHOTS, `northwind-${vw}.png`), fullPage: false });
    if (vw === 375 || vw === 812) {
      // Expand the fixed layer to its scroll height and shoot only that element
      // (fullPage would also reveal the home page sitting behind the overlay).
      await page.evaluate(() => {
        const pd = document.getElementById('project-details');
        if (pd) pd.style.height = pd.scrollHeight + 'px';
      });
      await sleep(300);
      await page.locator('#project-details').screenshot({ path: join(SHOTS, `northwind-${vw}-full.png`) });
    }
    await page.close();
  }
  await browser.close();
};

run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
