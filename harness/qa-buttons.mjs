// Probe: LET'S TALK click, sound toggle, footer Experiments link, menu link clicks.
import { chromium } from 'playwright';

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console.error: ${m.text().slice(0, 160)}`));

  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.getElementById('preloader'), { timeout: 20000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));

  // LET'S TALK
  const talk = await page.evaluate(() => {
    const el = [...document.querySelectorAll('a,button')].find((b) => /let.s talk/i.test(b.textContent || ''));
    return el ? { tag: el.tagName, href: el.getAttribute('href'), id: el.id, cls: el.className } : null;
  });
  console.log('TALK:', JSON.stringify(talk));

  // Sound toggle
  const sound = await page.evaluate(() => {
    const el = document.querySelector('[id*="sound"], [class*="sound"], [aria-label*="ound"]');
    return el ? { tag: el.tagName, id: el.id, cls: el.className, aria: el.getAttribute('aria-label'), pressed: el.getAttribute('aria-pressed') } : null;
  });
  console.log('SOUND:', JSON.stringify(sound));
  if (sound && sound.id) {
    await page.click('#' + sound.id, { force: true }).catch((e) => console.log('sound click failed:', e.message.split('\n')[0]));
    await new Promise((r) => setTimeout(r, 700));
    console.log('SOUND-AFTER:', JSON.stringify(await page.evaluate((id) => {
      const el = document.getElementById(id);
      return { pressed: el?.getAttribute('aria-pressed'), cls: el?.className, htmlClass: document.documentElement.className };
    }, sound.id)));
  }

  // Footer links
  const footerLinks = await page.evaluate(() =>
    [...document.querySelectorAll('footer a')].map((a) => ({ t: (a.textContent || '').trim().slice(0, 24), href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') })),
  );
  console.log('FOOTER-LINKS:', JSON.stringify(footerLinks));

  // Menu links: open menu, click "PROJECTS", observe
  await page.locator('text=MENU').first().click({ force: true });
  await new Promise((r) => setTimeout(r, 900));
  const menuLinks = await page.evaluate(() =>
    [...document.querySelectorAll('a')].filter((a) => /home|about|projects|contact/i.test(a.textContent || '')).map((a) => ({ t: (a.textContent || '').trim(), href: a.getAttribute('href'), cls: a.className })),
  );
  console.log('MENU-LINKS:', JSON.stringify(menuLinks));
  const beforeY = await page.evaluate(() => Math.round(window.scrollY));
  await page.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find((x) => /projects/i.test(x.textContent || ''));
    a?.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
  console.log('AFTER-PROJECTS-CLICK:', JSON.stringify(await page.evaluate(() => ({
    url: location.pathname + location.hash,
    scrollY: Math.round(window.scrollY),
    menuStillOpen: (() => { const m = document.querySelector('[class*="menu"][class*="open"], .is-menu-open'); return !!m; })(),
    htmlClass: document.documentElement.className,
  }))), 'beforeY=' + beforeY);

  console.log('PROBLEMS:', JSON.stringify(problems.slice(0, 10)));
  await browser.close();
};

run().catch((e) => { console.error('FAILED:', e); process.exit(1); });
