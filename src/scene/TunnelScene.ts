import * as THREE from 'three';

/**
 * Scroll-scrubbed gem tunnel. The camera flies forward through a long field
 * of tumbling faceted gems on near-black as scroll progress goes 0 -> 1.
 * Original content — evokes the reference's diamond scene without copying
 * any of its assets.
 */

interface GemSeed {
  readonly position: THREE.Vector3;
  readonly scale: THREE.Vector3;
  readonly axis: THREE.Vector3;
  readonly speed: number;
  readonly phase: number;
}

interface PaletteEntry {
  readonly color: number;
  readonly weight: number;
}

const GEM_COUNT = 240;
const TUNNEL_DEPTH = 130;
const TUBE_RADIUS_MIN = 2.5;
const TUBE_RADIUS_MAX = 8;
const DEPTH_JITTER = 3;
const ANGLE_JITTER = 0.9;
const SCALE_MIN = 0.25;
const SCALE_MAX = 1.1;
const SQUASH_MIN = 0.7;
const SQUASH_MAX = 1.3;
const TUMBLE_SPEED_MIN = 0.3;
const TUMBLE_SPEED_MAX = 1.2;

const CAMERA_FOV = 60;
const CAMERA_START_Z = 4;
const CAMERA_TRAVEL = 120;
const LOOK_AHEAD = 8;
const SWAY_X = 0.6;
const SWAY_Y = 0.4;
const GLOW_LEAD = 5;

/** Only gems this close to the camera tumble; farther ones are fog-hidden. */
const TUMBLE_RADIUS = 40;
const SCRUB_SMOOTHING = 0.08;
const STATIC_PROGRESS = 0.35;
const MAX_DPR = 2;
const MAX_FRAME_DELTA = 0.1;
const RESIZE_DEBOUNCE_MS = 150;

const FOG_COLOR = 0x0b0c10; // matches the CSS backdrop behind the canvas
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Icy gem palette; weights sum to 1. */
const PALETTE: readonly PaletteEntry[] = [
  { color: 0xffffff, weight: 0.3 },
  { color: 0xcfe6ff, weight: 0.25 },
  { color: 0x9fd8ff, weight: 0.15 },
  { color: 0x6f8cff, weight: 0.12 },
  { color: 0x8832f7, weight: 0.1 },
  { color: 0x1a2ffb, weight: 0.08 },
];

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpColor = new THREE.Color();

export class TunnelScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private readonly reducedMotion: boolean;
  private readonly seeds: GemSeed[] = [];

  private gems?: THREE.InstancedMesh;
  private geometry?: THREE.OctahedronGeometry;
  private material?: THREE.MeshStandardMaterial;
  private glow?: THREE.PointLight;

  private targetProgress = 0;
  private actualProgress = 0;
  private elapsed = 0;
  private rafId = 0;
  private running = false;
  private shouldRun = false;
  private started = false;

  private resizeObserver?: ResizeObserver;
  private resizeTimer = 0;
  private lastWidth = 0;
  private lastHeight = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // alpha: true — the canvas is transparent over a near-black CSS backdrop,
    // so the fog colour (same hex) blends gems seamlessly into the page.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene.fog = new THREE.Fog(FOG_COLOR, 10, 70); // gems emerge from darkness

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 160);
  }

  /** Builds the scene and renders the first frame (even while inactive). */
  start(): void {
    if (this.started) return;
    this.started = true;

    if (this.reducedMotion) {
      // No animation loop, ever: a single static frame mid-tunnel.
      this.targetProgress = STATIC_PROGRESS;
      this.actualProgress = STATIC_PROGRESS;
    }

    this.buildLights();
    this.buildGems();
    this.handleResize();
    this.observeResize();
    this.renderFrame();

    if (this.shouldRun && !this.reducedMotion) {
      this.startLoop();
    }
  }

  /** 0..1 scrub target, smoothed internally (jump cut under reduced motion). */
  setProgress(p: number): void {
    this.targetProgress = Number.isFinite(p) ? Math.min(Math.max(p, 0), 1) : 0;
    if (!this.started) return;
    if (this.reducedMotion) {
      this.actualProgress = this.targetProgress;
      this.renderFrame();
    }
  }

  /** Runs/pauses the rAF loop. A no-op under reduced motion (no loop ever). */
  setActive(active: boolean): void {
    this.shouldRun = active;
    if (this.reducedMotion) return;
    if (active) {
      this.startLoop();
    } else {
      this.stopLoop();
    }
  }

  dispose(): void {
    this.stopLoop();
    window.clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
    if (this.gems) {
      this.scene.remove(this.gems);
      this.gems.dispose(); // releases instanceMatrix/instanceColor buffers
    }
    this.geometry?.dispose();
    this.material?.dispose();
    this.renderer.dispose();
  }

  // --- scene setup -------------------------------------------------------

  private buildLights(): void {
    const ambient = new THREE.AmbientLight(0x222233, 0.7);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(-8, 10, 6); // upper-left
    this.scene.add(key);

    // Travels just ahead of the camera so gems flare as they sweep past.
    this.glow = new THREE.PointLight(0x8fb8ff, 18, 30);
    this.scene.add(this.glow);
  }

  private buildGems(): void {
    this.geometry = new THREE.OctahedronGeometry(1, 0);
    this.material = new THREE.MeshStandardMaterial({
      flatShading: true, // flat facets catch the light like cut stones
      metalness: 0.35,
      roughness: 0.18,
    });

    const mesh = new THREE.InstancedMesh(this.geometry, this.material, GEM_COUNT);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; // instances span the whole tunnel depth

    for (let i = 0; i < GEM_COUNT; i++) {
      const seed = createGemSeed(i);
      this.seeds.push(seed);
      tmpQuat.setFromAxisAngle(seed.axis, seed.phase);
      tmpMatrix.compose(seed.position, tmpQuat, seed.scale);
      mesh.setMatrixAt(i, tmpMatrix);
      mesh.setColorAt(i, tmpColor.setHex(pickGemColor()));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }

    this.scene.add(mesh);
    this.gems = mesh;
  }

  // --- frame loop --------------------------------------------------------

  private startLoop(): void {
    if (!this.started || this.running) return;
    this.running = true;
    this.clock.getDelta(); // flush time spent paused so gems do not jump
    this.rafId = requestAnimationFrame(this.loop);
  }

  private stopLoop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly loop = (): void => {
    this.rafId = requestAnimationFrame(this.loop);
    this.elapsed += Math.min(this.clock.getDelta(), MAX_FRAME_DELTA);
    this.actualProgress += (this.targetProgress - this.actualProgress) * SCRUB_SMOOTHING;
    this.renderFrame();
  };

  private renderFrame(): void {
    const cameraZ = this.updateCamera(this.actualProgress);
    this.updateTumble(cameraZ);
    this.renderer.render(this.scene, this.camera);
  }

  /** Positions the camera (and its glow light) along the flight path. */
  private updateCamera(progress: number): number {
    const z = CAMERA_START_Z - progress * CAMERA_TRAVEL;
    const swayX = Math.sin(progress * Math.PI * 2) * SWAY_X;
    const swayY = Math.cos(progress * Math.PI * 1.5) * SWAY_Y;
    this.camera.position.set(swayX, swayY, z);
    this.camera.lookAt(swayX * 0.5, swayY * 0.5, z - LOOK_AHEAD);
    this.glow?.position.set(swayX, swayY, z - GLOW_LEAD);
    return z;
  }

  /** Tumbles only the gems near the camera; distant ones are fog-hidden. */
  private updateTumble(cameraZ: number): void {
    const mesh = this.gems;
    if (!mesh) return;

    let touched = false;
    for (let i = 0; i < this.seeds.length; i++) {
      const seed = this.seeds[i];
      if (Math.abs(seed.position.z - cameraZ) > TUMBLE_RADIUS) continue;
      tmpQuat.setFromAxisAngle(seed.axis, seed.phase + this.elapsed * seed.speed);
      tmpMatrix.compose(seed.position, tmpQuat, seed.scale);
      mesh.setMatrixAt(i, tmpMatrix);
      touched = true;
    }
    if (touched) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // --- sizing ------------------------------------------------------------

  private observeResize(): void {
    const target = this.canvas.parentElement ?? this.canvas;
    // trailing debounce: drag-resizing fires every frame, and each pass
    // reallocates the drawing buffer — far too expensive per tick
    this.resizeObserver = new ResizeObserver(() => {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => {
        this.handleResize();
        if (!this.running) {
          this.renderFrame(); // nothing else repaints while paused
        }
      }, RESIZE_DEBOUNCE_MS);
    });
    this.resizeObserver.observe(target);
  }

  private handleResize(): void {
    const target = this.canvas.parentElement ?? this.canvas;
    const rect = target.getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);
    if (width === this.lastWidth && height === this.lastHeight) return;
    this.lastWidth = width;
    this.lastHeight = height;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}

/**
 * One gem placed on a golden-angle spiral around the z-axis, with enough
 * jitter that the tube reads organic instead of mechanical.
 */
function createGemSeed(index: number): GemSeed {
  const angle = index * GOLDEN_ANGLE + (Math.random() - 0.5) * ANGLE_JITTER;
  // sqrt keeps density roughly uniform across the annulus area
  const radius =
    TUBE_RADIUS_MIN + (TUBE_RADIUS_MAX - TUBE_RADIUS_MIN) * Math.sqrt(Math.random());
  const depth = (index / (GEM_COUNT - 1)) * TUNNEL_DEPTH;
  const position = new THREE.Vector3(
    Math.cos(angle) * radius,
    Math.sin(angle) * radius,
    -depth + (Math.random() - 0.5) * DEPTH_JITTER,
  );

  const base = SCALE_MIN + Math.random() * (SCALE_MAX - SCALE_MIN);
  const squash = SQUASH_MIN + Math.random() * (SQUASH_MAX - SQUASH_MIN);
  const scale = new THREE.Vector3(base, base * squash, base);

  const axis = new THREE.Vector3(
    Math.random() * 2 - 1,
    Math.random() * 2 - 1,
    Math.random() * 2 - 1,
  );
  if (axis.lengthSq() < 1e-4) {
    axis.set(0, 1, 0);
  }
  axis.normalize();

  return {
    position,
    scale,
    axis,
    speed: TUMBLE_SPEED_MIN + Math.random() * (TUMBLE_SPEED_MAX - TUMBLE_SPEED_MIN),
    phase: Math.random() * Math.PI * 2,
  };
}

/** Weighted pick from the icy palette. */
function pickGemColor(): number {
  const roll = Math.random();
  let cumulative = 0;
  for (const entry of PALETTE) {
    cumulative += entry.weight;
    if (roll <= cumulative) {
      return entry.color;
    }
  }
  return PALETTE[PALETTE.length - 1].color;
}
