import gsap from 'gsap';
import './scroll';
import { isValidEmail, subscribeNewsletter } from './newsletterClient';

/**
 * Footer choreography:
 *  - address: per-line --delta-x staircase shift on hover (CSS transition)
 *  - newsletter: header lines rise out of masks, the input pill background
 *    scales in from the left, then the placeholder fades in (.--active)
 *  - bottom bar: copyright / labs / tagline rise out of their clipped rows
 *  - back-to-top button delegates to the caller-provided scrollToTop
 * Reduced motion skips every GSAP reveal and applies the static end state.
 */

const ADDRESS_SHIFT_EM = 0.4;

export function setupFooterSection(scrollToTop: () => void): void {
  const section = document.getElementById('footer');
  if (!section) return;

  setupAddressStaircase(section);
  setupNewsletterForm();
  setupBackToTop(scrollToTop);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    applyStaticState();
    return;
  }

  setupNewsletterReveal(section);
  setupBottomReveal(section);
}

/** Progressive hover shift: each address line slides a bit further. */
function setupAddressStaircase(section: HTMLElement): void {
  const lines = section.querySelectorAll<HTMLElement>('.footer-address-line-wrapper');
  lines.forEach((line, index) => {
    line.style.setProperty('--delta-x', `${index * ADDRESS_SHIFT_EM}em`);
  });
}

/** Newsletter form: validates locally, then submits to the API. */
function setupNewsletterForm(): void {
  const form = document.getElementById('footer-newsletter-form') as HTMLFormElement | null;
  const field = document.getElementById('footer-newsletter-input-field') as HTMLInputElement | null;
  const feedback = document.getElementById('footer-newsletter-feedback-message');
  const submitButton = document.getElementById('footer-newsletter-input-arrow');
  if (!form || !field || !feedback) return;

  let pending = false;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending) return; // guard against double-submit while a request is in flight

    const email = field.value.trim();
    if (!isValidEmail(email)) {
      feedback.classList.add('error');
      feedback.textContent = 'Please enter a valid email.';
      return;
    }

    pending = true;
    form.setAttribute('data-pending', 'true');
    field.disabled = true;
    if (submitButton instanceof HTMLButtonElement) submitButton.disabled = true;

    const result = await subscribeNewsletter(email);

    if (result.ok) {
      feedback.classList.remove('error');
      feedback.textContent = 'Thanks — you’re on the list.';
      form.reset();
    } else {
      feedback.classList.add('error');
      feedback.textContent = result.message;
    }

    pending = false;
    form.removeAttribute('data-pending');
    field.disabled = false;
    if (submitButton instanceof HTMLButtonElement) submitButton.disabled = false;
  });
}

function setupBackToTop(scrollToTop: () => void): void {
  const button = document.getElementById('footer-bottom-up');
  button?.addEventListener('click', () => scrollToTop());
}

/** Reduced-motion end state: everything visible, no tweens. */
function applyStaticState(): void {
  const bg = document.getElementById('footer-newsletter-bg');
  if (bg) bg.style.transform = 'scaleX(1)';
  document.getElementById('footer-newsletter-input')?.classList.add('--active');
}

/** Wraps an element in an overflow-hidden mask so it can rise into view. */
function wrapInMask(element: HTMLElement, maskClass: string): void {
  const mask = document.createElement('span');
  mask.className = maskClass;
  element.parentNode?.insertBefore(mask, element);
  mask.appendChild(element);
}

function setupNewsletterReveal(section: HTMLElement): void {
  const newsletter = document.getElementById('footer-middle-newsletter');
  const bg = document.getElementById('footer-newsletter-bg');
  const input = document.getElementById('footer-newsletter-input');
  if (!newsletter || !bg || !input) return;

  const lines = Array.from(section.querySelectorAll<HTMLElement>('.footer-newsletter-line'));
  for (const line of lines) {
    wrapInMask(line, 'footer-newsletter-line-mask');
  }

  const timeline = gsap.timeline({
    scrollTrigger: { trigger: newsletter, start: 'top 85%', once: true },
  });

  if (lines.length) {
    gsap.set(lines, { yPercent: 110 });
    timeline.to(lines, { yPercent: 0, duration: 1, ease: 'power4.out', stagger: 0.06 }, 0);
  }

  gsap.set(bg, { scaleX: 0, transformOrigin: 'left' });
  timeline.to(bg, { scaleX: 1, duration: 1, ease: 'power4.out' }, 0.15);
  timeline.call(() => input.classList.add('--active'));
}

function setupBottomReveal(section: HTMLElement): void {
  const bottom = document.getElementById('footer-bottom');
  const rows = Array.from(section.querySelectorAll<HTMLElement>('.footer-bottom-reveal'));
  if (!bottom || rows.length === 0) return;

  gsap.set(rows, { yPercent: 110 });
  gsap.to(rows, {
    yPercent: 0,
    duration: 0.9,
    ease: 'power4.out',
    stagger: 0.06,
    // the bottom bar sits at the very end of the page, so trigger close to
    // the viewport bottom — it still fires before max scroll on all heights
    scrollTrigger: { trigger: bottom, start: 'top 98%', once: true },
  });
}
