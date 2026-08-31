import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// These are browser/runtime messages from optional media/WebAssembly features,
// not application exceptions. Keep this list narrow; every other console error
// or pageerror fails the test so regressions remain visible.
const ALLOWED_BROWSER_NOISE = [
  /Rapier/i,
  /The play\(\) request was interrupted/i,
  /media.*not supported/i,
];

const browserFailures = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const unexpected: string[] = [];
  browserFailures.set(page, unexpected);
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !ALLOWED_BROWSER_NOISE.some((pattern) => pattern.test(message.text()))
    ) {
      unexpected.push(`console.error: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    if (!ALLOWED_BROWSER_NOISE.some((pattern) => pattern.test(error.message))) {
      unexpected.push(`pageerror: ${error.message}`);
    }
  });
});

test.afterEach(async ({ page }) => {
  expect(browserFailures.get(page) ?? [], 'Unexpected browser errors').toEqual([]);
});

test('boots the production home page without runtime errors', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#header')).toBeVisible();
  await expect(page.locator('#featured-grid .project-item').first()).toBeVisible();
  await expect(page).toHaveTitle(/Reevez/i);
  await expect(page.locator('body')).toContainText(/Reevez/i);
  expect(await page.content()).not.toMatch(/LUSION|example\.com/i);
});

test('home page has no automated WCAG A/AA violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = results.violations
    .map((violation) => `${violation.id}: ${violation.nodes.length} node(s) — ${violation.help}`)
    .join('\n');
  expect(results.violations, summary).toEqual([]);
});

test('featured project navigation supports direct links and browser back', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('#featured-grid .project-item').first();
  const href = await card.getAttribute('href');
  expect(href).toMatch(/^\/projects\/[a-z0-9-]+$/);

  await card.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.locator('#project-details')).toHaveAttribute('aria-hidden', 'false');

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#project-details')).toHaveAttribute('aria-hidden', 'true');

  await page.goto(href!);
  await expect(page.locator('#project-details')).toHaveAttribute('aria-hidden', 'false');
});

test('featured cards play captured product footage on desktop hover', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Touch cards keep their still fallback.');
  await page.goto('/');

  const card = page.locator('#featured-grid .project-item').first();
  await card.scrollIntoViewIfNeeded();
  const preview = card.locator('video.project-item-video');
  await expect(preview).toHaveAttribute('src', /\/media\/magic-stamp\/loop\.mp4$/);

  await card.hover();
  await expect(card).toHaveClass(/is-video-active/);
  await expect.poll(() => preview.evaluate((video: HTMLVideoElement) => video.paused)).toBe(false);

  await page.mouse.move(0, 0);
  await expect.poll(() => preview.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
  await expect(card).not.toHaveClass(/is-video-active/);
});

test('menu and showreel dialog trap focus and close on Escape', async ({ page }) => {
  await page.goto('/');
  const menu = page.locator('#menu-btn');
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused();

  const watch = page.locator('#reel-watch');
  await watch.scrollIntoViewIfNeeded();
  await watch.click();
  const dialog = page.locator('#video-overlay');
  await expect(dialog).toHaveAttribute('aria-hidden', 'false');
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveAttribute('aria-hidden', 'true');
  await expect(watch).toBeFocused();
});

test('newsletter validation and submission work through the production API', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  if (!isMobile) await page.locator('#menu-btn').click();

  const form = page.locator(isMobile ? '#footer-newsletter-form' : '#header-menu-newsletter-input');
  const field = page.locator(
    isMobile ? '#footer-newsletter-input-field' : '#header-menu-newsletter-input-field',
  );
  const feedback = page.locator(
    isMobile ? '#footer-newsletter-feedback-message' : '#header-menu-newsletter-msg',
  );
  if (isMobile) await form.scrollIntoViewIfNeeded();

  await field.fill('not-an-email');
  await form.evaluate((element) => (element as HTMLFormElement).requestSubmit());
  await expect(feedback).toContainText(/valid email/i);

  await field.fill(`playwright-${Date.now()}@example.test`);
  await form.evaluate((element) => (element as HTMLFormElement).requestSubmit());
  await expect(feedback).toContainText(/thanks/i);
  await expect(field).toHaveValue('');
  await expect(field).toBeEnabled();
});

test('reduced motion still boots and exposes all primary navigation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#header')).toBeVisible();
  await expect(page.locator('#featured-grid .project-item').first()).toBeVisible();
  await page.locator('#menu-btn').click();
  await expect(page.locator('#header-menu')).toHaveClass(/--opened/);
});

test('mobile viewport renders a usable navigation and project entry', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'This assertion runs in the dedicated mobile project only.');
  await page.goto('/');
  await expect(page.locator('#menu-btn')).toBeVisible();
  await expect(page.locator('#featured-grid .project-item').first()).toBeVisible();
  await page.locator('#menu-btn').click();
  await expect(page.locator('#header-menu')).toHaveAttribute('aria-hidden', 'false');
});

test('touch cards keep the still without fetching hover footage', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'This verifies the touch-only media budget.');
  const previewRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/media/magic-stamp/loop.mp4') {
      previewRequests.push(request.url());
    }
  });
  await page.goto('/');

  const card = page.locator('#featured-grid .project-item').first();
  await card.scrollIntoViewIfNeeded();
  await card.evaluate((element) => {
    element.dispatchEvent(
      new PointerEvent('pointerenter', { bubbles: true, pointerType: 'touch' }),
    );
    (element as HTMLElement).focus();
  });
  await page.waitForTimeout(500);

  const preview = card.locator('video.project-item-video');
  await expect.poll(() => preview.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
  expect(previewRequests).toEqual([]);
  await expect(card).not.toHaveClass(/is-video-active/);
});

test('mobile galleries preserve full portrait emulator captures', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'This verifies the portrait treatment in the mobile gallery.');
  await page.goto('/projects/mawared');
  await expect(page.locator('#project-details-title')).toBeVisible();

  const projectScroller = page.locator('#project-details');
  await page.mouse.move(200, 500);
  await page.mouse.wheel(0, 700);
  await expect
    .poll(() => projectScroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);

  const capture = page.locator('.project-details-item[data-fit="contain"]').first();
  await capture.scrollIntoViewIfNeeded();
  await expect(capture).toBeVisible();
  const image = capture.locator('img');
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBeGreaterThan(0);
  const layout = await image.evaluate((element: HTMLImageElement) => ({
    renderedRatio: element.clientWidth / element.clientHeight,
    naturalRatio: element.naturalWidth / element.naturalHeight,
    objectFit: getComputedStyle(element).objectFit,
  }));

  expect(layout.objectFit).toBe('contain');
  expect(Math.abs(layout.renderedRatio - layout.naturalRatio)).toBeLessThan(0.01);
  await expect(projectScroller).toHaveCSS('overflow-y', 'auto');
  await expect(page.locator('#project-details-items-wrapper')).toHaveCSS('position', 'relative');

  const mawaredUrl = 'https://mawared.sa/';
  await page.route('https://mawared.sa/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Mawared</title>' }),
  );
  const mobileCta = page.locator('.project-details-launches--mobile .project-details-launch-cta');
  await mobileCta.scrollIntoViewIfNeeded();
  await expect(mobileCta).toBeVisible();
  await mobileCta.click();
  await expect(page).toHaveURL(mawaredUrl);
});

test('tablet project layout keeps header controls clear and app media uncropped', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'The desktop Chromium project owns the explicit tablet viewport.');
  await page.setViewportSize({ width: 899, height: 1351 });
  await page.goto('/projects/paligram');

  const back = page.locator('#header-center-project-back-btn');
  const logo = page.locator('#logo');
  const actions = page.locator('#header-right');
  for (const width of [899, 1025, 1200]) {
    await page.setViewportSize({ width, height: 1351 });
    await expect(back).toBeVisible();
    await expect(page.locator('#project-details-header-info')).toBeHidden();

    const geometry = await Promise.all([
      back.boundingBox(),
      logo.boundingBox(),
      actions.boundingBox(),
    ]);
    expect(geometry.every(Boolean)).toBe(true);
    const [backBox, logoBox, actionsBox] = geometry;
    expect(backBox!.x).toBeGreaterThanOrEqual(logoBox!.x + logoBox!.width);
    expect(backBox!.x + backBox!.width).toBeLessThanOrEqual(actionsBox!.x);
  }

  await page.setViewportSize({ width: 899, height: 1351 });
  const wrapper = page.locator('#project-details-items-wrapper');
  const rail = page.locator('#project-details-items-move-container');
  await expect(wrapper).toHaveCSS('position', 'absolute');
  const firstImage = page.locator('img[src="/media/paligram/thumb.jpg"]');
  await expect(firstImage).toHaveCSS('object-fit', 'contain');

  await page.waitForTimeout(600);
  const railStartX = await rail.evaluate((element) => element.getBoundingClientRect().x);
  await page.mouse.move(700, 700);
  await page.mouse.wheel(0, 700);
  await expect
    .poll(() => rail.evaluate((element) => element.getBoundingClientRect().x))
    .toBeLessThan(railStartX - 20);

  const launchLinks = page.locator(
    '.project-details-launches--desktop .project-details-launch-cta',
  );
  await expect(launchLinks).toHaveCount(2);
  await expect(launchLinks.first()).toBeVisible();
  await expect(launchLinks.nth(0)).toHaveAttribute(
    'href',
    'https://play.google.com/store/apps/details?id=com.messaging.enigma',
  );
  await expect(launchLinks.nth(1)).toHaveAttribute(
    'href',
    'https://apps.apple.com/us/app/paligram/id6702027385',
  );

  const googlePlayUrl = 'https://play.google.com/store/apps/details?id=com.messaging.enigma';
  await page.route(googlePlayUrl, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Google Play</title>' }),
  );
  await launchLinks.first().click();
  await expect(page).toHaveURL(googlePlayUrl);
});

test('every project renders its direct website or official store destinations', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'The desktop Chromium project owns the explicit tablet viewport.');
  await page.setViewportSize({ width: 899, height: 1000 });

  const destinations = [
    {
      slug: 'magic-stamp',
      urls: [
        'https://magicstamp.com',
        'https://play.google.com/store/apps/details?id=com.parktechnology.purse',
        'https://apps.apple.com/us/app/magic-stamp/id1419555996',
      ],
    },
    { slug: 'rahmet-ihsan', urls: ['https://rahmetihsan.com'] },
    {
      slug: 'envaglo',
      urls: ['https://stage.envaglo.com/login', 'https://stage.envaglo.com/s/vipco/ar'],
    },
    { slug: 'mawared', urls: ['https://mawared.sa'] },
    {
      slug: 'mywill',
      urls: [
        'https://play.google.com/store/apps/details?id=com.bashsquare.my_will',
        'https://apps.apple.com/us/app/mywill-digital-legacy/id6771635405',
      ],
    },
    {
      slug: 'paligram',
      urls: [
        'https://play.google.com/store/apps/details?id=com.messaging.enigma',
        'https://apps.apple.com/us/app/paligram/id6702027385',
      ],
    },
    { slug: 'reevez', urls: ['https://reevez.com'] },
  ];

  for (const project of destinations) {
    await page.goto(`/projects/${project.slug}`);
    const links = page.locator('.project-details-launches--desktop .project-details-launch-cta');
    await expect(links).toHaveCount(project.urls.length);
    await expect(links.first()).toBeVisible();
    for (const [index, url] of project.urls.entries()) {
      await expect(links.nth(index)).toHaveAttribute('href', url);
      expect(await links.nth(index).getAttribute('target')).toBeNull();
      expect(await links.nth(index).getAttribute('rel')).toBeNull();
    }
  }
});

test('project-to-project navigation restores home interactivity', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The next-project teaser is a direct control in the mobile layout.');
  await page.goto('/projects/magic-stamp');

  const nextProject = page.locator('#project-details-preview');
  await nextProject.scrollIntoViewIfNeeded();
  await nextProject.click();
  await expect(page).not.toHaveURL(/\/projects\/magic-stamp$/);
  await expect(page.locator('#project-details')).toHaveAttribute('aria-hidden', 'false');

  await page.locator('#header-center-project-back-btn').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#project-details')).toHaveAttribute('aria-hidden', 'true');
  await expect
    .poll(() => page.locator('#ui > main').evaluate((element) => (element as HTMLElement).inert))
    .toBe(false);

  await page.locator('#menu-btn').click();
  await expect(page.locator('#header-menu')).toHaveAttribute('aria-hidden', 'false');
});

test('mobile defers the inline reel download until the reel enters the viewport', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'This verifies the mobile loading budget.');
  const reelRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/reel/desktop.mp4') reelRequests.push(request.url());
  });

  await page.goto('/');
  await expect(page.locator('#header')).toBeVisible();
  // Let eager bootstrap work settle. The inline video must still have no source
  // request while its section is below the initial mobile viewport.
  await page.waitForLoadState('networkidle');
  expect(reelRequests).toEqual([]);

  await page.locator('#reel-container').scrollIntoViewIfNeeded();
  await expect.poll(() => reelRequests.length, { timeout: 5_000 }).toBeGreaterThan(0);
});

test('mobile initializes the end confetti canvas only as its section approaches the viewport', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'This verifies the mobile canvas startup budget.');
  await page.goto('/');

  const canvas = page.locator('#end-confetti');
  // A canvas without an assigned bitmap keeps the platform default 300 × 150
  // backing store. This proves expensive DPR allocation has not happened at boot.
  await expect(canvas).toHaveJSProperty('width', 300);
  await expect(canvas).toHaveJSProperty('height', 150);

  await canvas.scrollIntoViewIfNeeded();
  await expect
    .poll(
      () =>
        canvas.evaluate((element) => {
          const target = element as HTMLCanvasElement;
          return target.width > 300 || target.height > 150;
        }),
      { timeout: 5_000 },
    )
    .toBe(true);
});

test('the inline reel exposes a visible pause and resume control in view', async ({ page }) => {
  await page.goto('/');
  const reel = page.locator('#reel-container');
  await reel.scrollIntoViewIfNeeded();

  const control = page.locator('#reel-pause');
  const video = page.locator('#reel-video');
  await expect(control).toBeVisible();
  await expect
    .poll(() => video.evaluate((element) => !(element as HTMLVideoElement).paused))
    .toBe(true);

  await control.click();
  await expect(control).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).paused))
    .toBe(true);

  await control.click();
  await expect(control).toHaveAttribute('aria-pressed', 'false');
  await expect
    .poll(() => video.evaluate((element) => !(element as HTMLVideoElement).paused))
    .toBe(true);
});

test('reduced motion leaves the inline reel paused until explicit play', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('#reel-container').scrollIntoViewIfNeeded();

  const control = page.locator('#reel-pause');
  const video = page.locator('#reel-video');
  await expect(control).toBeVisible();
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).paused))
    .toBe(true);

  await control.click();
  await expect
    .poll(() => video.evaluate((element) => !(element as HTMLVideoElement).paused))
    .toBe(true);
});

test('keyboard focus remains visibly perceivable for the closing CTA and newsletter form', async ({
  page,
}) => {
  await page.goto('/');

  for (const selector of [
    '#end-title',
    '#footer-newsletter-input-field',
    '#footer-newsletter-input-arrow',
  ]) {
    const target = page.locator(selector);
    await target.scrollIntoViewIfNeeded();
    // Keyboard interaction establishes the browser's focus-visible modality;
    // focus() then makes the assertion independent of unrelated tab order.
    await page.keyboard.press('Tab');
    await target.focus();
    await expect(target).toBeFocused();
    await expect
      .poll(() =>
        target.evaluate((element) => {
          const style = window.getComputedStyle(element);
          return style.outlineStyle !== 'none' && style.outlineWidth !== '0px'
            ? 'outline'
            : style.boxShadow !== 'none'
              ? 'shadow'
              : '';
        }),
      )
      .not.toBe('');
  }
});
