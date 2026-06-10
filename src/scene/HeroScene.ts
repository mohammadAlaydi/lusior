import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import RAPIER from '@dimforge/rapier3d-compat';
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
const CAMERA_FOV = 32;
const PHYSICS_STEP = 1 / 60;
const MAX_SUBSTEPS = 3;

// --- floating-cluster tuning ---------------------------------------------
// Gravity is zero; every body is tethered to a home position by a
// mass-normalised damped spring: a = K*(home - pos) - C*vel. Combined with
// the body's own linear damping this sits at ~critical damping, so a
// displaced jack glides home in roughly 2s with no overshoot.
const SPRING_STIFFNESS = 6.0; // s^-2
const SPRING_DAMPING = 3.2; // s^-1
const LINEAR_DAMPING = 1.8;
const ANGULAR_DAMPING = 1.0;
/** Peak sinusoidal drift acceleration — keeps the idle cluster breathing. */
const DRIFT_ACCEL = 1.4;
/** Peak idle torque per unit mass, sustaining the slow tumble. */
const DRIFT_TORQUE = 0.16;
/** Initial tumble speed range (rad/s). */
const MAX_TUMBLE = 0.45;

const POINTER_RADIUS = 2.4;
const CLICK_BURST_RADIUS = 8;
const CLICK_BURST_STRENGTH = 10;

// Exactly four colours, weighted like the reference:
// white ~30%, blue ~30%, black ~25%, dark navy ~15%.
const GROUPS: ColorGroup[] = [
  { color: 0xf2f3f6, roughness: 0.3, count: 6 }, // glossy off-white
  { color: 0x1a2ffb, roughness: 0.28, count: 6 }, // vivid deep blue
  { color: 0x0a0b10, roughness: 0.34, count: 5 }, // black
  { color: 0x10142e, roughness: 0.34, count: 3 }, // very dark navy
];

const tmpMatrix = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3(1, 1, 1);

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
  private pointerBody!: RAPIER.RigidBody;

  private worldHeight = 16;
  private pointerTarget = new THREE.Vector3(1000, 1000, 0);
  private pointerCurrent = new THREE.Vector3(1000, 1000, 0);
  private pointerActive = false;
  private accumulator = 0;
  private simTime = 0;
  private lastTime = 0;
  private rafId = 0;
  private renderDirty = true;
  private lastWidth = 0;
  private lastHeight = 0;
  private resizeTimer = 0;
  private resizeObserver?: ResizeObserver;
  private readonly abort = new AbortController();
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly reducedMotion: boolean;

  constructor(canvas: HTMLCanvasElement, container: HTMLElement) {
    this.container = container;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const ink = new THREE.Color(0x0d0e13);
    this.renderer.setClearColor(ink);
    this.scene.fog = new THREE.Fog(ink, 30, 70);

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 200);

    this.setupLights();
  }

  /** Async boot: loads the physics WASM module, then builds the scene. */
  async start(): Promise<void> {
    await RAPIER.init();
    // Zero gravity: the cluster floats; home springs do all the shaping.
    this.world = new RAPIER.World(new RAPIER.Vector3(0, 0, 0));

    this.handleResize();
    this.buildBoundaries();
    this.spawnJacks();
    this.createPointerBody();
    this.bindEvents();

    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    window.clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
    this.abort.abort();
    for (const resource of this.disposables) {
      resource.dispose();
    }
    this.scene.environment?.dispose();
    this.world?.free();
    this.renderer.dispose();
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
    this.scene.environmentIntensity = 0.85;
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xffffff, 3.0);
    key.position.set(-10, 14, 18);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
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
      GROUPS.flatMap((group, groupIndex) =>
        Array.from({ length: group.count }, () => groupIndex),
      ),
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
      // injection-moulded plastic: high clearcoat over a moderate base
      // roughness gives the sharp toy-like specular hits of the reference
      const material = new THREE.MeshPhysicalMaterial({
        color: group.color,
        roughness: group.roughness,
        metalness: 0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.15,
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
    const marginY = 1.1;
    const usableW = WORLD_WIDTH - marginX * 2;
    const usableH = Math.max(this.worldHeight - marginY * 2, 4);
    const cellW = usableW / cols;
    const cellH = usableH / rows;
    const zMax = WORLD_DEPTH / 2 - ARM_HALF_LENGTH;

    const cells = shuffle(Array.from({ length: cols * rows }, (_, i) => i)).slice(0, total);
    return cells.map((cell) => {
      const col = cell % cols;
      const row = Math.floor(cell / cols);
      const x = -usableW / 2 + (col + 0.5) * cellW + (Math.random() - 0.5) * cellW * 0.7;
      const y = marginY + (row + 0.5) * cellH + (Math.random() - 0.5) * cellH * 0.7;
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
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(...wall.size).setFriction(0.7),
        body,
      );
      this.boundaryBodies.push(body);
    }
  }

  private createPointerBody(): void {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(1000, 1000, 0),
    );
    this.world.createCollider(RAPIER.ColliderDesc.ball(POINTER_RADIUS), body);
    this.pointerBody = body;
  }

  // --- interaction -------------------------------------------------------

  private bindEvents(): void {
    const canvas = this.renderer.domElement;

    const { signal } = this.abort;

    canvas.addEventListener(
      'pointermove',
      (event) => {
        this.pointerTarget.copy(this.pointToWorld(event));
        if (!this.pointerActive) {
          this.pointerCurrent.copy(this.pointerTarget);
          // setTranslation teleports WITHOUT generating artificial velocity —
          // setNextKinematicTranslation here would hurl contacting jacks away.
          this.pointerBody.setTranslation(
            { x: this.pointerCurrent.x, y: this.pointerCurrent.y, z: 0 },
            false,
          );
          this.pointerActive = true;
        }
      },
      { signal },
    );

    canvas.addEventListener(
      'pointerleave',
      () => {
        this.pointerActive = false;
        this.pointerTarget.set(1000, 1000, 0);
        this.pointerCurrent.set(1000, 1000, 0);
        this.pointerBody.setTranslation({ x: 1000, y: 1000, z: 0 }, false);
      },
      { signal },
    );

    canvas.addEventListener(
      'pointerdown',
      (event) => {
        this.burst(this.pointToWorld(event));
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
  }

  private pointToWorld(event: PointerEvent): THREE.Vector3 {
    const rect = this.container.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const point = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.groundPlane, point);
    return point;
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

  private readonly loop = (now: number): void => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.accumulator = Math.min(this.accumulator + dt, PHYSICS_STEP * MAX_SUBSTEPS);

    let stepped = false;
    while (this.accumulator >= PHYSICS_STEP) {
      this.applyHomeForces();
      this.stepPointer();
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
    for (const jack of this.jacks) {
      const pos = jack.body.translation();
      const vel = jack.body.linvel();
      const m = jack.body.mass();
      const home = jack.home;
      const f = jack.driftFreq;
      const p = jack.driftPhase;
      const drift = this.reducedMotion ? 0 : DRIFT_ACCEL;

      jack.body.resetForces(false);
      jack.body.addForce(
        {
          x: m * (SPRING_STIFFNESS * (home.x - pos.x) - SPRING_DAMPING * vel.x + drift * Math.sin(t * f.x + p.x)),
          y: m * (SPRING_STIFFNESS * (home.y - pos.y) - SPRING_DAMPING * vel.y + drift * Math.sin(t * f.y + p.y)),
          z: m * (SPRING_STIFFNESS * (home.z - pos.z) - SPRING_DAMPING * vel.z + drift * Math.sin(t * f.z + p.z)),
        },
        !this.reducedMotion,
      );

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

  private stepPointer(): void {
    if (this.pointerActive) {
      // critically-damped chase keeps the pointer collider from teleporting
      this.pointerCurrent.lerp(this.pointerTarget, 0.35);
    }
    this.pointerBody.setNextKinematicTranslation({
      x: this.pointerCurrent.x,
      y: this.pointerCurrent.y,
      z: 0,
    });
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
    if (width === this.lastWidth && height === this.lastHeight) return;
    this.lastWidth = width;
    this.lastHeight = height;
    const aspect = width / height;

    this.worldHeight = WORLD_WIDTH / aspect;

    const halfFov = THREE.MathUtils.degToRad(CAMERA_FOV / 2);
    const distance = this.worldHeight / 2 / Math.tan(halfFov);

    // The floating cluster is centered in the visible volume.
    const centerY = this.worldHeight / 2;

    this.camera.aspect = aspect;
    this.camera.position.set(0, centerY, distance);
    this.camera.lookAt(0, centerY, 0);
    this.camera.updateProjectionMatrix();

    const fog = this.scene.fog as THREE.Fog;
    fog.near = distance + WORLD_DEPTH;
    fog.far = distance + 40;

    this.renderer.setSize(width, height, false);
    this.renderDirty = true;
  }
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
