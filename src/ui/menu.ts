/**
 * Header menu panel behavior:
 *  - the existing #menu-btn toggles the .--opened card stack (#header-menu)
 *  - Escape and clicks outside the panel/button close it
 *  - the newsletter form validates inline and shows a small status message
 * All motion is CSS-transition driven (menu.css), including the
 * prefers-reduced-motion fade fallback, so no GSAP is needed here.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function setupHeaderMenu(): void {
  const button = document.getElementById('menu-btn');
  const panel = document.getElementById('header-menu');
  if (!button || !panel) return;

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
  }

  button.addEventListener('click', () => {
    setOpen(!isOpen());
  });

  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !isOpen()) return;
    setOpen(false);
    button.focus();
  });

  document.addEventListener('click', (event: MouseEvent) => {
    if (!isOpen()) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (panel.contains(target) || button.contains(target)) return;
    setOpen(false);
  });

  // choosing a destination dismisses the menu
  const links = panel.querySelectorAll<HTMLAnchorElement>('.header-menu-link');
  for (const link of Array.from(links)) {
    link.addEventListener('click', () => {
      setOpen(false);
    });
  }

  setupNewsletterForm();
}

function setupNewsletterForm(): void {
  const form = document.getElementById('header-menu-newsletter-input');
  const field = document.getElementById('header-menu-newsletter-input-field');
  const message = document.getElementById('header-menu-newsletter-msg');
  if (
    !(form instanceof HTMLFormElement) ||
    !(field instanceof HTMLInputElement) ||
    !message
  ) {
    return;
  }

  form.addEventListener('submit', (event: SubmitEvent) => {
    event.preventDefault();
    const email = field.value.trim();

    if (!EMAIL_PATTERN.test(email)) {
      message.textContent = 'Please enter a valid email address.';
      message.dataset.state = 'error';
      return;
    }

    message.textContent = 'Thanks — you’re on the list.';
    message.dataset.state = 'success';
    field.value = '';
  });
}
