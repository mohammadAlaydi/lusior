import gsap from 'gsap';
import type { ProjectDetail, MediaItem, SideListGroup } from '../../shared/projects';
import { findProject } from '../../shared/projects';
import { splitWords } from './splitWords';

/**
 * The per-project themed detail layer (`#project-details`). The orchestrator
 * mounts the empty `#project-details` element and the header back-button; this
 * module owns everything inside the layer: theme injection, the data-driven
 * DOM build, the open/close choreography, the horizontal media gallery scroll
 * and the "next project" advance.
 *
 * It is intentionally self-contained — the router drives it via `open`/`close`
 * and reacts to `onRequestProject` / `onRequestClose`. All motion is
 * transform/opacity only, with a `prefers-reduced-motion` fast path that snaps
 * to the final state and uses native scrolling.
 */

import type { SoundEngine } from '../audio/soundEngine';

export interface ProjectDetailController {
  open(detail: ProjectDetail, opts?: { immediate?: boolean }): Promise<void>;
  close(opts?: { immediate?: boolean }): Promise<void>;
  isOpen(): boolean;
}

export interface ProjectDetailDeps {
  sound?: SoundEngine;
  /** Next-project advance asks the router to navigate to the next slug. */
  onRequestProject: (slug: string) => void;
  /** Back button / Esc asks the router to go home. */
  onRequestClose: () => void;
}

/** Breakpoint (px) at or below which we stop hijacking scroll (CSS `812px`). */
const MOBILE_MAX = 812;
/** Forward over-scroll (px) past `maxScroll` that fills `nextProjectRatio`.
 * Deliberately long: on the reference the "Next" bar fills over a sustained
 * pull, not a single wheel notch. A short distance reads as the page jumping
 * straight to the next project the instant you reach the gallery's end. */
const NEXT_ADVANCE_DISTANCE = 1800;
/** Pointer/touch drag distance (px) that fills `nextProjectRatio` on the footer. */
const NEXT_DRAG_DISTANCE = 320;
/** How close (px) the SMOOTHED translate must be to the end before the bar may
 * start filling — stops the advance firing while the gallery is still sliding. */
const END_EPSILON = 6;

const ARROW_SVG =
  '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
  '<path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Maps `ProjectDetail.theme` keys to the `--project-details-*` CSS vars. */
const THEME_VARS: ReadonlyArray<[keyof ProjectDetail['theme'], string]> = [
  ['bg', '--project-details-bg'],
  ['bgAlt', '--project-details-bg-alt'],
  ['text', '--project-details-text'],
  ['highlight', '--project-details-highlight'],
  ['btnBg', '--project-details-btn-bg'],
  ['btnText', '--project-details-btn-text'],
  ['btnTextHover', '--project-details-btn-text-hover'],
  ['iconBg', '--project-details-icon-bg'],
  ['iconColor', '--project-details-icon-color'],
];

interface LenisLike {
  stop: () => void;
  start: () => void;
}

function getLenis(): LenisLike | undefined {
  return (window as typeof window & { __lenis?: LenisLike }).__lenis;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isMobile(): boolean {
  return window.matchMedia(`(max-width: ${MOBILE_MAX}px)`).matches;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Resolve a media "fill" height to 100% of the band, else pass through. */
function resolveSize(value: string): string {
  return value === 'fill' ? '100%' : value;
}

// ---------------------------------------------------------------------------
// DOM construction (data -> innerHTML). ids/classes are the contract with the
// CSS agent; see docs/project-details-spec.md §3.
// ---------------------------------------------------------------------------

function buildSideListGroup(group: SideListGroup): string {
  const items = group.items
    .map((item) => {
      if (group.asLinks) {
        const href = escapeAttr(sideListLinkUrl(item));
        return (
          `<a class="project-details-side-list-item" href="${href}" ` +
          `target="_blank" rel="noopener noreferrer">${escapeHtml(item)}</a>`
        );
      }
      return `<p class="project-details-side-list-item">${escapeHtml(item)}</p>`;
    })
    .join('');
  const id = group.asLinks ? ' id="project-details-side-list-links"' : '';
  return (
    `<div class="project-details-side-list-group"${id}>` +
    `<p class="project-details-side-list-title">${escapeHtml(group.title)}</p>` +
    items +
    '</div>'
  );
}

function buildLaunchCta(detail: ProjectDetail): string {
  if (!detail.launchUrl) return '';
  const label = escapeHtml(detail.launchLabel ?? 'Launch website');
  const href = safeUrl(detail.launchUrl);
  return (
    `<a id="project-details-launch-cta" href="${href}" target="_blank" rel="noopener">` +
    '<span id="project-details-launch-cta-dot" aria-hidden="true"></span>' +
    `<p id="project-details-launch-cta-text">${label}</p>` +
    `<span id="project-details-launch-cta-arrow" aria-hidden="true">${ARROW_SVG}</span>` +
    '</a>'
  );
}

function buildLaunchCtaMobile(detail: ProjectDetail): string {
  if (!detail.launchUrl) return '';
  const label = escapeHtml(detail.launchLabel ?? 'Launch website');
  const href = safeUrl(detail.launchUrl);
  return (
    `<a id="project-details-launch-cta-mobile" href="${href}" target="_blank" rel="noopener">` +
    '<span id="project-details-launch-cta-mobile-dot" aria-hidden="true"></span>' +
    `<p id="project-details-launch-cta-mobile-text">${label}</p>` +
    `<span id="project-details-launch-cta-mobile-arrow" aria-hidden="true">${ARROW_SVG}</span>` +
    '</a>'
  );
}

function buildMeta(detail: ProjectDetail): string {
  const desc = detail.description
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('');
  const groups = detail.sideLists
    .map((group) => buildSideListGroup(group))
    .join('');

  return (
    '<div id="project-details-meta">' +
    '<div id="project-details-left">' +
    `<h1 id="project-details-title">${escapeHtml(detail.title)}</h1>` +
    `<div id="project-details-desc">${desc}</div>` +
    '</div>' +
    '<div id="project-details-right">' +
    `<div id="project-details-side-list">${groups}</div>` +
    buildLaunchCta(detail) +
    '</div>' +
    buildLaunchCtaMobile(detail) +
    '</div>'
  );
}

function buildMediaItem(item: MediaItem): string {
  const width = safeDimension(item.width);
  const style = `style="width:${width}"`;
  if (item.kind === 'text') {
    return (
      `<div class="project-details-item" data-kind="text" ${style}>` +
      `<div class="project-details-item-text">${escapeHtml(item.text)}</div>` +
      '</div>'
    );
  }

  const height = safeDimension(resolveSize(item.height));
  const sizeStyle = `style="width:${width};height:${height}"`;
  const caption = item.caption
    ? `<p class="project-details-item-caption">${escapeHtml(item.caption)}</p>`
    : '';

  if (item.kind === 'image') {
    return (
      `<div class="project-details-item" data-kind="image" ${sizeStyle}>` +
      `<img class="project-details-item-media" src="${safeUrl(item.src)}" ` +
      `alt="${escapeAttr(item.alt)}" loading="lazy" draggable="false" />` +
      caption +
      '</div>'
    );
  }

  if (item.kind === 'video') {
    const poster = item.poster ? ` poster="${safeUrl(item.poster)}"` : '';
    return (
      `<div class="project-details-item" data-kind="video" ${sizeStyle}>` +
      `<video class="project-details-item-media" src="${safeUrl(item.src)}"${poster} ` +
      `muted loop playsinline preload="metadata" aria-label="${escapeAttr(item.alt)}"></video>` +
      caption +
      '</div>'
    );
  }

  // panel
  const label = item.label
    ? `<span class="project-details-item-label" aria-hidden="true">${escapeHtml(item.label)}</span>`
    : '';
  return (
    `<div class="project-details-item" data-kind="panel" data-tone="${escapeAttr(item.tone)}" ${sizeStyle}>` +
    label +
    caption +
    '</div>'
  );
}

function buildGallery(detail: ProjectDetail): string {
  const items = detail.media.map(buildMediaItem).join('');
  return (
    '<div id="project-details-items-wrapper">' +
    `<div id="project-details-items-move-container">${items}</div>` +
    '</div>'
  );
}

function buildPreview(nextTitle: string): string {
  return (
    '<div id="project-details-preview">' +
    '<div id="project-details-preview-inner">' +
    `<h2 id="project-details-preview-title">${escapeHtml(nextTitle)}</h2>` +
    '<div id="project-details-preview-footer">' +
    '<p id="project-details-preview-footer-text">Next</p>' +
    '<div id="project-details-preview-footer-bar">' +
    '<div id="project-details-preview-footer-bar-background"></div>' +
    '<div id="project-details-preview-footer-bar-inner"></div>' +
    '</div>' +
    `<span id="project-details-preview-footer-arrow" aria-hidden="true">${ARROW_SVG}</span>` +
    '</div>' +
    '</div>' +
    '</div>'
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

/**
 * Resolve a URL for an href/src attribute, rejecting non-http(s) schemes
 * (blocks `javascript:` and friends). Returns '#' on any failure.
 */
function safeUrl(value: string): string {
  try {
    const url = new URL(value, window.location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '#';
    return escapeAttr(value);
  } catch {
    return '#';
  }
}

/** Map a known side-list link name to a real external URL (no dead `#` tabs). */
const SIDE_LIST_LINK_URLS: ReadonlyArray<[string, string]> = [
  ['Instagram', 'https://instagram.com'],
  ['Twitter / X', 'https://x.com'],
  ['LinkedIn', 'https://www.linkedin.com'],
  ['GitHub', 'https://github.com'],
];

function sideListLinkUrl(name: string): string {
  for (const [key, url] of SIDE_LIST_LINK_URLS) {
    if (key === name) return url;
  }
  return 'https://example.com';
}

/** Allowlist for inline media width/height values; fall back to 'auto'. */
const DIMENSION_PATTERN = /^(\d+(\.\d+)?(em|rem|px|%|vw|vh)|fill|auto|100%)$/;

function safeDimension(value: string): string {
  return DIMENSION_PATTERN.test(value) ? value : 'auto';
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export function setupProjectDetail(deps: ProjectDetailDeps): ProjectDetailController {
  const root = document.getElementById('project-details');
  const backBtn = document.getElementById('header-center-project-back-btn');
  const headerInfo = document.getElementById('project-details-header-info');

  // Guard: if the mount point is absent (orchestrator not wired yet), no-op.
  if (!root) {
    return {
      open: () => Promise.resolve(),
      close: () => Promise.resolve(),
      isOpen: () => false,
    };
  }

  let open = false;
  let current: ProjectDetail | null = null;
  let lastTrigger: HTMLElement | null = null;
  let detach: (() => void) | null = null;
  // Elements (siblings of the detail layer under #ui) made `inert` while open,
  // so focus stays contained in the region. Restored exactly on close.
  let inertedChildren: HTMLElement[] = [];

  /** Make every #ui child inert except #header and #project-details. */
  function applyInert(): void {
    const ui = document.getElementById('ui');
    if (!ui) return;
    inertedChildren = [];
    for (const child of Array.from(ui.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (child.id === 'header' || child.id === 'project-details') continue;
      child.inert = true;
      inertedChildren.push(child);
    }
  }

  /** Reverse applyInert() exactly. */
  function clearInert(): void {
    for (const child of inertedChildren) child.inert = false;
    inertedChildren = [];
  }

  function setTheme(detail: ProjectDetail): void {
    if (!root) return;
    for (const [key, cssVar] of THEME_VARS) {
      root.style.setProperty(cssVar, detail.theme[key]);
    }
    // The back-button flood (`--project-details-btn-bg-hover`) is not a 1:1
    // theme field — drive it from the accent so it floods on-brand per project.
    root.style.setProperty('--project-details-btn-bg-hover', detail.theme.highlight);
  }

  function clearTheme(): void {
    if (!root) return;
    for (const [, cssVar] of THEME_VARS) {
      root.style.removeProperty(cssVar);
    }
    root.style.removeProperty('--project-details-btn-bg-hover');
  }

  function rememberTrigger(slug: string): void {
    const trigger = document.querySelector<HTMLElement>(`a[href="/projects/${slug}"]`);
    if (trigger) lastTrigger = trigger;
  }

  async function doOpen(
    detail: ProjectDetail,
    opts?: { immediate?: boolean },
  ): Promise<void> {
    if (!root) return;
    // Re-entrancy guard: open() called while already open must tear down the
    // existing interaction layer first (prevents a duplicate listener leak).
    if (open) {
      detach?.();
      detach = null;
    }
    rememberTrigger(detail.slug);

    // Build fresh DOM + theme for this project.
    setTheme(detail);
    const nextTitle = findProject(detail.nextSlug)?.title ?? detail.title;
    root.innerHTML = buildMeta(detail) + buildGallery(detail) + buildPreview(nextTitle);
    root.classList.toggle('has-cta', Boolean(detail.launchUrl));
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', `${detail.title} project details`);
    root.setAttribute('aria-hidden', 'false');

    if (headerInfo) {
      headerInfo.textContent = `${detail.category} — ${detail.year}`;
    }

    current = detail;
    open = true;
    document.documentElement.classList.add('is-project-details-active');
    applyInert();
    getLenis()?.stop();
    document.addEventListener('keydown', onKeyDown);

    const reduced = prefersReducedMotion();
    const immediate = opts?.immediate === true || reduced;

    // Wire interaction (scroll/drag/next-advance/CTA hover) and reveal.
    detach = attachInteractions({ root, deps, getNext, reduced });
    runOpenChoreography(root, backBtn, headerInfo, immediate);

    // Focus management for a11y.
    if (backBtn) {
      backBtn.setAttribute('aria-hidden', 'false');
      backBtn.focus({ preventScroll: true });
    }
  }

  function getNext(): ProjectDetail['nextSlug'] | null {
    return current ? current.nextSlug : null;
  }

  async function doClose(opts?: { immediate?: boolean }): Promise<void> {
    if (!root || !open) return;
    open = false;
    // Tell AT the region is gone at once, before the close animation resolves.
    root.setAttribute('aria-hidden', 'true');
    clearInert();
    document.removeEventListener('keydown', onKeyDown);
    detach?.();
    detach = null;

    const reduced = prefersReducedMotion();
    const immediate = opts?.immediate === true || reduced;
    await runCloseChoreography(root, backBtn, headerInfo, immediate);

    root.innerHTML = '';
    root.classList.remove('has-cta');
    root.setAttribute('aria-hidden', 'true');
    clearTheme();
    document.documentElement.classList.remove('is-project-details-active');
    if (backBtn) backBtn.setAttribute('aria-hidden', 'true');
    getLenis()?.start();
    current = null;

    // Restore focus to the trigger if still connected, else a sensible anchor.
    const restoreTarget =
      lastTrigger && lastTrigger.isConnected
        ? lastTrigger
        : (document.querySelector<HTMLElement>('#featured a[href^="/projects/"]') ??
          document.getElementById('logo'));
    restoreTarget?.focus({ preventScroll: true });
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      deps.onRequestClose();
    }
  }

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      deps.sound?.playUI('click');
      deps.onRequestClose();
    });
  }

  return {
    open: doOpen,
    close: doClose,
    isOpen: () => open,
  };
}

// ---------------------------------------------------------------------------
// Open / close choreography
// ---------------------------------------------------------------------------

function runOpenChoreography(
  root: HTMLElement,
  backBtn: HTMLElement | null,
  headerInfo: HTMLElement | null,
  immediate: boolean,
): void {
  const meta = root.querySelector<HTMLElement>('#project-details-meta');
  const title = root.querySelector<HTMLElement>('#project-details-title');
  const desc = root.querySelectorAll<HTMLElement>('#project-details-desc p');
  const sideGroups = root.querySelectorAll<HTMLElement>('.project-details-side-list-group');
  const ctas = root.querySelectorAll<HTMLElement>(
    '#project-details-launch-cta, #project-details-launch-cta-mobile',
  );

  // Split the title for the masked rise. splitWords -> .word-mask > .word.
  const words = title ? splitWords(title) : [];

  if (meta) meta.classList.add('is-active');

  if (immediate) {
    gsap.set(words, { yPercent: 0, opacity: 1 });
    gsap.set([desc, sideGroups, ctas].filter(Boolean) as ArrayLike<HTMLElement>[], {
      y: 0,
      opacity: 1,
    });
    if (backBtn) gsap.set(backBtn, { scale: 1 });
    if (headerInfo) gsap.set(headerInfo, { opacity: 1 });
    return;
  }

  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  // contentShowRatio 0->1 conceptually drives all of these on one timeline.
  tl.fromTo(words, { yPercent: 110 }, { yPercent: 0, duration: 0.9, stagger: 0.05 }, 0);
  if (desc.length) {
    tl.fromTo(desc, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.08 }, 0.25);
  }
  if (sideGroups.length) {
    tl.fromTo(
      sideGroups,
      { y: 16, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6, stagger: 0.1 },
      0.35,
    );
  }
  if (ctas.length) {
    tl.fromTo(ctas, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6 }, 0.55);
  }
  if (backBtn) {
    tl.fromTo(backBtn, { scale: 0 }, { scale: 1, duration: 0.6, ease: 'back.out(2)' }, 0.2);
  }
  if (headerInfo) {
    tl.fromTo(headerInfo, { opacity: 0 }, { opacity: 1, duration: 0.6 }, 0.4);
  }
}

function runCloseChoreography(
  root: HTMLElement,
  backBtn: HTMLElement | null,
  headerInfo: HTMLElement | null,
  immediate: boolean,
): Promise<void> {
  if (immediate) {
    if (backBtn) gsap.set(backBtn, { scale: 0 });
    if (headerInfo) gsap.set(headerInfo, { opacity: 0 });
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const meta = root.querySelector<HTMLElement>('#project-details-meta');
    const tl = gsap.timeline({
      defaults: { ease: 'power3.in', duration: 0.4 },
      onComplete: resolve,
    });
    if (meta) tl.to(meta, { opacity: 0 }, 0);
    if (backBtn) tl.to(backBtn, { scale: 0 }, 0);
    if (headerInfo) tl.to(headerInfo, { opacity: 0 }, 0);
  });
}

// ---------------------------------------------------------------------------
// Interaction layer: horizontal gallery scroll + next-project advance.
// ---------------------------------------------------------------------------

interface InteractionDeps {
  root: HTMLElement;
  deps: ProjectDetailDeps;
  getNext: () => string | null;
  reduced: boolean;
}

function attachInteractions(args: InteractionDeps): () => void {
  const { root, deps, getNext, reduced } = args;
  const moveContainer = root.querySelector<HTMLElement>('#project-details-items-move-container');
  const wrapper = root.querySelector<HTMLElement>('#project-details-items-wrapper');
  const previewBarInner = root.querySelector<HTMLElement>('#project-details-preview-footer-bar-inner');
  const items = Array.from(root.querySelectorAll<HTMLElement>('.project-details-item'));

  const cleanups: Array<() => void> = [];

  // Launch CTA hover SFX (delegated so it survives rebuild).
  const cta = root.querySelector<HTMLElement>('#project-details-launch-cta');
  if (cta && deps.sound) {
    const onEnter = (): void => deps.sound?.playUI('hover');
    cta.addEventListener('pointerenter', onEnter);
    cleanups.push(() => cta.removeEventListener('pointerenter', onEnter));
  }

  // On mobile (or reduced motion) we do NOT hijack — native vertical scroll
  // handles the stacked layout. Just reveal everything (and play media) and bail.
  if (isMobile() || reduced || !moveContainer || !wrapper) {
    for (const item of items) {
      item.style.visibility = 'visible';
      void item.querySelector('video')?.play().catch(() => {});
    }
    return () => cleanups.forEach((fn) => fn());
  }

  // Kill any in-flight quickTo tween on close so it can't fire after the DOM
  // is rebuilt / innerHTML cleared.
  cleanups.push(() => gsap.killTweensOf(moveContainer));

  let scrollX = 0; // current smoothed translate
  let targetX = 0; // wheel/drag target translate
  let maxScroll = 0;
  let nextRatio = 0; // 0..1 next-project advance
  let advanced = false; // guard double-fire
  let frozen = false; // set once an advance fires — no further input this layer
  // Cached item.offsetLeft (recomputed on resize) so revealVisible() does not
  // force layout every frame.
  let itemLefts = items.map((i) => i.offsetLeft);
  let revealedCount = 0; // stop the per-frame scan once every item is visible
  let lastDrivenRatio = -1; // drivePreview no-op guard
  let lastNextRatioWritten = -1; // only write --next-ratio on change

  const setX = gsap.quickTo(moveContainer, 'x', { duration: 0.5, ease: 'power3.out' });

  function recompute(): void {
    if (!moveContainer || !wrapper) return;
    maxScroll = Math.max(0, moveContainer.scrollWidth - wrapper.clientWidth);
    itemLefts = items.map((i) => i.offsetLeft);
    targetX = clamp(targetX, 0, maxScroll);
    // If the gallery shrank below the current target, clamp and drop any
    // half-open next-project preview.
    if (maxScroll < targetX) {
      targetX = maxScroll;
      applyNextRatio(0);
    }
  }
  recompute();

  function applyNextRatio(ratio: number): void {
    if (frozen) return;
    nextRatio = clamp(ratio, 0, 1);
    if (previewBarInner) gsap.set(previewBarInner, { scaleX: nextRatio });
    if (nextRatio !== lastNextRatioWritten) {
      gsap.set(root, { '--next-ratio': nextRatio });
      lastNextRatioWritten = nextRatio;
    }
    if (nextRatio >= 1 && !advanced) {
      advanced = true;
      frozen = true; // exactly one advance per layer instance
      const slug = getNext();
      if (slug) deps.onRequestProject(slug);
    } else if (nextRatio < 1) {
      advanced = false;
    }
  }

  function addDelta(delta: number): void {
    if (frozen) return;
    if (isMobile()) return; // native vertical scroll once the CSS stacks
    const room = maxScroll - targetX;
    if (delta > 0 && room <= 0.5) {
      // Past the end: feed forward delta into the next-project ratio — but only
      // once the gallery has VISUALLY landed at the end. While the smoothed
      // translate is still catching up to targetX, holding fire keeps the
      // advance from triggering mid-slide (the "jumps to the next project
      // immediately" bug). Once the bar has begun, let it run through.
      const visualAtEnd = -scrollX >= maxScroll - END_EPSILON;
      if (!visualAtEnd && nextRatio <= 0) return;
      applyNextRatio(nextRatio + delta / NEXT_ADVANCE_DISTANCE);
      return;
    }
    if (delta < 0 && nextRatio > 0) {
      // Reversing while the preview is partly open: drain the ratio first, then
      // spend any leftover negative delta on targetX so neither sticks half-open.
      const ratioDrain = nextRatio * NEXT_ADVANCE_DISTANCE;
      if (-delta >= ratioDrain) {
        const leftover = delta + ratioDrain; // still negative (or zero)
        applyNextRatio(0);
        targetX = clamp(targetX + leftover, 0, maxScroll);
      } else {
        applyNextRatio(nextRatio + delta / NEXT_ADVANCE_DISTANCE);
      }
      return;
    }
    targetX = clamp(targetX + delta, 0, maxScroll);
  }

  function revealVisible(): void {
    if (!wrapper) return;
    if (revealedCount >= items.length) return; // fully revealed — stop scanning
    const right = wrapper.clientWidth + 200;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.style.visibility === 'visible') continue;
      const left = itemLefts[i] + scrollX;
      if (left < right) {
        item.style.visibility = 'visible';
        revealedCount++;
        void item.querySelector('video')?.play().catch(() => {});
        if (!reduced) {
          gsap.fromTo(
            item,
            { opacity: 0, y: 24 },
            { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out' },
          );
        }
      }
    }
  }

  // ---- wheel ----
  const onWheel = (event: WheelEvent): void => {
    if (isMobile()) return; // CSS has switched to the vertical stack — let native scroll work
    // Only hijack when there is real horizontal room or an open next-ratio;
    // otherwise let the page scroll naturally instead of freezing it.
    if (maxScroll > 0 || nextRatio > 0) event.preventDefault();
    addDelta(event.deltaY + event.deltaX);
  };
  root.addEventListener('wheel', onWheel, { passive: false });
  cleanups.push(() => root.removeEventListener('wheel', onWheel));

  // ---- pointer / touch drag ----
  let dragging = false;
  let lastPointerX = 0;
  const onPointerDown = (event: PointerEvent): void => {
    if (isMobile()) return; // native vertical scroll once the CSS stacks
    dragging = true;
    lastPointerX = event.clientX;
    root.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (isMobile() || !dragging) return;
    const dx = event.clientX - lastPointerX;
    lastPointerX = event.clientX;
    addDelta(-dx);
  };
  const onPointerUp = (event: PointerEvent): void => {
    dragging = false;
    root.releasePointerCapture?.(event.pointerId);
  };
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerUp);
  cleanups.push(() => {
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerup', onPointerUp);
    root.removeEventListener('pointercancel', onPointerUp);
  });

  // ---- footer drag fills nextRatio directly ----
  const footer = root.querySelector<HTMLElement>('#project-details-preview-footer');
  if (footer) {
    let footerDragging = false;
    let footerStartX = 0;
    let footerStartRatio = 0;
    const fDown = (event: PointerEvent): void => {
      if (frozen) return;
      footerDragging = true;
      footerStartX = event.clientX;
      footerStartRatio = nextRatio;
      footer.setPointerCapture?.(event.pointerId);
    };
    const fMove = (event: PointerEvent): void => {
      if (frozen || !footerDragging) return;
      const dx = event.clientX - footerStartX;
      applyNextRatio(footerStartRatio + dx / NEXT_DRAG_DISTANCE);
    };
    const fUp = (event: PointerEvent): void => {
      footerDragging = false;
      footer.releasePointerCapture?.(event.pointerId);
    };
    footer.addEventListener('pointerdown', fDown);
    footer.addEventListener('pointermove', fMove);
    footer.addEventListener('pointerup', fUp);
    footer.addEventListener('pointercancel', fUp);
    cleanups.push(() => {
      footer.removeEventListener('pointerdown', fDown);
      footer.removeEventListener('pointermove', fMove);
      footer.removeEventListener('pointerup', fUp);
      footer.removeEventListener('pointercancel', fUp);
    });
  }

  // ---- resize ----
  const onResize = (): void => recompute();
  window.addEventListener('resize', onResize);
  cleanups.push(() => window.removeEventListener('resize', onResize));

  // ---- keyboard (a11y): make the gallery operable without a pointer ----
  const KEY_STEP = 240;
  wrapper.tabIndex = 0;
  wrapper.setAttribute('role', 'group');
  wrapper.setAttribute('aria-label', 'Project media — use arrow keys to scroll');
  const onKeyNav = (event: KeyboardEvent): void => {
    switch (event.key) {
      case 'ArrowRight':
      case 'PageDown':
        addDelta(KEY_STEP);
        break;
      case 'ArrowLeft':
      case 'PageUp':
        addDelta(-KEY_STEP);
        break;
      case 'End':
        addDelta(maxScroll + NEXT_ADVANCE_DISTANCE);
        break;
      case 'Home':
        targetX = 0;
        applyNextRatio(0);
        break;
      default:
        return;
    }
    event.preventDefault();
  };
  wrapper.addEventListener('keydown', onKeyNav);
  cleanups.push(() => wrapper.removeEventListener('keydown', onKeyNav));

  // ---- render loop (smooth translate + reveal + preview slide) ----
  const tick = (): void => {
    scrollX += (-targetX - scrollX) * 0.12;
    setX(scrollX);
    revealVisible();
    // Skip the preview write entirely while it stays fully closed (0 -> 0).
    if (!(nextRatio === 0 && lastDrivenRatio === 0)) {
      drivePreview(root, nextRatio);
      lastDrivenRatio = nextRatio;
    }
  };
  gsap.ticker.add(tick);
  cleanups.push(() => gsap.ticker.remove(tick));

  // Initial reveal pass for the first on-screen items.
  revealVisible();

  return () => cleanups.forEach((fn) => fn());
}

/** Slide `#project-details-preview` in from the right and dim the gallery. */
function drivePreview(root: HTMLElement, ratio: number): void {
  const preview = root.querySelector<HTMLElement>('#project-details-preview');
  const gallery = root.querySelector<HTMLElement>('#project-details-items-wrapper');
  if (preview) {
    gsap.set(preview, {
      xPercent: (1 - ratio) * 100,
      autoAlpha: ratio > 0 ? 1 : 0,
    });
  }
  if (gallery) {
    gsap.set(gallery, {
      opacity: 1 - ratio * 0.6,
      scale: 1 - ratio * 0.04,
      transformOrigin: '50% 50%',
    });
  }
}
