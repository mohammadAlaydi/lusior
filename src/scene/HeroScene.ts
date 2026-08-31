import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import RAPIER from '@dimforge/rapier3d';
import { getQualityProfile } from '../core/quality';
import { createJackGeometry, ARM_HALF_LENGTH, ARM_RADIUS } from './jackGeometry';

interface ColorGroup {
  color: number;
  roughness: number;
  count: number;
}

interface JackInstance {
  body: RAPIER.RigidBody;
  mesh: THREE.InstancedMesh;
  index: number;
  home: THREE.Vector3;
  driftFreq: THREE.Vector3;
  driftPhase: THREE.Vector3;
}

/** Visible world width at the z=0 plane (world units). Height follows aspect. */
const WORLD_WIDTH = 25;
const WORLD_DEPTH = 9;
/** Vertical margin (world units) between the home layout and the visible edges. */
const HOME_MARGIN_Y = 1.1;
const CAMERA_FOV = 32;
const PHYSICS_STEP = 1 / 60;
const MAX_SUBSTEPS = 3;

// --- floating-cluster tuning ---------------------------------------------
// Gravity is zero; every body is tethered to a home position by a
// mass-normalised damped spring: a = K*(home - pos) - C*vel. Stiff enough to
// snap a knocked jack back home in ~0.6s, but under-damped (ζ≈0.6) so the
// return overshoots a hair and stays lively rather than robotic.
const SPRING_STIFFNESS = 12.0; // s^-2
const SPRING_DAMPING = 4.2; // s^-1
const LINEAR_DAMPING = 2.0;
const ANGULAR_DAMPING = 1.0;
/** Peak sinusoidal drift acceleration — keeps the idle cluster breathing. */
const DRIFT_ACCEL = 1.4;
/** Peak idle torque per unit mass, sustaining the slow tumble. */
const DRIFT_TORQUE = 0.16;
/** Initial tumble speed range (rad/s). */
const MAX_TUMBLE = 0.45;

// Cursor interaction (XY screen plane). The cursor behaves like a moving
// paddle: a jack it sweeps toward is knocked along the contact normal (the
// "hit angle") with an impulse proportional to how fast the cursor is closing
// on it — so shapes fly off in the travel direction like billiard balls, not
// in a random radial spray. A small always-on radial push (HOLE_ACCEL) keeps a
// clean hole so the centre can't be rested on even when the cursor is still.
const REPEL_RADIUS = 6.5;
const HIT_GAIN = 16; // velocity-driven directional knock
const HOLE_ACCEL = 100; // persistent radial push (keeps the hole vs the stiffer spring)
const REPEL_FALLOFF = 1.3;
const CLICK_BURST_RADIUS = 8;
const CLICK_BURST_STRENGTH = 10;

// Exactly four colours, weighted like the reference: clean white ~30%, royal
// cobalt ~30%, black ~25%, muted grey ~15%. Smooth satin plastic (no clearcoat):
// roughness is low enough that the strong white key collapses into a soft
// highlight instead of washing the surface — that's why the real blue reads deep
// and saturated and the black stays velvety, with a gentle sheen (not wet candy).
const GROUPS: ColorGroup[] = [
  { color: 0xedeff3, roughness: 0.45, count: 6 }, // clean white
  { color: 0x1220b8, roughness: 0.32, count: 6 }, // deep royal cobalt blue (satin)
  { color: 0x08080b, roughness: 0.46, count: 5 }, // velvety near-black (satin)
  { color: 0x2b2f3a, roughness: 0.5, count: 3 }, // muted dark grey
];

const tmpMatrix = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3(1, 1, 1);
const tmpVel = new THREE.Vector3();
const tmpNdc = new THREE.Vector2();
const tmpWorldPoint = new THREE.Vector3();

export class HeroScene {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  private world!: RAPIER.World;
  private jacks: JackInstance[] = [];
  private boundaryBodies: RAPIER.RigidBody[] = [];

  private worldHeight = 16;
  private cursor = new THREE.Vector3(1000, 1000, 0);
  private cursorPrev = new THREE.Vector3(1000, 1000, 0);
  private cursorVel = new THREE.Vector3();
  private pointerActive = false;
  private accumulator = 0;
  private simTime = 0;
  private lastTime = 0;
  private rafId = 0;
  private renderDirty = true;
  /** A one-frame redraw queued for the static reduced-motion path. */
  private staticRenderScheduled = false;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastPixelRatio = 0;
  private resizeTimer = 0;
  private resizeObserver?: ResizeObserver;
  private visibilityObserver?: IntersectionObserver;
  /** Whether the container currently intersects the viewport (rAF self-gate). */
  private intersecting = true;
  /** True between webglcontextlost and webglcontextrestored. */
  private contextLost = false;
  /** Whether the rAF loop is currently scheduled. */
  private running = false;
  /** False until physics, meshes and event gates are fully initialised. */
  private started = false;
  /** App-level project/menu/video modes pause background simulation. */
  private suspended = false;
  /** Explicit tab visibility gate (in addition to viewport intersection). */
  private documentVisible = document.visibilityState === 'visible';
  private readonly abort = new AbortController();
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly reducedMotion: boolean;
  private readonly quality = getQualityProfile();

  constructor(canvas: HTMLCanvasElement, container: HTMLElement) {
    this.container = container;
    this.reducedMotion = this.quality.reducedMotion;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.quality.antialias,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.maxPixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    this.renderer.shadowMap.enabled = this.quality.shadowsEnabled;
    // three 0.184 deprecates PCFSoftShadowMap and force-downgrades it to
    // PCFShadowMap at runtime (with a console warning) — set it directly to
    // get the same result with zero warning. shadow.radius (below) still
    // applies under plain PCF, so the softness is unchanged.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const ink = new THREE.Color(0x09090b);
    this.renderer.setClearColor(ink);
    this.scene.fog = new THREE.Fog(ink, 30, 70);

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 200);

    this.setupLights();
  }

  /** Build after the async HeroScene module import has initialized Rapier WASM. */
  start(): void {
    // Zero gravity: the cluster floats; home springs do all the shaping.
    this.world = new RAPIER.World(new RAPIER.Vector3(0, 0, 0));

    this.handleResize();
    this.buildBoundaries();
    this.spawnJacks();
    this.bindEvents();

    this.started = true;
    this.updateRunState();
  }

  dispose(): void {
    this.started = false;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    window.clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
    this.visibilityObserver?.disconnect();
    this.abort.abort();
    for (const resource of this.disposables) {
      resource.dispose();
    }
    this.scene.environment?.dispose();
    this.world?.free();
    this.renderer.dispose();
  }

  /** Pause/resume background GPU + physics work from the application runtime. */
  setSuspended(suspended: boolean): void {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    this.updateRunState();
  }

  // --- scene setup -------------------------------------------------------

  /**
   * Bright studio look: large warm-white key with soft shadows, a broad
   * second key from the right, a cool low fill, and a blue-white rim from
   * behind so the glossy jacks pop against the near-black backdrop.
   */
  private setupLights(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 1.0;
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xffffff, 3.0);
    key.position.set(-10, 14, 18);
    key.castShadow = this.quality.shadowsEnabled;
    key.shadow.mapSize.set(this.quality.shadowMapSize, this.quality.shadowMapSize);
    key.shadow.camera.left = -20;
    key.shadow.camera.right = 20;
    key.shadow.camera.top = 18;
    key.shadow.camera.bottom = -14;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 70;
    key.shadow.radius = 5;
    key.shadow.bias = -0.0004;
    this.scene.add(key);

    const softKey = new THREE.DirectionalLight(0xffffff, 1.0);
    softKey.position.set(12, 10, 10);
    this.scene.add(softKey);

    const fill = new THREE.DirectionalLight(0x9fb4ff, 0.55);
    fill.position.set(8, -6, 6);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xdde6ff, 1.5);
    rim.position.set(2, 9, -16);
    this.scene.add(rim);
  }

  // --- physics -----------------------------------------------------------

  private spawnJacks(): void {
    const geometry = createJackGeometry();
    this.disposables.push(geometry);
    const total = GROUPS.reduce((sum, g) => sum + g.count, 0);

    // shuffled spawn order so the four colours interleave across the cluster
    const order = shuffle(
      GROUPS.flatMap((group, groupIndex) => Array.from({ length: group.count }, () => groupIndex)),
    );

    const meshes = this.createJackMeshes(geometry);
    const homes = this.createHomePositions(total);
    const usedPerGroup = GROUPS.map(() => 0);

    for (let i = 0; i < total; i++) {
      const groupIndex = order[i];
      const instanceIndex = usedPerGroup[groupIndex];
      usedPerGroup[groupIndex] += 1;
      this.spawnJack(homes[i], meshes[groupIndex], instanceIndex);
    }
  }

  private createJackMeshes(geometry: THREE.BufferGeometry): THREE.InstancedMesh[] {
    return GROUPS.map((group) => {
      // soft-touch matte plastic: no clearcoat, higher roughness — broad gentle
      // highlights and a velvety black, like the real lusion jacks (not glossy)
      const material = new THREE.MeshPhysicalMaterial({
        color: group.color,
        roughness: group.roughness,
        metalness: 0,
        clearcoat: 0,
        envMapIntensity: 1.0,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, group.count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.disposables.push(material, mesh);
      return mesh;
    });
  }

  /**
   * Loose organic cluster spanning the visible volume: a jittered grid
   * spreads jacks across the full width/height while a checkerboard z
   * offset staggers depth so neighbours interlock instead of overlapping.
   */
  private createHomePositions(total: number): THREE.Vector3[] {
    const cols = 7;
    const rows = Math.ceil(total / cols);
    const marginX = 1.4;
    const usableW = WORLD_WIDTH - marginX * 2;
    const usableH = usableHomeHeight(this.worldHeight);
    const cellW = usableW / cols;
    const cellH = usableH / rows;
    const zMax = WORLD_DEPTH / 2 - ARM_HALF_LENGTH;

    const cells = shuffle(Array.from({ length: cols * rows }, (_, i) => i)).slice(0, total);
    return cells.map((cell) => {
      const col = cell % cols;
      const row = Math.floor(cell / cols);
      const x = -usableW / 2 + (col + 0.5) * cellW + (Math.random() - 0.5) * cellW * 0.7;
      const y = HOME_MARGIN_Y + (row + 0.5) * cellH + (Math.random() - 0.5) * cellH * 0.7;
      const zBase = ((col + row) % 2 === 0 ? -1 : 1) * 1.4;
      const z = THREE.MathUtils.clamp(zBase + (Math.random() - 0.5) * 1.6, -zMax, zMax);
      return new THREE.Vector3(x, y, z);
    });
  }

  private spawnJack(home: THREE.Vector3, mesh: THREE.InstancedMesh, index: number): void {
    // drift-in: spawn a hand's width off home and let the spring glide each
    // jack into place — the very first frame already reads as the cluster.
    const start = home.clone();
    if (!this.reducedMotion) {
      start.x += (Math.random() - 0.5) * 2.2;
      start.y += (Math.random() - 0.5) * 2.2;
      start.z += (Math.random() - 0.5) * 1.4;
    }

    const rotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
      ),
    );

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(start.x, start.y, start.z)
      .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })
      .setLinearDamping(LINEAR_DAMPING)
      .setAngularDamping(ANGULAR_DAMPING)
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(bodyDesc);

    if (!this.reducedMotion) {
      body.setAngvel(
        {
          x: (Math.random() - 0.5) * 2 * MAX_TUMBLE,
          y: (Math.random() - 0.5) * 2 * MAX_TUMBLE,
          z: (Math.random() - 0.5) * 2 * MAX_TUMBLE,
        },
        true,
      );
    }

    this.createJackColliders(body);
    this.jacks.push({
      body,
      mesh,
      index,
      home,
      driftFreq: new THREE.Vector3(
        0.25 + Math.random() * 0.45,
        0.25 + Math.random() * 0.45,
        0.25 + Math.random() * 0.45,
      ),
      driftPhase: new THREE.Vector3(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
      ),
    });
  }

  private createJackColliders(body: RAPIER.RigidBody): void {
    const halfHeight = ARM_HALF_LENGTH - ARM_RADIUS;
    const axes: Array<RAPIER.Rotation> = [
      { x: 0, y: 0, z: 0, w: 1 }, // Y arm (capsule default axis)
      { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, // X arm
      { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }, // Z arm
    ];

    for (const rotation of axes) {
      const desc = RAPIER.ColliderDesc.capsule(halfHeight, ARM_RADIUS)
        .setRotation(rotation)
        .setFriction(0.5)
        .setRestitution(0.25)
        .setDensity(1);
      this.world.createCollider(desc, body);
    }
  }

  /**
   * Static safety box well outside the visible volume. The home springs do
   * the real containment; these walls only catch extreme burst escapes.
   * Built once (generously sized) and never rebuilt on resize.
   */
  private buildBoundaries(): void {
    const hx = WORLD_WIDTH / 2 + 5;
    const hz = WORLD_DEPTH / 2 + 4;
    const bottom = -12;
    const top = this.worldHeight + 12;
    const cy = (top + bottom) / 2;
    const hy = (top - bottom) / 2;
    const t = 0.5; // wall half-thickness

    const walls: Array<{ pos: [number, number, number]; size: [number, number, number] }> = [
      { pos: [0, bottom - t, 0], size: [hx + 1, t, hz + 1] }, // floor
      { pos: [0, top + t, 0], size: [hx + 1, t, hz + 1] }, // ceiling
      { pos: [-hx - t, cy, 0], size: [t, hy + 1, hz + 1] }, // left
      { pos: [hx + t, cy, 0], size: [t, hy + 1, hz + 1] }, // right
      { pos: [0, cy, -hz - t], size: [hx + 1, hy + 1, t] }, // back
      { pos: [0, cy, hz + t], size: [hx + 1, hy + 1, t] }, // front
    ];

    for (const wall of walls) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(...wall.pos),
      );
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(...wall.size).setFriction(0.7), body);
      this.boundaryBodies.push(body);
    }
  }

  // --- interaction -------------------------------------------------------

  private bindEvents(): void {
    const canvas = this.renderer.domElement;

    const { signal } = this.abort;

    canvas.addEventListener(
      'pointermove',
      (event) => {
        const p = this.pointToWorld(event);
        if (!p) return; // ray missed the ground plane — leave cursor as-is
        if (this.pointerActive) {
          this.cursor.copy(p);
        } else {
          // entering the canvas: prime the history so the first frame doesn't
          // read the jump-in as an enormous cursor velocity.
          this.cursor.copy(p);
          this.cursorPrev.copy(p);
          this.cursorVel.set(0, 0, 0);
          this.pointerActive = true;
        }
      },
      { signal },
    );

    canvas.addEventListener(
      'pointerleave',
      () => {
        this.pointerActive = false;
      },
      { signal },
    );

    canvas.addEventListener(
      'pointerdown',
      (event) => {
        if (this.reducedMotion) return;
        const p = this.pointToWorld(event);
        if (p) this.burst(p);
      },
      { signal },
    );

    // trailing debounce: drag-resizing fires every frame, and each pass
    // reallocates the drawing buffer — far too expensive per tick
    this.resizeObserver = new ResizeObserver(() => {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => this.handleResize(), 150);
    });
    this.resizeObserver.observe(this.container);

    // Self-gate the rAF loop: skip physics + rendering entirely while the
    // hero is scrolled off-screen instead of running forever in the background.
    this.visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        this.intersecting = entry.isIntersecting;
        this.updateRunState();
      },
      { threshold: 0 },
    );
    this.visibilityObserver.observe(this.container);

    document.addEventListener(
      'visibilitychange',
      () => {
        this.documentVisible = document.visibilityState === 'visible';
        this.updateRunState();
      },
      { signal },
    );

    // WebGL context loss: prevent the default (which would otherwise
    // permanently drop the context) and pause the loop. On restore, force a
    // full size/pixel-ratio re-apply — the restored context has a fresh
    // drawing buffer — and resume. A full GPU-resource rebuild of the
    // geometries/materials/instanced meshes is out of scope here; three.js's
    // own onContextRestore already reinitializes its internal GL state.
    canvas.addEventListener(
      'webglcontextlost',
      (event) => {
        event.preventDefault();
        this.contextLost = true;
        this.updateRunState();
      },
      { signal },
    );

    canvas.addEventListener(
      'webglcontextrestored',
      () => {
        this.contextLost = false;
        this.lastWidth = 0;
        this.lastHeight = 0;
        this.lastPixelRatio = 0;
        this.handleResize();
        this.updateRunState();
      },
      { signal },
    );
  }

  /**
   * Returns the shared `tmpWorldPoint` scratch vector — callers must consume
   * it synchronously — or null when the pointer ray doesn't hit the ground
   * plane (e.g. a degenerate camera orientation).
   */
  private pointToWorld(event: PointerEvent): THREE.Vector3 | null {
    const rect = this.container.getBoundingClientRect();
    tmpNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(tmpNdc, this.camera);
    return this.raycaster.ray.intersectPlane(this.groundPlane, tmpWorldPoint);
  }

  private burst(center: THREE.Vector3): void {
    for (const jack of this.jacks) {
      const t = jack.body.translation();
      const dx = t.x - center.x;
      const dy = t.y - center.y;
      const dz = t.z - center.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > CLICK_BURST_RADIUS) continue;

      // radial Δv = strength * falloff, mass-scaled so every jack scatters
      // alike; the home springs then pull the cluster back together.
      const falloff = 1 - dist / CLICK_BURST_RADIUS;
      const mag = (CLICK_BURST_STRENGTH * falloff * jack.body.mass()) / Math.max(dist, 0.8);
      jack.body.applyImpulse({ x: dx * mag, y: dy * mag, z: dz * mag * 0.7 }, true);

      const spin = falloff * jack.body.mass() * 1.6;
      jack.body.applyTorqueImpulse(
        {
          x: (Math.random() - 0.5) * spin,
          y: (Math.random() - 0.5) * spin,
          z: (Math.random() - 0.5) * spin,
        },
        true,
      );
    }
  }

  // --- frame loop --------------------------------------------------------

  /**
   * Derives run state from visibility + context-loss state. Reduced motion
   * gets a one-frame static render only; all other modes run the physics loop.
   * Resuming the animated loop resets the physics accumulator and frame clock
   * so a long pause doesn't burn through a burst of catch-up substeps.
   */
  private updateRunState(): void {
    const canRender =
      this.started &&
      this.intersecting &&
      this.documentVisible &&
      !this.contextLost &&
      !this.suspended;

    if (this.reducedMotion) {
      if (this.running) {
        this.running = false;
        cancelAnimationFrame(this.rafId);
        this.rafId = 0;
      }
      if (!canRender) {
        if (this.staticRenderScheduled) {
          cancelAnimationFrame(this.rafId);
          this.rafId = 0;
          this.staticRenderScheduled = false;
        }
        return;
      }
      // Lifecycle transitions may invalidate the canvas even when its CSS
      // dimensions did not change, so each return to a renderable state gets
      // one static frame. This never steps Rapier or reschedules itself.
      this.renderDirty = true;
      if (!this.staticRenderScheduled) {
        this.staticRenderScheduled = true;
        this.rafId = requestAnimationFrame(this.renderStaticFrame);
      }
      return;
    }

    const shouldRun = canRender;
    if (shouldRun === this.running) return;
    this.running = shouldRun;
    if (shouldRun) {
      this.accumulator = 0;
      this.lastTime = performance.now();
      this.renderDirty = true;
      this.rafId = requestAnimationFrame(this.loop);
    } else {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private readonly renderStaticFrame = (): void => {
    this.staticRenderScheduled = false;
    this.rafId = 0;
    if (
      !this.started ||
      !this.intersecting ||
      !this.documentVisible ||
      this.contextLost ||
      this.suspended ||
      !this.renderDirty
    ) {
      return;
    }
    this.syncMeshes();
    this.renderer.render(this.scene, this.camera);
    this.renderDirty = false;
  };

  private readonly loop = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.accumulator = Math.min(this.accumulator + dt, PHYSICS_STEP * MAX_SUBSTEPS);

    let stepped = false;
    while (this.accumulator >= PHYSICS_STEP) {
      this.applyHomeForces();
      this.world.timestep = PHYSICS_STEP;
      this.world.step();
      this.accumulator -= PHYSICS_STEP;
      stepped = true;
    }

    // All motion happens in the fixed 60Hz sim; on high-refresh displays
    // frames between steps would be pixel-identical — skip them.
    if (stepped || this.renderDirty) {
      this.syncMeshes();
      this.renderer.render(this.scene, this.camera);
      this.renderDirty = false;
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  /**
   * Zero-gravity float: each step every body is pulled toward home by a
   * mass-normalised damped spring, plus a slow sinusoidal drift (unique
   * phase/frequency per body) so the idle cluster keeps breathing. Reduced
   * motion drops drift and tumble — bodies sit still at home.
   */
  private applyHomeForces(): void {
    const t = this.simTime;
    const repel = this.pointerActive && !this.reducedMotion;
    if (repel) {
      // cursor velocity in world units/sec (XY), smoothed so it ramps and then
      // decays to zero when the pointer stops — drives the directional "hit".
      tmpVel.subVectors(this.cursor, this.cursorPrev).multiplyScalar(1 / PHYSICS_STEP);
      this.cursorVel.lerp(tmpVel, 0.5);
      this.cursorPrev.copy(this.cursor);
    }
    for (const jack of this.jacks) {
      const pos = jack.body.translation();
      const vel = jack.body.linvel();
      const m = jack.body.mass();
      const home = jack.home;
      const f = jack.driftFreq;
      const p = jack.driftPhase;
      const drift = this.reducedMotion ? 0 : DRIFT_ACCEL;

      // home spring + idle drift, expressed as acceleration (per unit mass)
      let ax =
        SPRING_STIFFNESS * (home.x - pos.x) -
        SPRING_DAMPING * vel.x +
        drift * Math.sin(t * f.x + p.x);
      let ay =
        SPRING_STIFFNESS * (home.y - pos.y) -
        SPRING_DAMPING * vel.y +
        drift * Math.sin(t * f.y + p.y);
      const az =
        SPRING_STIFFNESS * (home.z - pos.z) -
        SPRING_DAMPING * vel.z +
        drift * Math.sin(t * f.z + p.z);

      // Cursor acts like a moving paddle. Each nearby jack is pushed along the
      // contact normal (cursor -> jack); the impulse sums a gentle always-on
      // radial push (HOLE_ACCEL — keeps a hole you can't rest on) and a velocity
      // term that only fires when the cursor is CLOSING on the jack — so a sweep
      // knocks shapes off in its travel direction instead of spraying randomly.
      if (repel) {
        const dx = pos.x - this.cursor.x;
        const dy = pos.y - this.cursor.y;
        const d = Math.hypot(dx, dy);
        if (d < REPEL_RADIUS) {
          const inv = d > 1e-3 ? 1 / d : 0;
          const nx = dx * inv;
          const ny = dy * inv;
          const falloff = Math.pow(1 - d / REPEL_RADIUS, REPEL_FALLOFF);
          const approach = Math.max(0, this.cursorVel.x * nx + this.cursorVel.y * ny);
          const push = HOLE_ACCEL * falloff + HIT_GAIN * falloff * approach;
          ax += push * nx;
          ay += push * ny;
        }
      }

      jack.body.resetForces(false);
      jack.body.addForce({ x: m * ax, y: m * ay, z: m * az }, !this.reducedMotion);

      if (!this.reducedMotion) {
        jack.body.resetTorques(false);
        jack.body.addTorque(
          {
            x: m * DRIFT_TORQUE * Math.sin(t * f.y + p.z),
            y: m * DRIFT_TORQUE * Math.sin(t * f.z + p.x),
            z: m * DRIFT_TORQUE * Math.sin(t * f.x + p.y),
          },
          false,
        );
      }
    }
    this.simTime += PHYSICS_STEP;
  }

  private syncMeshes(): void {
    for (const jack of this.jacks) {
      const t = jack.body.translation();
      const r = jack.body.rotation();
      tmpPos.set(t.x, t.y, t.z);
      tmpQuat.set(r.x, r.y, r.z, r.w);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      jack.mesh.setMatrixAt(jack.index, tmpMatrix);
    }
    for (const jack of this.jacks) {
      jack.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // --- sizing ------------------------------------------------------------

  private handleResize(): void {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);
    const pixelRatio = Math.min(window.devicePixelRatio, this.quality.maxPixelRatio);
    const sizeChanged = width !== this.lastWidth || height !== this.lastHeight;
    const pixelRatioChanged = pixelRatio !== this.lastPixelRatio;
    if (!sizeChanged && !pixelRatioChanged) return;
    this.lastWidth = width;
    this.lastHeight = height;
    if (pixelRatioChanged) {
      this.lastPixelRatio = pixelRatio;
      this.renderer.setPixelRatio(pixelRatio);
    }
    const aspect = width / height;

    const prevWorldHeight = this.worldHeight;
    this.worldHeight = WORLD_WIDTH / aspect;
    if (this.worldHeight !== prevWorldHeight) this.refitHomes(prevWorldHeight);

    // Longer lens on wide viewports, wider on tall ones — the real site fits
    // FOV to aspect (≈18° widescreen … 30° portrait). A narrow FOV flattens
    // perspective so the cluster reads like a product render, not a fisheye.
    const fov = fit(aspect, 2.2, 2 / 3, 18, 30);
    const halfFov = THREE.MathUtils.degToRad(fov / 2);
    const distance = this.worldHeight / 2 / Math.tan(halfFov);

    // The floating cluster is centered in the visible volume.
    const centerY = this.worldHeight / 2;

    this.camera.fov = fov;
    this.camera.aspect = aspect;
    this.camera.position.set(0, centerY, distance);
    this.camera.lookAt(0, centerY, 0);
    this.camera.updateProjectionMatrix();

    const fog = this.scene.fog as THREE.Fog;
    fog.near = distance + WORLD_DEPTH;
    fog.far = distance + 40;

    this.renderer.setSize(width, height, false);
    this.renderDirty = true;
    this.updateRunState();
  }

  /**
   * Homes are laid out for the world height measured at the time; after an
   * aspect change (e.g. phone rotation portrait -> landscape) the old rows
   * can sit far outside the new visible volume and the springs would pin
   * jacks offscreen forever. The layout is linear in the usable vertical
   * span, so remapping that span re-derives each home exactly; x and z come
   * from the constant world width/depth and never move.
   */
  private refitHomes(prevWorldHeight: number): void {
    const scale = usableHomeHeight(this.worldHeight) / usableHomeHeight(prevWorldHeight);
    for (const jack of this.jacks) {
      jack.home.y = HOME_MARGIN_Y + (jack.home.y - HOME_MARGIN_Y) * scale;
      if (this.reducedMotion) {
        // Static mode never steps Rapier, so a home remap must move the body
        // directly instead of waiting for the normal spring simulation.
        jack.body.setTranslation(jack.home, false);
        jack.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        jack.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      } else {
        jack.body.wakeUp();
      }
    }
  }
}

/** Vertical span the home layout may occupy for a given visible height. */
function usableHomeHeight(worldHeight: number): number {
  return Math.max(worldHeight - HOME_MARGIN_Y * 2, 4);
}

/** Linear remap of value from [inA,inB] to [outA,outB], clamped to the output. */
function fit(value: number, inA: number, inB: number, outA: number, outB: number): number {
  const t = (value - inA) / (inB - inA);
  return outA + THREE.MathUtils.clamp(t, 0, 1) * (outB - outA);
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
