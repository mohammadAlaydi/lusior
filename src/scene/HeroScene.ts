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
}

/** Visible world width at the z=0 plane (world units). Height follows aspect. */
const WORLD_WIDTH = 25;
const WORLD_DEPTH = 6.4;
const CAMERA_FOV = 32;
const GRAVITY_Y = -40;
const PHYSICS_STEP = 1 / 60;
const MAX_SUBSTEPS = 3;

const POINTER_RADIUS = 2.0;
const CLICK_BURST_RADIUS = 7;
const CLICK_BURST_STRENGTH = 26;

const GROUPS: ColorGroup[] = [
  { color: 0x111116, roughness: 0.28, count: 20 }, // glossy black
  { color: 0xf2f3f7, roughness: 0.34, count: 14 }, // off-white
  { color: 0x1a2ffb, roughness: 0.3, count: 11 }, // brand blue
  { color: 0xff4c41, roughness: 0.32, count: 9 }, // red
  { color: 0xc1ff00, roughness: 0.34, count: 7 }, // acid green
  { color: 0x8832f7, roughness: 0.32, count: 8 }, // purple
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
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const ink = new THREE.Color(0x0d0e13);
    this.renderer.setClearColor(ink);
    this.scene.fog = new THREE.Fog(ink, 30, 70);

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 200);

    this.setupLights();
    this.setupFloor();
  }

  /** Async boot: loads the physics WASM module, then builds the scene. */
  async start(): Promise<void> {
    await RAPIER.init();
    this.world = new RAPIER.World(new RAPIER.Vector3(0, GRAVITY_Y, 0));

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

  private setupLights(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(-10, 24, 14);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -24;
    key.shadow.camera.right = 24;
    key.shadow.camera.top = 28;
    key.shadow.camera.bottom = -6;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 80;
    key.shadow.radius = 6;
    key.shadow.bias = -0.0004;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xb8c0ff, 0.35);
    fill.position.set(14, 8, -10);
    this.scene.add(fill);
  }

  private setupFloor(): void {
    const material = new THREE.MeshStandardMaterial({
      color: 0x0a0b10,
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0.25,
    });
    const geometry = new THREE.PlaneGeometry(300, 300);
    this.disposables.push(material, geometry);
    const floor = new THREE.Mesh(geometry, material);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  // --- physics -----------------------------------------------------------

  private spawnJacks(): void {
    const geometry = createJackGeometry();
    this.disposables.push(geometry);
    const total = GROUPS.reduce((sum, g) => sum + g.count, 0);

    // shuffled spawn order so colors interleave in the cascade
    const order = shuffle(
      GROUPS.flatMap((group, groupIndex) =>
        Array.from({ length: group.count }, () => groupIndex),
      ),
    );

    const meshes = GROUPS.map((group) => {
      const material = new THREE.MeshPhysicalMaterial({
        color: group.color,
        roughness: group.roughness,
        metalness: 0,
        clearcoat: 0.8,
        clearcoatRoughness: 0.25,
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

    const usedPerGroup = GROUPS.map(() => 0);
    const spread = WORLD_WIDTH * 0.42;

    for (let i = 0; i < total; i++) {
      const groupIndex = order[i];
      const instanceIndex = usedPerGroup[groupIndex];
      usedPerGroup[groupIndex] += 1;

      // triangular distribution biases the pile toward the center of frame
      const x = (Math.random() + Math.random() - 1) * spread;
      const z = (Math.random() * 2 - 1) * (WORLD_DEPTH / 2 - ARM_HALF_LENGTH * 0.5);
      const y = this.reducedMotion
        ? ARM_HALF_LENGTH + Math.random() * this.worldHeight * 0.5
        : this.worldHeight + 6 + i * 2.6;

      const rotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
        ),
      );

      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })
        .setLinearDamping(0.08)
        .setAngularDamping(0.25)
        .setCcdEnabled(true);
      const body = this.world.createRigidBody(bodyDesc);

      this.createJackColliders(body);
      this.jacks.push({ body, mesh: meshes[groupIndex], index: instanceIndex });
    }
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
        .setFriction(0.65)
        .setRestitution(0.22)
        .setDensity(1);
      this.world.createCollider(desc, body);
    }
  }

  /**
   * Static containment box. Only the visible *height* of the world changes
   * with the container's aspect ratio, so walls are built once, tall enough
   * to cover any spawn height, and never rebuilt on resize.
   */
  private buildBoundaries(): void {
    const w = WORLD_WIDTH / 2;
    const d = WORLD_DEPTH / 2;
    const t = 0.5; // wall half-thickness
    const wallHalfHeight = 250;
    const wallCenterY = wallHalfHeight - 10;

    const walls: Array<{ pos: [number, number, number]; size: [number, number, number] }> = [
      { pos: [0, -t, 0], size: [w + 4, t, d + 4] }, // floor
      { pos: [-w - t, wallCenterY, 0], size: [t, wallHalfHeight, d + 4] }, // left
      { pos: [w + t, wallCenterY, 0], size: [t, wallHalfHeight, d + 4] }, // right
      { pos: [0, wallCenterY, -d - t], size: [w + 4, wallHalfHeight, t] }, // back
      { pos: [0, wallCenterY, d + t], size: [w + 4, wallHalfHeight, t] }, // front
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

      const falloff = 1 - dist / CLICK_BURST_RADIUS;
      const scale = (CLICK_BURST_STRENGTH * falloff * jack.body.mass()) / Math.max(dist, 0.6);
      jack.body.applyImpulse(
        {
          x: dx * scale,
          y: Math.abs(dy) * scale * 0.6 + falloff * jack.body.mass() * 10,
          z: dz * scale * 0.5,
        },
        true,
      );
      jack.body.applyTorqueImpulse(
        {
          x: (Math.random() - 0.5) * falloff * 40,
          y: (Math.random() - 0.5) * falloff * 40,
          z: (Math.random() - 0.5) * falloff * 40,
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

    // Center slightly below the world midline so the floor line sits a touch
    // above the container's bottom edge, like the reference.
    const centerY = this.worldHeight / 2 - 1.2;

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
