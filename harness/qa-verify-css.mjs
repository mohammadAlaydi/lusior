// Post-fix geometry verification: project-page header meta / back button /
// services column (incl. float-stacking risk) at 1440 and 1024, and the
// mobile header fit at 390.
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, 'qa-shots-verify');
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const projectProbe = () => ({
  vw: innerWidth,
  backBtn: (() => {
    const b = document.getElementById('header-center-project-back-btn');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), fullyVisible: r.left >= 0 && r.right <= innerWidth, w: Math.round(r.width) };
  })(),
  meta: (() => {
    const m = document.getElementById('project-details-header-info');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), visible: getComputedStyle(m).display !== 'none' };
  })(),
  soundBtnLeft: (() => {
    const s = document.getElementById('sound-btn');
    return s ? Math.round(s.getBoundingClientRect().left) : null;
  })(),
  columns: (() => {
    const left = document.getElementById('project-details-left');
    const right = document.getElementById('project-details-right');
    if (!left || !right) return null;
    const lr = left.getBoundingClientRect();
    const rr = right.getBoundingClientRect();
    return {
      leftTop: Math.round(lr.top), rightTop: Math.round(rr.top),
      sideBySide: Math.abs(lr.top - rr.top) < Math.min(lr.height, 200),
      rightWidth: Math.round(rr.width),
    };
  })(),
});

const run = async () => {
  const browser = await chromium.launch({ headless: true });

  for (const vw of [1440, 1024]) {
    const page = await browser.newPage({ viewport: { width: vw, height: 900 }, deviceScaleFactor: 1 });
    await page.goto('http://localhost:5173/projects/meridian', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.getElementById('preloader'), { timeout: 20000 }).catch(() => {});
    await sleep(2500);
    console.log(`PROJECT@${vw}:`, JSON.stringify(await page.evaluate(projectProbe)));
    await page.screenshot({ path: join(SHOTS, `project-${vw}.png`) });
    await page.close();
  }

  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.getElementById('preloader'), { timeout: 20000 }).catch(() => {});
    await sleep(1500);
    const header = await page.evaluate(() => {
      const ids = ['logo', 'sound-btn', 'talk-btn', 'menu-btn'];
      const out = {};
      for (const id of ids) {
        const el = document.getElementById(id) || document.querySelector(`[id*="${id}"], .${id}`);
        if (!el) { out[id] = null; continue; }
        const r = el.getBoundingClientRect();
        out[id] = { left: Math.round(r.left), right: Math.round(r.right), visible: r.right <= innerWidth && r.left >= 0 };
      }
      const s = out['sound-btn'], t = out['talk-btn'], m = out['menu-btn'];
      out.overlapSoundTalk = s && t ? s.right > t.left : null;
      out.menuClipped = m ? m.right > innerWidth : null;
      return out;
    });
    console.log('MOBILE-HEADER@390:', JSON.stringify(header));
    await page.screenshot({ path: join(SHOTS, 'mobile-header-390.png') });
    await page.close();
  }

  await browser.close();
};

run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
