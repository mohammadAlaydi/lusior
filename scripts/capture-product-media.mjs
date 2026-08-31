/* global document, performance, requestAnimationFrame, window */

import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const outputRoot = path.resolve('.tmp', 'captures');
const requestedSlugs = new Set(process.argv.slice(2));

// This script covers browser products only. Mawared and MyWill are captured
// from their native Android builds with adb screenrecord/screencap so their
// published media shows the real application rather than a web substitute.
const projects = [
  {
    slug: 'magic-stamp',
    stills: [{ name: 'home', url: 'https://magicstamp.com' }],
    video: {
      url: 'https://magicstamp.com',
      actions: async (page) => {
        await scrollTo(page, 0.42, 2_300);
        await scrollTo(page, 0.76, 2_300);
        await scrollTo(page, 0.18, 2_100);
      },
    },
  },
  {
    slug: 'rahmet-ihsan',
    stills: [
      { name: 'home', url: 'https://rahmetihsan.com/ar' },
      { name: 'projects', url: 'https://rahmetihsan.com/ar/projects' },
    ],
    video: {
      url: 'https://rahmetihsan.com/ar',
      actions: async (page) => {
        await scrollTo(page, 0.24, 2_200);
        await scrollTo(page, 0.48, 2_200);
        await scrollTo(page, 0.7, 2_200);
      },
    },
  },
  {
    slug: 'envaglo',
    stills: [
      { name: 'sandbox', url: 'https://app.envaglo.com/try', dismissText: 'رفض الاختيارية' },
      { name: 'marketing', url: 'https://envaglo.com', dismissText: 'رفض الاختيارية' },
    ],
    video: {
      url: 'https://app.envaglo.com/try',
      dismissText: 'رفض الاختيارية',
      actions: async (page) => {
        await scrollTo(page, 0.3, 2_200);
        await scrollTo(page, 0.62, 2_200);
        await scrollTo(page, 0.9, 2_000);
      },
    },
  },
  {
    slug: 'reevez',
    stills: [
      {
        name: 'overview',
        url: 'http://127.0.0.1:3002/dashboard-demo',
        waitFor: '[data-dashboard-demo-hydrated="true"]',
      },
      {
        name: 'revenue',
        url: 'http://127.0.0.1:3002/dashboard-demo/revenue',
        waitFor: '[data-dashboard-demo-hydrated="true"]',
      },
      {
        name: 'cash-flow',
        url: 'http://127.0.0.1:3002/dashboard-demo/cash-flow',
        waitFor: '[data-dashboard-demo-hydrated="true"]',
      },
      {
        name: 'sales-pipeline',
        url: 'http://127.0.0.1:3002/dashboard-demo/sales-pipeline',
        waitFor: '[data-dashboard-demo-hydrated="true"]',
      },
    ],
    video: {
      url: 'http://127.0.0.1:3002/dashboard-demo',
      waitFor: '[data-dashboard-demo-hydrated="true"]',
      actions: async (page) => {
        for (const route of ['revenue', 'cash-flow', 'sales-pipeline']) {
          await page.waitForTimeout(1_900);
          await page.goto(`http://127.0.0.1:3002/dashboard-demo/${route}`, {
            waitUntil: 'domcontentloaded',
          });
          await page.waitForSelector('[data-dashboard-demo-hydrated="true"]', {
            timeout: 30_000,
          });
        }
        await page.waitForTimeout(1_700);
      },
    },
  },
];

const selectedProjects = requestedSlugs.size
  ? projects.filter(({ slug }) => requestedSlugs.has(slug))
  : projects;

if (selectedProjects.length === 0) {
  throw new Error(
    `No known project slug supplied. Known slugs: ${projects.map(({ slug }) => slug).join(', ')}`,
  );
}

const browser = await chromium.launch({
  headless: true,
  args: ['--force-color-profile=srgb'],
});

try {
  for (const project of selectedProjects) {
    const projectDir = path.join(outputRoot, project.slug);
    await mkdir(projectDir, { recursive: true });

    for (const still of project.stills) {
      const context = await browser.newContext({
        viewport: { width: 1200, height: 780 },
        deviceScaleFactor: 2,
        colorScheme: 'light',
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      await loadCapturePage(page, still);
      await page.screenshot({
        path: path.join(projectDir, `still-${still.name}.png`),
        type: 'png',
      });
      await context.close();
      process.stdout.write(`captured ${project.slug}/still-${still.name}.png\n`);
    }

    if (!project.video) continue;

    const videoDir = path.join(projectDir, '.video');
    await rm(videoDir, { recursive: true, force: true });
    await mkdir(videoDir, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      colorScheme: 'light',
      reducedMotion: 'no-preference',
      recordVideo: { dir: videoDir, size: { width: 1920, height: 1080 } },
    });
    const page = await context.newPage();
    await loadCapturePage(page, project.video);
    await page.waitForTimeout(1_200);
    await project.video.actions(page);
    const video = page.video();
    await context.close();
    if (!video) throw new Error(`Playwright did not create a video for ${project.slug}`);
    await copyFile(await video.path(), path.join(projectDir, 'loop-source.webm'));
    await rm(videoDir, { recursive: true, force: true });
    process.stdout.write(`captured ${project.slug}/loop-source.webm\n`);
  }
} finally {
  await browser.close();
}

async function loadCapturePage(page, shot) {
  await page.goto(shot.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
  if (shot.waitFor) await page.waitForSelector(shot.waitFor, { timeout: 30_000 });
  if (shot.dismissText) {
    await page
      .getByRole('button', { name: shot.dismissText, exact: true })
      .first()
      .click({ timeout: 4_000 })
      .catch(() => undefined);
  }
  await page.addStyleTag({
    content: `
      html { scrollbar-width: none !important; }
      html::-webkit-scrollbar, body::-webkit-scrollbar { display: none !important; }
      * { caret-color: transparent !important; }
    `,
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1_800);
}

async function scrollTo(page, progress, durationMs) {
  await page.evaluate(
    ({ nextProgress, duration }) =>
      new Promise((resolve) => {
        const start = window.scrollY;
        const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const destination = max * nextProgress;
        const startedAt = performance.now();
        const tick = (now) => {
          const elapsed = Math.min(1, (now - startedAt) / duration);
          const eased = 1 - Math.pow(1 - elapsed, 3);
          window.scrollTo(0, start + (destination - start) * eased);
          if (elapsed < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      }),
    { nextProgress: progress, duration: durationMs },
  );
  await page.waitForTimeout(450);
}
