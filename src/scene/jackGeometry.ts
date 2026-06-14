import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Half-length of one arm, from the jack's center to an arm tip (world units). */
export const ARM_HALF_LENGTH = 2.1;
/** Radius of an arm's cylindrical body (world units). */
export const ARM_RADIUS = 0.74;
/** Radius of the blind hole bored into each arm end (the open-tube look).
 * ~40% of ARM_RADIUS — matches the real lusion jacks' small hole + thick wall
 * (was 0.42 ≈ 57%, which read too wide-mouthed). */
const BORE_RADIUS = 0.3;
/** How deep that bore sinks into each end face. */
const BORE_DEPTH = 0.52;
/** Soft rounding only on the outer rim, where the side meets the flat end. */
const RIM_FILLET = 0.16;

const RADIAL_SEGMENTS = 48;
const FILLET_SEGMENTS = 6;

/**
 * Profile of one arm: a stubby cylinder with FLAT end faces, each bored out by
 * a concentric blind hole so the tips read as open pipe-ends (matching the real
 * lusion jacks). Only the outer rim is softened; the bore stays crisp so the
 * hole reads clearly. LatheGeometry revolves this around the Y (arm) axis.
 */
function createArmProfile(): THREE.Vector2[] {
  const hl = ARM_HALF_LENGTH;
  const r = ARM_RADIUS;
  const br = BORE_RADIUS;
  const bd = BORE_DEPTH;
  const f = RIM_FILLET;
  const points: THREE.Vector2[] = [];

  // --- bottom tip (y = -hl): bore floor -> wall -> flat face -> rim fillet ---
  points.push(new THREE.Vector2(0.001, -hl + bd)); // bore floor centre (axis)
  points.push(new THREE.Vector2(br, -hl + bd)); // bore floor outer edge
  points.push(new THREE.Vector2(br, -hl)); // up the bore wall to the inner rim
  points.push(new THREE.Vector2(r - f, -hl)); // across the flat end face
  for (let i = 1; i <= FILLET_SEGMENTS; i++) {
    const t = (i / FILLET_SEGMENTS) * (Math.PI / 2);
    points.push(new THREE.Vector2(r - f + Math.sin(t) * f, -hl + f - Math.cos(t) * f));
  }

  // --- top tip (y = +hl): mirror of the bottom ---
  for (let i = 0; i <= FILLET_SEGMENTS; i++) {
    const t = (i / FILLET_SEGMENTS) * (Math.PI / 2);
    points.push(new THREE.Vector2(r - f + Math.cos(t) * f, hl - f + Math.sin(t) * f));
  }
  points.push(new THREE.Vector2(br, hl)); // across the flat end face to inner rim
  points.push(new THREE.Vector2(br, hl - bd)); // down the bore wall to the floor
  points.push(new THREE.Vector2(0.001, hl - bd)); // bore floor centre (axis)

  return points;
}

/**
 * One jack: three identical arms crossed along the X, Y, and Z axes,
 * merged into a single BufferGeometry (one draw call per InstancedMesh).
 */
export function createJackGeometry(): THREE.BufferGeometry {
  const profile = createArmProfile();
  const armY = new THREE.LatheGeometry(profile, RADIAL_SEGMENTS);

  const armX = armY.clone().rotateZ(Math.PI / 2);
  const armZ = armY.clone().rotateX(Math.PI / 2);

  const merged = mergeGeometries([armY, armX, armZ]);
  armY.dispose();
  armX.dispose();
  armZ.dispose();

  if (!merged) {
    throw new Error('Failed to merge jack arm geometries');
  }
  return merged;
}
