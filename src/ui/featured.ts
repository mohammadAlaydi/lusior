import gsap from 'gsap';
import type { ProjectSummary } from '../../shared/projects';
import { fetchProjectList } from '../data/projects';
import './scroll';
import { splitWords } from './splitWords';

const REVEAL_EASE = 'power4.out';
let featuredHoverAbort: AbortController | null = null;

export interface FeaturedSectionController {
  setSuspended(suspended: boolean): void;
  dispose(): void;
}

interface SuspendableController {
  setSuspended(suspended: boolean): void;
  dispose(): void;
}

/**
 * Replace only the data on the semantic HTML cards. The markup remains in
 * index.html for crawlers, no-JS visits, and as the resilient offline view.
 * This runs before `setupFeaturedSection()` attaches motion interactions.
 */
export async function hydrateFeaturedProjects(): Promise<void> {
  const cards = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('#featured-grid .project-item[data-slug]'),
  );
  const projects = await fetchProjectList();

  if (!canHydrateCards(cards, projects)) {
    if (import.meta.env.DEV) {
      console.warn(
        '[projects-data] Featured cards were not hydrated because the list or card set is invalid.',
      );
    }
    return;
  }

  for (const [index, card] of cards.entries()) {
    // `canHydrateCards` established every project/shell pair before any DOM mutation.
    applyProjectToCard(card, projects[index]);
  }
}

function canHydrateCards(cards: HTMLAnchorElement[], projects: ProjectSummary[]): boolean {
  if (cards.length !== projects.length || cards.length === 0) return false;

  const projectSlugs = projects.map((project) => project.slug);
  return (
    new Set(projectSlugs).size === projects.length &&
    cards.every(
      (card) =>
        card.querySelector('.project-item-line-1') !== null &&
        card.querySelector('.project-item-name') !== null &&
        card.querySelector('.project-item-media') !== null,
    )
  );
}

function applyProjectToCard(card: HTMLAnchorElement, project: ProjectSummary): void {
  card.href = `/projects/${encodeURIComponent(project.slug)}`;
  card.dataset.slug = project.slug;
  card.dataset.projectTitle = project.title;
  if (project.thumbVideo) card.dataset.thumbVideo = project.thumbVideo;
  else delete card.dataset.thumbVideo;
  card.style.setProperty('--accent', project.accent);
  card.setAttribute('aria-label', `${project.title} — ${project.category}`);

  const category = card.querySelector<HTMLElement>('.project-item-line-1');
  const title = card.querySelector<HTMLElement>('.project-item-name');
  if (!category || !title) return;
  category.textContent = project.category;
  title.textContent = project.title;

  const media = card.querySelector<HTMLElement>('.project-item-media');
  if (media) {
    // JSON.stringify produces a quoted CSS string, preventing an untrusted URL
    // from escaping url(...) into another declaration. No untrusted HTML is set.
    media.style.backgroundImage = `url(${JSON.stringify(project.thumb)})`;
    media.dataset.source = project.thumb;

    const existingPreview = media.querySelector<HTMLVideoElement>('.project-item-video');
    if (!project.thumbVideo) {
      existingPreview?.remove();
    } else {
      const preview = existingPreview ?? document.createElement('video');
      preview.className = 'project-item-video';
      preview.muted = true;
      preview.loop = true;
      preview.playsInline = true;
      preview.preload = 'none';
      preview.tabIndex = -1;
      preview.setAttribute('aria-hidden', 'true');
      preview.src = project.thumbVideo;
      if (!existingPreview) media.append(preview);
    }
  }
}

/**
 * Featured-projects choreography (matched against a live frame study):
 *  - section title: per-word masked reveal; disclaimer eases in
 *  - project tiles enter FULLY RENDERED (the reference has no clip/wipe
 *    reveal) — their only motion is a subtle bend while the page scrolls,
 *    settling flat at rest (velocity-driven, like the reference's WebGL
 *    planes)
 *  - footer: masked rise of the name, fade of the category line
 *  - hover: the real product recording fades over its still, then the cursor
 *    pans the artwork like a small camera-POV move; the masked name + arrow
 *    assembly slides 1em right so the arrow enters the line
 */
export function setupFeaturedSection(): FeaturedSectionController {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const items = Array.from(document.querySelectorAll<HTMLElement>('.project-item'));

  const hover = setupHover(items);

  if (reducedMotion) return hover;

  // --- section title: per-word masked reveal -------------------------------
  const title = document.getElementById('featured-title');
  if (title) {
    const words = splitWords(title);
    gsap.set(words, { yPercent: 120, rotation: 5, transformOrigin: '0% 100%' });
    gsap.to(words, {
      yPercent: 0,
      rotation: 0,
      duration: 1.1,
      ease: REVEAL_EASE,
      stagger: 0.08,
      scrollTrigger: { trigger: '#featured-head', start: 'top 80%', once: true },
    });
  }

  const disclaimer = document.getElementById('featured-disclaimer');
  if (disclaimer) {
    gsap.from(disclaimer, {
      opacity: 0,
      y: 18,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: '#featured-head', start: 'top 70%', once: true },
    });
  }

  // --- footer reveals (artwork enters as-is, like the reference) -------------
  for (const item of items) {
    const line1 = item.querySelector<HTMLElement>('.project-item-line-1');
    const nameInner = item.querySelector<HTMLElement>('.project-item-line-2-inner');

    const timeline = gsap.timeline({
      scrollTrigger: { trigger: item, start: 'top 85%', once: true },
    });

    if (nameInner) {
      gsap.set(nameInner, { yPercent: 110 });
      timeline.to(nameInner, { yPercent: 0, duration: 0.9, ease: REVEAL_EASE }, 0.1);
    }
    if (line1) {
      gsap.set(line1, { opacity: 0, y: 14 });
      timeline.to(line1, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, 0.2);
    }
  }

  // --- subtle scroll bend (reference: WebGL planes flex while scrolling) -----
  const scrollBend = setupScrollBend(items);

  // --- CTA (reference: fades up with a slight rotation settle) ---------------
  const cta = document.getElementById('featured-cta');
  if (cta) {
    gsap.from(cta, {
      opacity: 0,
      y: 26,
      rotation: -5,
      transformOrigin: '50% 100%',
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: cta, start: 'top 90%', once: true },
    });
  }

  return {
    setSuspended(suspended: boolean): void {
      hover.setSuspended(suspended);
      scrollBend.setSuspended(suspended);
    },
    dispose(): void {
      hover.dispose();
      scrollBend.dispose();
    },
  };
}

/**
 * The reference tiles bend softly while the page scrolls and settle flat at
 * rest. Approximated with a clamped, smoothed velocity-driven skew on the
 * artwork — kept deliberately faint (the real effect is a WebGL mesh warp).
 */
function setupScrollBend(items: HTMLElement[]): SuspendableController {
  const mains = items
    .map((item) => item.querySelector<HTMLElement>('.project-item-main'))
    .filter((el): el is HTMLElement => el !== null);
  if (mains.length === 0) return createNoopController();

  let current = 0;
  let lastY = window.scrollY;
  let suspended = false;

  const tick = (): void => {
    const y = window.scrollY;
    const velocity = y - lastY;
    lastY = y;

    const target = gsap.utils.clamp(-1.2, 1.2, velocity * 0.035);
    // ease toward the target, then settle back to flat
    current += (target - current) * 0.12;
    if (Math.abs(current) < 0.003 && target === 0) {
      if (current !== 0) {
        current = 0;
        gsap.set(mains, { skewY: 0 });
      }
      return;
    }
    gsap.set(mains, { skewY: current, transformOrigin: '50% 50%' });
  };

  gsap.ticker.add(tick);

  return {
    setSuspended(nextSuspended: boolean): void {
      if (suspended === nextSuspended) return;
      suspended = nextSuspended;
      if (suspended) {
        gsap.ticker.remove(tick);
        current = 0;
        gsap.set(mains, { skewY: 0 });
      } else {
        lastY = window.scrollY;
        gsap.ticker.add(tick);
      }
    },
    dispose(): void {
      gsap.ticker.remove(tick);
      gsap.set(mains, { skewY: 0 });
    },
  };
}

/** How far the artwork may pan, as a fraction of the tile size. */
const POV_PAN = 0.03;
/** Base over-scale so panning never reveals the tile edges. */
const POV_SCALE = 1.12;

/**
 * Hover behavior, matched against the reference (live pointer study):
 *  - entering blurs the artwork slightly, then it sharpens again
 *  - moving the cursor inside the tile shifts the artwork like a small
 *    camera-POV move (the reference nudges its 3D camera; we pan the
 *    over-scaled artwork toward the cursor)
 *  - the captured product loop fades over the still on hover/focus and pauses
 *    on exit; reduced-motion users keep the still
 *  - the masked name + arrow assembly slides 1em right (GSAP owns the
 *    transform — a CSS transition would fight the scroll-reveal rise)
 */
function setupHover(items: HTMLElement[]): SuspendableController {
  // Boot normally runs once, but this keeps an eventual soft re-mount from
  // stacking pointer handlers on the same semantic card elements.
  featuredHoverAbort?.abort();
  const abortController = new AbortController();
  featuredHoverAbort = abortController;
  const listenerOptions = { signal: abortController.signal };
  window.addEventListener('pagehide', () => abortController.abort(), {
    once: true,
    signal: abortController.signal,
  });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Depth is deliberately opt-in: a touch interaction should remain a simple
  // link tap, and reduced-motion users keep the original flat card treatment.
  const canUseDepth =
    !reducedMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  let suspended = false;
  const resetInteractions: Array<() => void> = [];
  const restoreFocusStates: Array<() => void> = [];

  for (const item of items) {
    const inner = item.querySelector<HTMLElement>('.project-item-line-2-inner');
    const main = item.querySelector<HTMLElement>('.project-item-main');
    const media = item.querySelector<HTMLElement>('.project-item-media');
    const previewVideo = canUseDepth
      ? (media?.querySelector<HTMLVideoElement>('.project-item-video') ?? null)
      : null;

    const depth = canUseDepth && main && media ? ensureDepthSurface(main, media) : null;
    const glare = depth?.querySelector<HTMLElement>('.project-item-glare') ?? null;

    const slide = (x: string): void => {
      if (!inner) return;
      if (reducedMotion) {
        gsap.set(inner, { x });
        return;
      }
      gsap.to(inner, { x, duration: 0.45, ease: 'power4.out', overwrite: 'auto' });
    };

    if (reducedMotion || !main || !media) {
      item.addEventListener('pointerenter', () => !suspended && slide('1em'), listenerOptions);
      item.addEventListener('pointerleave', () => !suspended && slide('0em'), listenerOptions);
      item.addEventListener('focusin', () => !suspended && slide('1em'), listenerOptions);
      item.addEventListener('focusout', () => !suspended && slide('0em'), listenerOptions);
      continue;
    }

    // over-scale once so the POV pan never shows the edges
    gsap.set(media, { scale: POV_SCALE });

    const panX = gsap.quickTo(media, 'x', { duration: 0.6, ease: 'power3.out' });
    const panY = gsap.quickTo(media, 'y', { duration: 0.6, ease: 'power3.out' });
    // Scroll bend owns .project-item-main. The depth surface below it owns
    // these rotations, so the two effects never contend for one transform.
    const tiltX = depth
      ? gsap.quickTo(depth, 'rotationX', { duration: 0.45, ease: 'power3.out' })
      : null;
    const tiltY = depth
      ? gsap.quickTo(depth, 'rotationY', { duration: 0.45, ease: 'power3.out' })
      : null;
    let bounds: DOMRect | null = null;
    let pointerActive = false;
    let focusActive = false;

    const startPreview = (): void => {
      if (!previewVideo || suspended) return;
      void previewVideo
        .play()
        .then(() => {
          if (!suspended && (pointerActive || focusActive)) item.classList.add('is-video-active');
        })
        .catch(() => item.classList.remove('is-video-active'));
    };

    const stopPreview = (): void => {
      if (!previewVideo || pointerActive || focusActive) return;
      item.classList.remove('is-video-active');
      previewVideo.pause();
      if (previewVideo.readyState >= HTMLMediaElement.HAVE_METADATA) previewVideo.currentTime = 0;
    };

    const enter = (): void => {
      if (suspended) return;
      pointerActive = true;
      startPreview();
      slide('1em');
      bounds = main.getBoundingClientRect();
      if (depth) item.classList.add('is-depth-active');
      // slight blur in, then sharpen — the reference's hover pulse
      gsap
        .timeline({ overwrite: 'auto' })
        .to(media, { filter: 'blur(9px)', duration: 0.18, ease: 'power2.in' })
        .to(media, { filter: 'blur(0px)', duration: 0.5, ease: 'power2.out' });
    };

    const move = (event: PointerEvent): void => {
      if (suspended) return;
      const rect = bounds ?? main.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      // normalized cursor position from tile center, clamped to [-1, 1]
      const nx = gsap.utils.clamp(-1, 1, ((event.clientX - rect.left) / rect.width) * 2 - 1);
      const ny = gsap.utils.clamp(-1, 1, ((event.clientY - rect.top) / rect.height) * 2 - 1);
      panX(-nx * rect.width * POV_PAN);
      panY(-ny * rect.height * POV_PAN);
      if (tiltX && tiltY && glare) {
        tiltX(-ny * 5);
        tiltY(nx * 6);
        glare.style.setProperty('--glare-x', `${50 + nx * 30}%`);
        glare.style.setProperty('--glare-y', `${50 + ny * 30}%`);
      }
    };

    const leave = (): void => {
      if (suspended) return;
      pointerActive = false;
      stopPreview();
      slide('0em');
      bounds = null;
      item.classList.remove('is-depth-active');
      panX(0);
      panY(0);
      // A focused card retains its quieter, deterministic keyboard state.
      tiltX?.(item.matches(':focus') ? -1.2 : 0);
      tiltY?.(item.matches(':focus') ? -1.8 : 0);
      gsap.to(media, { filter: 'blur(0px)', duration: 0.3, ease: 'power2.out', overwrite: 'auto' });
    };

    item.addEventListener('pointerenter', enter, listenerOptions);
    item.addEventListener('pointermove', move, listenerOptions);
    item.addEventListener('pointerleave', leave, listenerOptions);
    // keyboard parity with the old :focus-visible CSS rule
    item.addEventListener(
      'focusin',
      () => {
        if (suspended) return;
        focusActive = true;
        startPreview();
        slide('1em');
        if (depth) {
          item.classList.add('is-depth-focus');
          tiltX?.(-1.2);
          tiltY?.(-1.8);
        }
      },
      listenerOptions,
    );
    item.addEventListener(
      'focusout',
      () => {
        if (suspended) return;
        focusActive = false;
        stopPreview();
        slide('0em');
        if (depth) {
          item.classList.remove('is-depth-focus');
          tiltX?.(0);
          tiltY?.(0);
        }
      },
      listenerOptions,
    );

    resetInteractions.push(() => {
      bounds = null;
      pointerActive = false;
      focusActive = false;
      item.classList.remove('is-depth-active', 'is-depth-focus', 'is-video-active');
      previewVideo?.pause();
      if (previewVideo && previewVideo.readyState >= HTMLMediaElement.HAVE_METADATA) {
        previewVideo.currentTime = 0;
      }
      gsap.killTweensOf(
        [media, depth].filter((element): element is HTMLElement => element !== null),
      );
      gsap.set(media, { x: 0, y: 0, filter: 'blur(0px)' });
      if (depth) gsap.set(depth, { rotationX: 0, rotationY: 0 });
    });
    restoreFocusStates.push(() => {
      if (!item.matches(':focus')) return;
      focusActive = true;
      startPreview();
      if (depth) {
        item.classList.add('is-depth-focus');
        tiltX?.(-1.2);
        tiltY?.(-1.8);
      }
    });
  }

  return {
    setSuspended(nextSuspended: boolean): void {
      if (suspended === nextSuspended) return;
      suspended = nextSuspended;
      if (suspended) resetInteractions.forEach((reset) => reset());
      else restoreFocusStates.forEach((restore) => restore());
    },
    dispose(): void {
      resetInteractions.forEach((reset) => reset());
      abortController.abort();
      if (featuredHoverAbort === abortController) featuredHoverAbort = null;
    },
  };
}

function createNoopController(): SuspendableController {
  return { setSuspended: () => undefined, dispose: () => undefined };
}

/**
 * Creates a transform boundary beneath the scroll-bent main element. The
 * server-rendered media is moved rather than duplicated, retaining hydration
 * and the image fallback while giving depth/glare their own compositing layer.
 */
function ensureDepthSurface(main: HTMLElement, media: HTMLElement): HTMLElement {
  const existing = main.querySelector<HTMLElement>(':scope > .project-item-depth');
  if (existing) return existing;

  const depth = document.createElement('div');
  depth.className = 'project-item-depth';
  const glare = document.createElement('div');
  glare.className = 'project-item-glare';
  glare.setAttribute('aria-hidden', 'true');
  main.insertBefore(depth, media);
  depth.append(media, glare);
  return depth;
}
