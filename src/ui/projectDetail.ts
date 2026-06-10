import gsap from 'gsap';

/**
 * Project-open flow: clicking a featured tile wipes a full-screen detail
 * panel up over the page (the real site navigates to /projects/<slug> behind
 * the same gesture), reveals the project's media + type, and reverses on
 * close. Content is harvested from the clicked tile so the overlay always
 * matches what was clicked.
 */

interface ProjectDetailOptions {
  onOpen?: () => void;
  onClose?: () => void;
}

interface OverlayElements {
  overlay: HTMLElement;
  inner: HTMLElement;
  scroller: HTMLElement;
  hero: HTMLElement;
  media: HTMLElement;
  video: HTMLVideoElement;
  meta: HTMLElement;
  titleInner: HTMLElement;
  closeBtn: HTMLElement;
}

function queryElements(): OverlayElements | null {
  const overlay = document.getElementById('project-overlay');
  const inner = document.getElementById('project-overlay-inner');
  const scroller = document.getElementById('project-overlay-scroll');
  const hero = document.getElementById('project-overlay-hero');
  const media = document.getElementById('project-overlay-media');
  const video = document.getElementById('project-overlay-video');
  const meta = document.getElementById('project-overlay-meta');
  const title = document.getElementById('project-overlay-title');
  const closeBtn = document.getElementById('project-overlay-close');
  const titleInner = title?.querySelector<HTMLElement>('.title-inner') ?? null;

  if (
    !overlay ||
    !inner ||
    !scroller ||
    !hero ||
    !media ||
    !(video instanceof HTMLVideoElement) ||
    !meta ||
    !titleInner ||
    !closeBtn
  ) {
    return null;
  }

  return { overlay, inner, scroller, hero, media, video, meta, titleInner, closeBtn };
}

export function setupProjectDetail(opts?: ProjectDetailOptions): void {
  const els = queryElements();
  if (!els) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let isOpen = false;
  let lastTrigger: HTMLElement | null = null;

  function populate(item: HTMLElement): void {
    if (!els) return;
    const name = item.querySelector('.project-item-name')?.textContent?.trim() ?? 'Project';
    const metaText = item.querySelector('.project-item-line-1')?.textContent?.trim() ?? '';
    const toggle = item.querySelector('.project-item-toggle')?.textContent?.trim() ?? '';
    const tileMedia = item.querySelector<HTMLElement>('.project-item-media');
    const tileVideo = item.querySelector<HTMLVideoElement>('.project-item-video');

    els.titleInner.textContent = name;
    els.meta.textContent = toggle ? `${metaText} · ${toggle}` : metaText;
    els.media.style.backgroundImage = tileMedia?.style.backgroundImage ?? '';

    const src = tileVideo?.dataset.src ?? '';
    els.video.classList.remove('is-playing');
    if (src) {
      if (els.video.getAttribute('src') !== src) els.video.setAttribute('src', src);
    } else {
      els.video.removeAttribute('src');
    }
  }

  function startVideo(): void {
    if (!els || !els.video.getAttribute('src')) return;
    void els.video
      .play()
      .then(() => els.video.classList.add('is-playing'))
      .catch(() => {
        /* autoplay blocked: poster background stays */
      });
  }

  function open(item: HTMLElement): void {
    if (!els || isOpen) return;
    isOpen = true;
    lastTrigger = item;
    populate(item);

    els.scroller.scrollTop = 0;
    els.overlay.classList.add('is-open');
    els.overlay.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    opts?.onOpen?.();

    if (reducedMotion) {
      gsap.set(els.inner, { y: 0 });
      gsap.set([els.hero, els.meta, els.titleInner], { clearProps: 'all' });
      startVideo();
      els.overlay.focus({ preventScroll: true });
      return;
    }

    gsap
      .timeline({ defaults: { ease: 'power4.out' } })
      .fromTo(els.inner, { yPercent: 100 }, { yPercent: 0, duration: 0.75, ease: 'expo.out' }, 0)
      .fromTo(
        els.hero,
        { scale: 1.08, clipPath: 'inset(14% round 20px)' },
        { scale: 1, clipPath: 'inset(0% round 20px)', duration: 1.0 },
        0.3,
      )
      .fromTo(els.meta, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6 }, 0.45)
      .fromTo(els.titleInner, { yPercent: 110 }, { yPercent: 0, duration: 0.8 }, 0.5)
      .call(() => {
        startVideo();
        els.overlay.focus({ preventScroll: true });
      }, undefined, 0.55);
  }

  function close(): void {
    if (!els || !isOpen) return;
    isOpen = false;
    document.removeEventListener('keydown', onKeyDown);
    els.video.pause();

    const finish = (): void => {
      if (!els) return;
      els.overlay.classList.remove('is-open');
      els.overlay.setAttribute('aria-hidden', 'true');
      document.documentElement.style.overflow = '';
      opts?.onClose?.();
      lastTrigger?.focus();
    };

    if (reducedMotion) {
      finish();
      return;
    }

    gsap.to(els.inner, { yPercent: 100, duration: 0.55, ease: 'power3.in', onComplete: finish });
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') close();
  }

  els.closeBtn.addEventListener('click', close);

  for (const item of Array.from(document.querySelectorAll<HTMLElement>('.project-item'))) {
    item.addEventListener('click', (event) => {
      event.preventDefault();
      open(item);
    });
  }
}
