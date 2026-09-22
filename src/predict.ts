import * as THREE from 'three';
import { BALL_LINEAR_DAMPING, BALL_R, PREVIEW_RESTITUTION } from './constants';

export interface Prediction {
  points: THREE.Vector3[];
  /** Index into `points` of the first ground bounce, or -1. */
  groundIndex: number;
  /** Index into `points` of the wall contact, or -1. */
  wallIndex: number;
}

/**
 * Approximates the ball's flight for the aiming preview: ballistic motion with reflections
 * off the ground (y=0) and the wall (z=0). Close enough to Rapier to aim with, and cheap
 * enough to recompute every frame while the power meter is swinging.
 */
export function predictPath(
  origin: THREE.Vector3,
  velocity: THREE.Vector3,
  maxSeconds = 4
): Prediction {
  const p = origin.clone();
  const v = velocity.clone();
  const dt = 1 / 90;
  const steps = Math.floor(maxSeconds / dt);

  const points: THREE.Vector3[] = [p.clone()];
  let groundIndex = -1;
  let wallIndex = -1;
  let groundHits = 0;

  for (let i = 0; i < steps; i++) {
    v.y -= 9.81 * dt;
    const damp = 1 / (1 + BALL_LINEAR_DAMPING * dt);
    v.multiplyScalar(damp);
    p.addScaledVector(v, dt);

    if (p.y < BALL_R && v.y < 0) {
      p.y = BALL_R;
      v.y = -v.y * PREVIEW_RESTITUTION;
      v.x *= 0.92;
      v.z *= 0.92;
      groundHits++;
      if (groundIndex === -1) groundIndex = points.length;
    }

    if (p.z < BALL_R && v.z < 0) {
      p.z = BALL_R;
      v.z = -v.z * PREVIEW_RESTITUTION;
      if (wallIndex === -1) wallIndex = points.length;
    }

    points.push(p.clone());

    // Enough to judge the shot: stop once it has bounced, hit the wall and come back down.
    if (wallIndex !== -1 && groundHits >= 2) break;
    if (p.z > origin.z + 4 || Math.abs(p.x) > 12) break;
  }

  return { points, groundIndex, wallIndex };
}
