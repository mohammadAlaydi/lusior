/*
 * Web Audio sound engine for the Reevez portfolio experience.
 *
 * Two self-hosted/original layers:
 *
 *  1. UI SFX — fully SYNTHESIZED in Web Audio (zero asset weight). Short
 *     oscillator + gain envelopes, kept quiet and tasteful because they fire a
 *     lot. Variants are chosen round-robin so repeated hovers/clicks vary.
 *       hover  3 variants — soft high tick, low volume
 *       click  2 variants — crisper two-tone blip
 *       focus  1 tick      — very soft (vol ~0.4)
 *       page   1 whoosh    — filtered noise sweep for page transitions
 *       glass  1 cluster   — bright shattered blip (brief, optional)
 *
 *  2. Music — looping background loops loaded as HTMLAudioElement from
 *     /assets/audios/{id}.{ext}, trying ['webm','ogg','mp3'] in order.
 *     setScene() crossfades between scene tracks over ~1s.
 *
 *     EXPECTED FILES (drop AI-generated original loops here later; the engine
 *     works perfectly with ZERO of them present — SFX still play):
 *       public/assets/audios/ambient.{webm|ogg|mp3}    -> 'home' and 'project'
 *       public/assets/audios/cinematic.{webm|ogg|mp3}  -> 'tunnel'
 *       public/assets/audios/end.{webm|ogg|mp3}        -> 'end'
 *
 *     NOTE: Vite serves missing files as 200 text/html (SPA fallback), so a
 *     stray <audio> may never fire 'error' on its own. We therefore treat
 *     "no canplay within a timeout / decode failure" as "track absent" and
 *     silently skip it — no console noise, no broken playback.
 *
 * Gating: the header #sound-btn toggles enabled state, persisted to
 * localStorage('sound-enabled'), defaulting to OFF (autoplay-friendly — music
 * only starts once the user opts in). The AudioContext starts suspended until
 * the first user gesture (unlock()). Older browsers without AudioContext
 * degrade to a no-op (SFX silent) while the music layer still works.
 *
 * prefers-reduced-motion does NOT disable sound (sound != motion); we just keep
 * volumes gentle regardless.
 */

export type UiSound = 'hover' | 'click' | 'focus' | 'page' | 'glass';
export type Scene = 'home' | 'project' | 'tunnel' | 'end';

export interface SoundEngine {
  /** Resume the AudioContext on the first user gesture. Idempotent. */
  unlock(): void;
  /** Flip enabled state, persist it, resume/suspend audio. Returns new state. */
  toggle(): boolean;
  /** Force enabled state (used to hydrate from storage / external control). */
  setEnabled(on: boolean): void;
  isEnabled(): boolean;
  /** Play a one-shot synthesized UI sound. No-op when disabled or locked. */
  playUI(kind: UiSound): void;
  /** Crossfade the looping music to the track for this scene. */
  setScene(scene: Scene): void;
  /** Temporarily silence audio without changing the persisted user preference. */
  setSuspended(suspended: boolean): void;
  /** Release media, AudioContext, and global interaction listeners. */
  dispose(): void;
}

interface SoundEngineOptions {
  /** Id of the header toggle button. Defaults to 'sound-btn'. */
  buttonId?: string;
}

const STORAGE_KEY = 'sound-enabled';
const BUTTON_ON_CLASS = 'is-sound-on';
const AUDIO_BASE = '/assets/audios';
// m4a first: the bundled AI-generated loops are AAC/.m4a, so probing it first
// avoids waiting out the timeout on the other extensions before it is found.
const AUDIO_EXTENSIONS = ['m4a', 'webm', 'ogg', 'mp3'] as const;

/** Master ceiling — everything sits well below 1 so the page never blasts. */
const MASTER_VOLUME = 0.6;
const MUSIC_VOLUME = 0.45;
const CROSSFADE_SECONDS = 1;
/** A music <audio> that hasn't reported canplay by now is treated as absent. */
const TRACK_LOAD_TIMEOUT_MS = 1500;
/** Don't replay hover more often than this (rapid pointer moves spam it). */
const HOVER_THROTTLE_MS = 60;

/** Music track ids per scene (file basenames under AUDIO_BASE). */
const SCENE_TRACKS: Record<Scene, string> = {
  home: 'ambient',
  project: 'ambient',
  tunnel: 'cinematic',
  end: 'end',
};

/** Per-scene music gain multiplier (project ducks the shared ambient bed). */
const SCENE_GAIN: Record<Scene, number> = {
  home: 1,
  project: 0.7,
  tunnel: 1,
  end: 0.9,
};

type AudioContextCtor = new () => AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function readStoredEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    // Private mode / disabled storage — default OFF, never throw.
    return false;
  }
}

function writeStoredEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(on));
  } catch {
    // Persistence is best-effort; ignore storage failures.
  }
}

/**
 * One looping music track wrapped around an HTMLAudioElement. Resolves its own
 * availability lazily and crossfades via element volume (kept off the Web Audio
 * graph so it works even when AudioContext is unavailable).
 */
class MusicTrack {
  private readonly el: HTMLAudioElement;
  private readonly available: Promise<boolean>;
  private fadeRaf = 0;
  private fadeFrom = 0;
  private fadeTo = 0;
  private fadeStart = 0;
  private fadeDurationMs = 0;
  private disposed = false;

  constructor(id: string) {
    this.el = new Audio();
    this.el.loop = true;
    this.el.preload = 'metadata';
    this.el.volume = 0;
    this.el.crossOrigin = 'anonymous';
    this.available = this.resolveSource(id);
  }

  /**
   * Probe every candidate extension in parallel via disposable <audio>
   * elements — the first to report canplay(through) wins and its URL becomes
   * `this.el`'s source; the rest are cancelled. Bounded by one shared
   * timeout instead of one per extension (sequential worst case was up to
   * ~6s for a wholly-absent track; this is ~1.5s). Vite's SPA fallback hands
   * back 200 text/html for a missing file, so 'error' alone isn't reliable —
   * the timeout remains the authoritative "nothing panned out" signal.
   */
  private resolveSource(id: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let errorCount = 0;
      const cleanups: Array<() => void> = [];

      const finish = (ok: boolean, src?: string): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        for (const cleanup of cleanups) cleanup();
        if (ok && src && !this.disposed) {
          this.el.src = src;
          this.el.load();
        }
        resolve(ok);
      };

      const timer = window.setTimeout(() => finish(false), TRACK_LOAD_TIMEOUT_MS);

      for (const ext of AUDIO_EXTENSIONS) {
        const probe = new Audio();
        probe.preload = 'metadata';
        probe.crossOrigin = 'anonymous';
        const src = `${AUDIO_BASE}/${id}.${ext}`;

        const onReady = (): void => finish(true, src);
        const onError = (): void => {
          errorCount += 1;
          if (errorCount === AUDIO_EXTENSIONS.length) finish(false);
        };

        probe.addEventListener('canplaythrough', onReady);
        probe.addEventListener('canplay', onReady);
        probe.addEventListener('error', onError);
        cleanups.push(() => {
          probe.removeEventListener('canplaythrough', onReady);
          probe.removeEventListener('canplay', onReady);
          probe.removeEventListener('error', onError);
          probe.src = ''; // abort any in-flight fetch for a losing candidate
          probe.load();
        });

        probe.src = src;
        probe.load();
      }
    });
  }

  /** Fade element volume to `target` over `durationMs`; auto play/pause. */
  async fadeTo_(target: number, durationMs: number): Promise<void> {
    if (!(await this.available) || this.disposed) return;

    if (target > 0 && this.el.paused) {
      try {
        await this.el.play();
      } catch {
        // Autoplay was blocked (no gesture yet) — give up quietly; the next
        // setScene after a gesture will retry.
        return;
      }
    }

    window.cancelAnimationFrame(this.fadeRaf);
    this.fadeFrom = this.el.volume;
    this.fadeTo = Math.max(0, Math.min(1, target));
    this.fadeStart = performance.now();
    this.fadeDurationMs = Math.max(1, durationMs);

    const step = (now: number): void => {
      const t = Math.min(1, (now - this.fadeStart) / this.fadeDurationMs);
      const v = this.fadeFrom + (this.fadeTo - this.fadeFrom) * t;
      this.el.volume = Math.max(0, Math.min(1, v));
      if (t < 1) {
        this.fadeRaf = window.requestAnimationFrame(step);
      } else if (this.fadeTo === 0) {
        this.el.pause();
      }
    };
    this.fadeRaf = window.requestAnimationFrame(step);
  }

  stop(): void {
    window.cancelAnimationFrame(this.fadeRaf);
    this.el.pause();
    this.el.volume = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.el.removeAttribute('src');
    this.el.load();
  }
}

/**
 * The full engine. SFX run through a single AudioContext + master GainNode;
 * music runs as crossfaded HTMLAudioElements so it survives a missing context.
 */
class WebAudioSoundEngine implements SoundEngine {
  private readonly ctx: AudioContext | null;
  private readonly master: GainNode | null;
  private unlocked = false;
  private enabled: boolean;
  private disposed = false;
  private suspended = false;
  private readonly abortController = new AbortController();

  private readonly button: HTMLElement | null;

  // Music
  private readonly tracks = new Map<string, MusicTrack>();
  private currentTrackId: string | null = null;
  private currentScene: Scene | null = null;

  // SFX round-robin counters
  private readonly variantIndex: Record<UiSound, number> = {
    hover: 0,
    click: 0,
    focus: 0,
    page: 0,
    glass: 0,
  };
  private lastHoverAt = 0;

  constructor(options: SoundEngineOptions) {
    const Ctor = getAudioContextCtor();
    if (Ctor) {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER_VOLUME;
      this.master.connect(this.ctx.destination);
    } else {
      // No Web Audio — SFX degrade to no-op; music layer still works.
      this.ctx = null;
      this.master = null;
    }

    this.enabled = readStoredEnabled();
    this.button = document.getElementById(options.buttonId ?? 'sound-btn');

    this.reflectButton();
    this.wireButton();
    this.wireFirstGesture();
    this.wireDelegatedSfx();
  }

  // --- public API --------------------------------------------------------

  unlock(): void {
    if (this.unlocked || this.disposed) return;
    this.unlocked = true;
    if (this.ctx && this.ctx.state === 'suspended') {
      // resume() returns a promise; failure just leaves us locked-but-flagged.
      void this.ctx.resume().catch(() => {
        this.unlocked = false;
      });
    }
    // If the user already enabled sound before the gesture, start the music now.
    if (this.enabled && !this.suspended && this.currentScene) {
      this.applyScene(this.currentScene);
    }
  }

  toggle(): boolean {
    if (this.disposed) return false;
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  setEnabled(on: boolean): void {
    if (this.disposed) return;
    if (on === this.enabled) {
      this.reflectButton();
      return;
    }
    this.enabled = on;
    writeStoredEnabled(on);
    this.reflectButton();

    if (on) {
      this.unlock();
      if (!this.suspended && this.currentScene) this.applyScene(this.currentScene);
    } else {
      this.stopAllMusic();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  playUI(kind: UiSound): void {
    if (
      this.disposed ||
      this.suspended ||
      !this.enabled ||
      !this.unlocked ||
      !this.ctx ||
      !this.master
    )
      return;
    if (this.ctx.state !== 'running') return;

    if (kind === 'hover') {
      const now = performance.now();
      if (now - this.lastHoverAt < HOVER_THROTTLE_MS) return;
      this.lastHoverAt = now;
    }

    const variant = this.nextVariant(kind);
    this.synth(kind, variant);
  }

  setScene(scene: Scene): void {
    if (this.disposed) return;
    this.currentScene = scene;
    if (!this.enabled || this.suspended) return;
    this.applyScene(scene);
  }

  setSuspended(suspended: boolean): void {
    if (this.disposed || suspended === this.suspended) return;
    this.suspended = suspended;
    if (suspended) {
      for (const track of this.tracks.values()) track.stop();
      return;
    }
    if (this.enabled && this.currentScene) this.applyScene(this.currentScene);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abortController.abort();
    for (const track of this.tracks.values()) track.dispose();
    this.tracks.clear();
    this.currentTrackId = null;
    this.currentScene = null;
    this.enabled = false;
    this.reflectButton();
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close().catch(() => undefined);
    }
  }

  // --- music -------------------------------------------------------------

  private applyScene(scene: Scene): void {
    // Guarded/idempotent: a returning visitor with sound already enabled
    // (persisted from a prior session) may still be locked if their first
    // interaction hasn't reached wireFirstGesture yet — retry here so the
    // very next scene switch after any gesture recovers audio. All call
    // sites into applyScene already guarantee `enabled === true`.
    this.unlock();

    const trackId = SCENE_TRACKS[scene];
    const targetVolume = MUSIC_VOLUME * SCENE_GAIN[scene];

    if (this.currentTrackId === trackId) {
      // Same bed, different ducking (e.g. home -> project) — just re-balance.
      void this.getTrack(trackId).fadeTo_(targetVolume, CROSSFADE_SECONDS * 1000);
      return;
    }

    const previous = this.currentTrackId;
    this.currentTrackId = trackId;

    if (previous) {
      void this.getTrack(previous).fadeTo_(0, CROSSFADE_SECONDS * 1000);
    }
    void this.getTrack(trackId).fadeTo_(targetVolume, CROSSFADE_SECONDS * 1000);
  }

  private getTrack(id: string): MusicTrack {
    const existing = this.tracks.get(id);
    if (existing) return existing;
    const created = new MusicTrack(id);
    this.tracks.set(id, created);
    return created;
  }

  private stopAllMusic(): void {
    for (const track of this.tracks.values()) {
      void track.fadeTo_(0, CROSSFADE_SECONDS * 1000);
    }
    this.currentTrackId = null;
  }

  // --- SFX synthesis -----------------------------------------------------

  private nextVariant(kind: UiSound): number {
    const counts: Record<UiSound, number> = {
      hover: 3,
      click: 2,
      focus: 1,
      page: 1,
      glass: 1,
    };
    const i = this.variantIndex[kind] % counts[kind];
    this.variantIndex[kind] = (this.variantIndex[kind] + 1) % counts[kind];
    return i;
  }

  /** Route to the right synth recipe; ctx/master are guaranteed non-null here. */
  private synth(kind: UiSound, variant: number): void {
    switch (kind) {
      case 'hover':
        this.tick([1760, 2093, 2349][variant] ?? 1760, 0.05, 0.06);
        break;
      case 'focus':
        this.tick(1568, 0.06, 0.045);
        break;
      case 'click':
        this.blip(variant);
        break;
      case 'page':
        this.whoosh();
        break;
      case 'glass':
        this.glass();
        break;
    }
  }

  /** Soft sine tick with a fast exponential decay — used for hover/focus. */
  private tick(freq: number, durationSec: number, peak: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + durationSec + 0.02);
  }

  /** Two-tone blip for clicks: a quick rising or falling pair of triangles. */
  private blip(variant: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const pairs: ReadonlyArray<readonly [number, number]> = [
      [880, 1320],
      [1320, 990],
    ];
    const [a, b] = pairs[variant] ?? pairs[0];
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(a, t0);
    osc.frequency.exponentialRampToValueAtTime(b, t0 + 0.07);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);

    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + 0.14);
  }

  /** Filtered noise sweep for page transitions — a short airy whoosh. */
  private whoosh(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const t0 = ctx.currentTime;
    const duration = 0.55;
    const buffer = this.noiseBuffer(duration);
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(400, t0);
    filter.frequency.exponentialRampToValueAtTime(3200, t0 + duration * 0.6);
    filter.frequency.exponentialRampToValueAtTime(700, t0 + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  /** Bright shattered cluster — a few detuned high triangles in quick stagger. */
  private glass(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const t0 = ctx.currentTime;
    const freqs = [2637, 3136, 3520, 4186];
    freqs.forEach((freq, i) => {
      const start = t0 + i * 0.012;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.07, start + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain).connect(master);
      osc.start(start);
      osc.stop(start + 0.18);
    });
  }

  /** White-noise buffer for the whoosh; ctx guaranteed non-null by callers. */
  private noiseBuffer(durationSec: number): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // --- button + gesture wiring ------------------------------------------

  private reflectButton(): void {
    if (!this.button) return;
    this.button.setAttribute('aria-pressed', String(this.enabled));
    this.button.classList.toggle(BUTTON_ON_CLASS, this.enabled);
  }

  private wireButton(): void {
    this.button?.addEventListener(
      'click',
      () => {
        this.unlock();
        this.toggle();
      },
      { signal: this.abortController.signal },
    );
  }

  private wireFirstGesture(): void {
    const onFirst = (): void => {
      this.unlock();
      window.removeEventListener('pointerdown', onFirst);
      window.removeEventListener('keydown', onFirst);
      window.removeEventListener('wheel', onFirst);
      window.removeEventListener('touchstart', onFirst);
    };
    window.addEventListener('pointerdown', onFirst, {
      passive: true,
      signal: this.abortController.signal,
    });
    window.addEventListener('keydown', onFirst, { signal: this.abortController.signal });
    // A wheel-scrolling visitor never fires pointerdown/keydown — cover the
    // scroll-only path too, plus touch, so the AudioContext still unlocks.
    window.addEventListener('wheel', onFirst, {
      passive: true,
      signal: this.abortController.signal,
    });
    window.addEventListener('touchstart', onFirst, {
      passive: true,
      signal: this.abortController.signal,
    });
  }

  /**
   * Global SFX via event delegation — one set of listeners on document, not
   * per element. Interactive = <a>, <button>, or anything with [data-sfx].
   */
  private wireDelegatedSfx(): void {
    document.addEventListener(
      'pointerover',
      (event) => {
        if (!this.enabled) return;
        if (this.isInteractive(event.target)) this.playUI('hover');
      },
      { passive: true, capture: true, signal: this.abortController.signal },
    );

    document.addEventListener(
      'pointerdown',
      (event) => {
        if (!this.enabled) return;
        if (this.isInteractive(event.target)) this.playUI('click');
      },
      { passive: true, capture: true, signal: this.abortController.signal },
    );

    document.addEventListener(
      'focusin',
      (event) => {
        if (!this.enabled) return;
        if (this.isInteractive(event.target)) this.playUI('focus');
      },
      { capture: true, passive: true, signal: this.abortController.signal },
    );
  }

  private isInteractive(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('a, button, [data-sfx]'));
  }
}

/**
 * Build the sound engine, wire the header toggle (#sound-btn by default),
 * hydrate enabled state from localStorage (default OFF), and attach the
 * delegated hover/click/focus SFX + first-gesture unlock listeners.
 */
export function createSoundEngine(opts?: SoundEngineOptions): SoundEngine {
  return new WebAudioSoundEngine(opts ?? {});
}
