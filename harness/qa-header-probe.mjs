// Measure the project-page header cluster on mobile so the back button can be
// placed clear of the logo (left) and the sound/talk/menu cluster (right).
import { chromium } from 'playwright';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probe = () => {
  const box = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) };
  };
  return {
    vw: innerWidth,
    logo: box('logo'),
    back: box('header-center-project-back-btn'),
    sound: box('sound-btn'),
    talk: box('talk-btn'),
    menu: box('menu-btn'),
    right: box('header-right'),
  };
};

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  for (const vw of [375, 480, 640, 768, 812]) {
    const page = await browser.newPage({ viewport: { width: vw, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto('http://localhost:5173/projects/northwind', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.getElementById('preloader'), { timeout: 20000 }).catch(() => {});
    await sleep(3500);
    console.log(`@${vw}:`, JSON.stringify(await page.evaluate(probe)));
    await page.close();
  }
  await browser.close();
};
run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
