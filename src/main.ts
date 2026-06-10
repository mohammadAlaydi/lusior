import './styles/tokens.css';
import './styles/global.css';
import './styles/components.css';
import './styles/header.css';
import './styles/hero.css';
import './styles/reel.css';
import './styles/featured.css';
import './styles/end.css';

import { splitWords } from './ui/splitWords';
import { playIntro, prepareIntro, revealAll } from './ui/intro';
import { setupSmoothScroll } from './ui/scroll';
import { setupReelSection, setupReelVideo } from './ui/reel';
import { setupFeaturedSection } from './ui/featured';
import { setupEndSection } from './ui/end';
import { TrailCursor } from './ui/trailCursor';

function setViewportUnit(): void {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
}

function setupSoundButton(): void {
  const button = document.getElementById('sound-btn');
  button?.addEventListener('click', () => {
    const pressed = button.getAttribute('aria-pressed') === 'true';
    button.setAttribute('aria-pressed', String(!pressed));
  });
}

async function boot(): Promise<void> {
  setViewportUnit();
  window.addEventListener('resize', setViewportUnit);
  setupSoundButton();

  const title = document.getElementById('hero-title');
  const canvas = document.getElementById('webgl') as HTMLCanvasElement | null;
  const container = document.getElementById('hero-visual');

  if (!title || !canvas || !container) {
    throw new Error('Hero markup is missing required elements');
  }

  const words = splitWords(title);
  prepareIntro();

  // Start downloading the heavy chunk (three.js + physics WASM) in parallel
  // with font loading — neither depends on the other.
  const scenePromise = import('./scene/HeroScene');

  setupSmoothScroll();
  setupReelSection();
  setupReelVideo();
  setupFeaturedSection();
  setupEndSection();
  TrailCursor.create();

  // Wait for fonts so the masked word reveal doesn't reflow mid-animation.
  await document.fonts.ready;
  playIntro(words);

  const { HeroScene } = await scenePromise;
  const scene = new HeroScene(canvas, container);
  await scene.start();
}

boot().catch((error) => {
  // Surface boot failures (WebGL/WASM unavailable) instead of a hidden hero.
  revealAll();
  throw error;
});
