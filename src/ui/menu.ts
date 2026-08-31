/**
 * Header menu panel behavior:
 *  - the existing #menu-btn toggles the .--opened card stack (#header-menu)
 *  - Escape and clicks outside the panel/button close it
 *  - nav links smooth-scroll to their section then close the menu; while a
 *    project detail page covers the home page they route home first (see
 *    setMenuNavigate below)
 *  - the newsletter form validates inline, then submits to the API
 * All motion is CSS-transition driven (menu.css), including the
 * prefers-reduced-motion fade fallback, so no GSAP is needed here.
 */

import { isValidEmail, subscribeNewsletter } from './newsletterClient';
import { getAppRuntime } from '../core/appRuntime';
import { getLenis } from './scroll';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Matches ui/transition.ts's cover timing (two 550ms halves either side of
// the DOM swap) — long enough that the wipe has fully covered the viewport
// before the scroll happens underneath it.
const PROJECT_CLOSE_SCROLL_DELAY_MS = 900;

type ScrollDestination = 'top' | 'bottom' | '#featured' | '#goal';

// DOM order of the .header-menu-link nodes in index.html: Home, About us,
// Projects, Contact — keyed by their visible label text (lowercased).
const LINK_DESTINATIONS: Record<string, ScrollDestination> = {
  home: 'top',
  'about us': '#goal',
  projects: '#featured',
  contact: 'bottom',
};

// Set by main.ts once the Router exists — see setMenuNavigate below.
let menuNavigate: ((path: string) => void) | null = null;

export interface HeaderMenuController {
  dispose(): void;
}

/**
 * Lets main.ts hand this module the Router's navigate function, so nav links
 * can route back to '/' when a project detail page is open. main.ts must
 * call this once after creating the router:
 *   setMenuNavigate(router.navigate);
 */
export function setMenuNavigate(fn: (path: string) => void): void {
  menuNavigate = fn;
}

export function clearMenuNavigate(): void {
  menuNavigate = null;
}

/** Smooth-scrolls to a section via Lenis, falling back to native scrolling. */
function scrollToDestination(destination: ScrollDestination, force = false): void {
  const immediate = prefersReducedMotion();
  const lenis = getLenis();

  if (lenis) {
    // `force` executes the scroll even while Lenis is stopped. The route-home
    // path needs it: the delayed call below fires while the detail layer's
    // close choreography still has Lenis stopped (start() lands at ~950ms+),
    // and a stopped Lenis silently drops plain scrollTo calls. The wipe is
    // still covering the viewport at that moment, so nothing visibly jumps.
    lenis.scrollTo(destination, { immediate, force });
    return;
  }

  const behavior: ScrollBehavior = immediate ? 'auto' : 'smooth';
  if (destination === 'top') {
    window.scrollTo({ top: 0, behavior });
  } else if (destination === 'bottom') {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
  } else {
    document.querySelector(destination)?.scrollIntoView({ behavior, block: 'start' });
  }
}

/**
 * Navigates a menu link. A project detail page sits in a fixed overlay above
 * the home page, so if one is open we route home first and only scroll once
 * the transition cover has had time to settle.
 */
function goToDestination(destination: ScrollDestination): void {
  const projectActive = getAppRuntime().getState().route.kind === 'project';

  if (projectActive && menuNavigate) {
    menuNavigate('/');
    const delay = prefersReducedMotion() ? 0 : PROJECT_CLOSE_SCROLL_DELAY_MS;
    window.setTimeout(() => scrollToDestination(destination, true), delay);
    return;
  }

  scrollToDestination(destination);
}

export function setupHeaderMenu(): HeaderMenuController {
  const runtime = getAppRuntime();
  const button = document.getElementById('menu-btn');
  const panel = document.getElementById('header-menu');
  if (!button || !panel) return { dispose: () => undefined };
  const abortController = new AbortController();
  const listenerOptions = { signal: abortController.signal };

  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'header-menu');

  function isOpen(): boolean {
    return panel?.classList.contains('--opened') ?? false;
  }

  function setOpen(open: boolean): void {
    if (!button || !panel) return;
    panel.classList.toggle('--opened', open);
    panel.setAttribute('aria-hidden', String(!open));
    button.setAttribute('aria-expanded', String(open));
    runtime.setOverlay(open ? 'menu' : 'none');
  }

  button.addEventListener(
    'click',
    () => {
      setOpen(!isOpen());
    },
    listenerOptions,
  );

  const unregisterEscape = runtime.registerEscapeHandler('menu', () => {
    if (!isOpen()) return;
    setOpen(false);
    button.focus();
  });

  document.addEventListener(
    'click',
    (event: MouseEvent) => {
      if (!isOpen()) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panel.contains(target) || button.contains(target)) return;
      setOpen(false);
    },
    listenerOptions,
  );

  // nav links scroll to their section, then dismiss the menu. The hrefs stay
  // '#' — index.html owns that markup — so navigation is handled here.
  const links = panel.querySelectorAll<HTMLAnchorElement>('.header-menu-link');
  for (const link of Array.from(links)) {
    const label = (link.querySelector('.header-menu-link-text')?.textContent ?? '')
      .trim()
      .toLowerCase();
    const destination = LINK_DESTINATIONS[label];

    link.addEventListener(
      'click',
      (event: MouseEvent) => {
        setOpen(false);
        if (!destination) return;
        event.preventDefault();
        goToDestination(destination);
      },
      listenerOptions,
    );
  }

  setupNewsletterForm(abortController.signal);

  return {
    dispose(): void {
      if (isOpen()) setOpen(false);
      abortController.abort();
      unregisterEscape();
      clearMenuNavigate();
    },
  };
}

function setupNewsletterForm(signal: AbortSignal): void {
  const form = document.getElementById('header-menu-newsletter-input');
  const field = document.getElementById('header-menu-newsletter-input-field');
  const message = document.getElementById('header-menu-newsletter-msg');
  const submitButton = document.getElementById('header-menu-newsletter-input-arrow');
  if (!(form instanceof HTMLFormElement) || !(field instanceof HTMLInputElement) || !message) {
    return;
  }

  let pending = false;

  form.addEventListener(
    'submit',
    async (event: SubmitEvent) => {
      event.preventDefault();
      if (pending) return; // guard against double-submit while a request is in flight

      const email = field.value.trim();

      if (!isValidEmail(email)) {
        message.textContent = 'Please enter a valid email address.';
        message.dataset.state = 'error';
        return;
      }

      pending = true;
      form.setAttribute('data-pending', 'true');
      field.disabled = true;
      if (submitButton instanceof HTMLButtonElement) submitButton.disabled = true;

      const result = await subscribeNewsletter(email);

      if (result.ok) {
        message.textContent = 'Thanks — you’re on the list.';
        message.dataset.state = 'success';
        field.value = '';
      } else {
        message.textContent = result.message;
        message.dataset.state = 'error';
      }

      pending = false;
      form.removeAttribute('data-pending');
      field.disabled = false;
      if (submitButton instanceof HTMLButtonElement) submitButton.disabled = false;
    },
    { signal },
  );
}
