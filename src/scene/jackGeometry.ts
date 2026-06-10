import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Half-length of one arm, from the jack's center to an arm tip (world units). */
export const ARM_HALF_LENGTH = 2.1;
/** Radius of an arm's cylindrical body (world units). */
export const ARM_RADIUS = 0.62;
/** Fillet radius rounding the flat end caps into the cylinder sides. */
const CAP_FILLET = 0.22;

const RADIAL_SEGMENTS = 36;
const FILLET_SEGMENTS = 7;

/**
 * Profile of a cylinder with flat, fillet-rounded end caps (flatter than a
 * capsule — matches the reference jacks' machined-plastic look).
 */
function createArmProfile(halfLength: number, radius: number, fillet: number): THREE.Vector2[] {
  const points: THREE.Vector2[] = [];

  points.push(new THREE.Vector2(0.001, -halfLength));
  points.push(new THREE.Vector2(radius - fillet, -halfLength));

  // bottom fillet: quarter arc from cap edge onto the cylinder side
  for (let i = 1; i <= FILLET_SEGMENTS; i++) {
    const t = (i / FILLET_SEGMENTS) * (Math.PI / 2);
    points.push(
      new THREE.Vector2(
        radius - fillet + Math.sin(t) * fillet,
        -halfLength + fillet - Math.cos(t) * fillet,
      ),
    );
  }

  // top fillet: quarter arc from the cylinder side onto the cap edge
  for (let i = 0; i <= FILLET_SEGMENTS; i++) {
    const t = (i / FILLET_SEGMENTS) * (Math.PI / 2);
    points.push(
      new THREE.Vector2(
        radius - fillet + Math.cos(t) * fillet,
        halfLength - fillet + Math.sin(t) * fillet,
      ),
    );
  }

  points.push(new THREE.Vector2(0.001, halfLength));
  return points;
}

/**
 * One jack: three identical arms crossed along the X, Y, and Z axes,
 * merged into a single BufferGeometry (one draw call per InstancedMesh).
 */
export function createJackGeometry(): THREE.BufferGeometry {
  const profile = createArmProfile(ARM_HALF_LENGTH, ARM_RADIUS, CAP_FILLET);
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
