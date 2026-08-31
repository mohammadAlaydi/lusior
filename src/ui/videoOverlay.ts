import gsap from 'gsap';
import { getAppRuntime } from '../core/appRuntime';

/**
 * Fullscreen showreel player (#video-overlay):
 *  - opens from the showreel watch button (#reel-watch) with a 0.4s fade
 *  - play/pause + mute/unmute text buttons, click/drag/arrow-key-seekable
 *    progress bar exposed to AT as a slider
 *  - while open, the overlay's <body> siblings are inert so Tab stays inside
 *    the dialog; focus returns to the watch button on close
 *  - big white "Close" cursor lerp-follows the pointer over the video surface
 *    (hidden on touch devices and under reduced motion); clicking the surface
 *    closes the overlay, as do Escape and the mobile close button
 *  - if the video asset 404s, an animated-gradient placeholder appears and
 *    the transport controls go inert (close paths keep working)
 *  - reduced motion: instant show/hide, no tweens, no follower cursor
 */

const CURSOR_LERP = 0.15;
const FADE_DURATION = 0.4;

interface VideoOverlayOptions {
  onOpen?: () => void;
  onClose?: () => void;
}

export interface VideoOverlayController {
  open(): void;
  close(): void;
  dispose(): void;
}

interface OverlayElements {
  overlay: HTMLElement;
  video: HTMLVideoElement;
  fallback: HTMLElement;
  progressContainer: HTMLElement;
  progressActive: HTMLElement;
  playBtn: HTMLButtonElement;
  muteBtn: HTMLButtonElement;
  mobileCloseBtn: HTMLElement;
  cursor: HTMLElement;
  trigger: HTMLElement | null;
}

interface OverlayState {
  isOpen: boolean;
  isFallback: boolean;
}

interface CursorFollower {
  start(): void;
  stop(): void;
}

function queryOverlayElements(): OverlayElements | null {
  const overlay = document.getElementById('video-overlay');
  const video = document.getElementById('video-overlay-video');
  const fallback = document.getElementById('video-overlay-fallback');
  const progressContainer = document.getElementById('video-overlay__progress-container');
  const progressActive = document.getElementById('video-overlay__progress-active');
  const playBtn = document.getElementById('video-overlay__play-btn');
  const muteBtn = document.getElementById('video-overlay__mute-btn');
  const mobileCloseBtn = document.getElementById('video-overlay__mobile-close-btn');
  const cursor = document.getElementById('video-overlay-cursor');

  if (
    !overlay ||
    !(video instanceof HTMLVideoElement) ||
    !fallback ||
    !progressContainer ||
    !progressActive ||
    !(playBtn instanceof HTMLButtonElement) ||
    !(muteBtn instanceof HTMLButtonElement) ||
    !mobileCloseBtn ||
    !cursor
  ) {
    return null;
  }

  return {
    overlay,
    video,
    fallback,
    progressContainer,
    progressActive,
    playBtn,
    muteBtn,
    mobileCloseBtn,
    cursor,
    trigger: document.getElementById('reel-watch'),
  };
}

/**
 * The big white "Close" circle: rAF-lerped follow of the pointer, scaling to
 * zero over the controls/close button so they stay readable. Created only
 * when hover + motion are available; CSS hides it otherwise.
 */
function createCursorFollower(overlay: HTMLElement, cursor: HTMLElement): CursorFollower {
  let targetX = 0;
  let targetY = 0;
  let targetScale = 0;
  let x = 0;
  let y = 0;
  let scale = 0;
  let frame = 0;
  let running = false;
  let hasPosition = false;

  function onPointerMove(event: PointerEvent): void {
    targetX = event.clientX;
    targetY = event.clientY;
    if (!hasPosition) {
      x = targetX;
      y = targetY;
      hasPosition = true;
    }
    const target = event.target instanceof Element ? event.target : null;
    const overControls = target?.closest(
      '#video-overlay__controls, #video-overlay__mobile-close-btn',
    );
    targetScale = overControls ? 0 : 1;
  }

  function onPointerLeave(): void {
    targetScale = 0;
  }

  function tick(): void {
    x += (targetX - x) * CURSOR_LERP;
    y += (targetY - y) * CURSOR_LERP;
    scale += (targetScale - scale) * CURSOR_LERP;
    const offset = cursor.offsetWidth / 2;
    cursor.style.transform = `translate3d(${x - offset}px, ${y - offset}px, 0) scale(${scale.toFixed(3)})`;
    if (running) {
      frame = requestAnimationFrame(tick);
    }
  }

  function start(): void {
    if (running) return;
    running = true;
    overlay.addEventListener('pointermove', onPointerMove);
    overlay.addEventListener('pointerleave', onPointerLeave);
    frame = requestAnimationFrame(tick);
  }

  function stop(): void {
    if (!running) return;
    running = false;
    cancelAnimationFrame(frame);
    overlay.removeEventListener('pointermove', onPointerMove);
    overlay.removeEventListener('pointerleave', onPointerLeave);
    targetScale = 0;
    scale = 0;
    hasPosition = false;
    cursor.style.transform = 'scale(0)';
  }

  return { start, stop };
}

/** Missing asset: reveal the gradient placeholder and inert the transport. */
const MISSING_MEDIA_GRACE_MS = 2500;

function bindFallback(els: OverlayElements, state: OverlayState, signal: AbortSignal): void {
  const activate = (): void => {
    if (state.isFallback) return;
    state.isFallback = true;
    els.video.pause();
    els.fallback.hidden = false;
    els.overlay.classList.add('video-overlay--fallback');
    els.playBtn.disabled = true;
    els.muteBtn.disabled = true;
  };

  els.video.addEventListener('error', activate, { once: true, signal });

  // Dev servers (and some hosts) answer missing media with an HTML fallback
  // page instead of a 404, so 'error' never fires. If the source has produced
  // no data at all shortly after loading begins, treat it as missing too.
  els.video.addEventListener(
    'loadstart',
    () => {
      window.setTimeout(() => {
        if (els.video.readyState === HTMLMediaElement.HAVE_NOTHING) activate();
      }, MISSING_MEDIA_GRACE_MS);
    },
    { once: true, signal },
  );
}

function bindPlaybackControls(
  els: OverlayElements,
  state: OverlayState,
  signal: AbortSignal,
): void {
  els.playBtn.addEventListener(
    'click',
    () => {
      if (state.isFallback) return;
      if (els.video.paused) {
        void els.video.play().catch(() => {
          /* asset missing or playback blocked: fallback handler takes over */
        });
      } else {
        els.video.pause();
      }
    },
    { signal },
  );

  // Keep labels in sync with the element's real state (covers programmatic
  // play/pause from open()/close() too).
  els.video.addEventListener(
    'play',
    () => {
      els.playBtn.textContent = 'Pause';
    },
    { signal },
  );
  els.video.addEventListener(
    'pause',
    () => {
      els.playBtn.textContent = 'Play';
    },
    { signal },
  );

  els.muteBtn.addEventListener(
    'click',
    () => {
      if (state.isFallback) return;
      els.video.muted = !els.video.muted;
      els.muteBtn.textContent = els.video.muted ? 'Unmute' : 'Mute';
    },
    { signal },
  );
}

/** Keyboard seek step for the progress slider, in seconds. */
const KEY_SEEK_SECONDS = 5;

/** mm:ss for the slider's aria-valuetext, e.g. 83 -> "1:23". */
function formatTime(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function bindProgress(els: OverlayElements, state: OverlayState, signal: AbortSignal): void {
  let isDragging = false;

  // Expose the visual bar as a keyboard-operable slider (the markup only
  // carries the aria-label; visuals are untouched).
  els.progressContainer.setAttribute('tabindex', '0');
  els.progressContainer.setAttribute('role', 'slider');
  els.progressContainer.setAttribute('aria-valuemin', '0');
  els.progressContainer.setAttribute('aria-valuemax', '100');
  els.progressContainer.setAttribute('aria-valuenow', '0');

  function updateSliderAria(): void {
    const duration = els.video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const percent = Math.round((els.video.currentTime / duration) * 100);
    els.progressContainer.setAttribute('aria-valuenow', `${percent}`);
    els.progressContainer.setAttribute(
      'aria-valuetext',
      `${formatTime(els.video.currentTime)} of ${formatTime(duration)}`,
    );
  }

  function seekToPointer(event: PointerEvent): void {
    const duration = els.video.duration;
    if (state.isFallback || !Number.isFinite(duration) || duration <= 0) return;
    const rect = els.progressContainer.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    els.video.currentTime = ratio * duration;
    els.progressActive.style.width = `${ratio * 100}%`;
  }

  function endDrag(event: PointerEvent): void {
    if (!isDragging) return;
    isDragging = false;
    if (els.progressContainer.hasPointerCapture(event.pointerId)) {
      els.progressContainer.releasePointerCapture(event.pointerId);
    }
  }

  els.video.addEventListener(
    'timeupdate',
    () => {
      if (isDragging || !els.video.duration) return;
      els.progressActive.style.width = `${(els.video.currentTime / els.video.duration) * 100}%`;
      updateSliderAria();
    },
    { signal },
  );

  els.progressContainer.addEventListener(
    'pointerdown',
    (event) => {
      if (state.isFallback) return;
      isDragging = true;
      els.progressContainer.setPointerCapture(event.pointerId);
      seekToPointer(event);
    },
    { signal },
  );
  els.progressContainer.addEventListener(
    'pointermove',
    (event) => {
      if (isDragging) seekToPointer(event);
    },
    { signal },
  );
  els.progressContainer.addEventListener('pointerup', endDrag, { signal });
  els.progressContainer.addEventListener('pointercancel', endDrag, { signal });

  els.progressContainer.addEventListener(
    'keydown',
    (event) => {
      const duration = els.video.duration;
      if (state.isFallback || !Number.isFinite(duration) || duration <= 0) return;
      let next: number;
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          next = Math.min(els.video.currentTime + KEY_SEEK_SECONDS, duration);
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          next = Math.max(els.video.currentTime - KEY_SEEK_SECONDS, 0);
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = duration;
          break;
        default:
          return;
      }
      event.preventDefault();
      els.video.currentTime = next;
      els.progressActive.style.width = `${(next / duration) * 100}%`;
      updateSliderAria();
    },
    { signal },
  );
}

/** Clicking the video surface (anything outside the controls) closes. */
function bindCloseSurface(els: OverlayElements, close: () => void, signal: AbortSignal): void {
  els.overlay.addEventListener(
    'click',
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('#video-overlay__controls, #video-overlay__mobile-close-btn')) return;
      close();
    },
    { signal },
  );
  els.mobileCloseBtn.addEventListener('click', close, { signal });
}

function createOverlayController(
  els: OverlayElements,
  opts?: VideoOverlayOptions,
): VideoOverlayController {
  const runtime = getAppRuntime();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touchOnly = window.matchMedia('(hover: none)').matches;
  const follower =
    reducedMotion || touchOnly ? null : createCursorFollower(els.overlay, els.cursor);
  const state: OverlayState = { isOpen: false, isFallback: false };
  const abortController = new AbortController();
  let disposed = false;
  // Body-level siblings of the overlay made `inert` while open, so focus
  // stays contained in the dialog. Restored exactly on close (finishClose).
  let inertedSiblings: Array<{ element: HTMLElement; wasInert: boolean }> = [];
  let previousDocumentOverflow = '';

  /**
   * Make every <body> child except #video-overlay inert. The overlay is a
   * direct child of <body> (sibling of #ui and #transition-overlay), so
   * inerting its siblings keeps Tab from escaping behind the opaque layer
   * without touching anything inside the dialog.
   */
  function applyInert(): void {
    inertedSiblings = [];
    for (const child of Array.from(document.body.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (child === els.overlay) continue;
      inertedSiblings.push({ element: child, wasInert: child.inert });
      child.inert = true;
    }
  }

  /** Reverse applyInert() exactly. */
  function clearInert(): void {
    for (const { element, wasInert } of inertedSiblings) element.inert = wasInert;
    inertedSiblings = [];
  }

  function open(): void {
    if (state.isOpen || disposed) return;
    state.isOpen = true;
    runtime.setOverlay('video');
    els.overlay.style.display = 'block';
    els.overlay.setAttribute('aria-hidden', 'false');
    // Belt and braces alongside the orchestrator's Lenis stop via onOpen.
    previousDocumentOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    applyInert();
    if (reducedMotion) {
      els.overlay.style.opacity = '1';
    } else {
      gsap.killTweensOf(els.overlay);
      gsap.fromTo(
        els.overlay,
        { opacity: 0 },
        { opacity: 1, duration: FADE_DURATION, ease: 'power2.out' },
      );
    }
    if (!state.isFallback) {
      if (els.video.readyState === HTMLMediaElement.HAVE_NOTHING) {
        // preload="none" suspends the fetch at parse time; force it so a
        // bogus/missing source errors promptly and the fallback can react.
        els.video.load();
      }
      void els.video.play().catch(() => {
        /* autoplay blocked or asset missing: paused state / fallback shows */
      });
    }
    follower?.start();
    els.overlay.focus({ preventScroll: true });
    opts?.onOpen?.();
  }

  function finishClose(): void {
    els.overlay.style.display = 'none';
    els.overlay.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = previousDocumentOverflow;
    // Un-inert before restoring focus: the trigger lives under #ui and an
    // inert element refuses focus.
    clearInert();
    runtime.setOverlay('none');
    opts?.onClose?.();
    els.trigger?.focus();
  }

  function close(): void {
    if (!state.isOpen || disposed) return;
    state.isOpen = false;
    els.video.pause();
    follower?.stop();
    if (reducedMotion) {
      finishClose();
    } else {
      gsap.killTweensOf(els.overlay);
      gsap.to(els.overlay, {
        opacity: 0,
        duration: FADE_DURATION,
        ease: 'power2.in',
        onComplete: finishClose,
      });
    }
  }

  bindFallback(els, state, abortController.signal);
  bindPlaybackControls(els, state, abortController.signal);
  bindProgress(els, state, abortController.signal);
  bindCloseSurface(els, close, abortController.signal);
  els.trigger?.addEventListener('click', open, { signal: abortController.signal });
  const unregisterEscape = runtime.registerEscapeHandler('video', close);

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    abortController.abort();
    unregisterEscape();
    gsap.killTweensOf(els.overlay);
    follower?.stop();
    els.video.pause();
    state.isOpen = false;
    clearInert();
    document.documentElement.style.overflow = previousDocumentOverflow;
    els.overlay.style.display = 'none';
    els.overlay.setAttribute('aria-hidden', 'true');
    if (runtime.getState().overlay === 'video') runtime.setOverlay('none');
  }

  return { open, close, dispose };
}

/**
 * Wires the fullscreen showreel overlay. Safe to call when the markup is
 * absent (returns a no-op controller). The orchestrator should stop/start
 * Lenis in onOpen/onClose.
 */
export function setupVideoOverlay(opts?: VideoOverlayOptions): VideoOverlayController {
  const els = queryOverlayElements();
  if (!els) {
    return {
      open: (): void => undefined,
      close: (): void => undefined,
      dispose: (): void => undefined,
    };
  }
  return createOverlayController(els, opts);
}
