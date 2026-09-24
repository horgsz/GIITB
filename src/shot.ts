import type * as THREE from 'three';
import {
  BALL_R,
  BUCKET_H,
  BUCKET_R,
  FLIGHT_TIMEOUT,
  MISS_TEXT,
  SETTLE_IN_BUCKET,
  type MissReason,
  type ThrowResult
} from './constants';

type Stage = 'air' | 'ground' | 'wall';

export interface CourtHit {
  handle: number;
  started: boolean;
}

/**
 * Validates a single throw against the rule "ground once, wall once, then the bucket",
 * and decides when the shot is over.
 */
export class ShotTracker {
  stage: Stage = 'air';
  private failure: MissReason | null = null;
  private elapsed = 0;
  private insideFor = 0;
  private restingFor = 0;
  private currentlyInside = false;

  constructor(
    private readonly groundHandle: number,
    private readonly wallHandle: number,
    private readonly isBucket: (handle: number) => boolean
  ) {}

  get failed() {
    return this.failure !== null;
  }

  get failureReason(): MissReason | null {
    return this.failure;
  }

  /** True only while the ball's centre is below the rim and within the bucket. */
  get insideBucket(): boolean {
    return this.currentlyInside;
  }

  /** Live rule state for the HUD: which steps are banked, and whether the shot is dead. */
  get sequenceState(): {
    ground: boolean;
    wall: boolean;
    bucket: boolean;
    dead: boolean;
    text: string;
  } {
    return {
      ground: this.stage === 'ground' || this.stage === 'wall',
      wall: this.stage === 'wall',
      bucket: false,
      dead: this.failure !== null,
      text: this.failure ? `NO POINT — ${MISS_TEXT[this.failure]}` : ''
    };
  }

  registerHits(hits: CourtHit[]) {
    for (const hit of hits) {
      if (!hit.started) continue;
      if (this.isBucket(hit.handle)) continue; // touching the bucket is never illegal
      if (hit.handle === this.groundHandle) this.onGround();
      else if (hit.handle === this.wallHandle) this.onWall();
    }
  }

  private onGround() {
    if (this.failure) return;
    if (this.stage === 'air') this.stage = 'ground';
    else if (this.stage === 'ground') this.failure = 'doubleBounce';
    else this.failure = 'bounceAfterWall';
  }

  private onWall() {
    if (this.failure) return;
    if (this.stage === 'air') this.failure = 'wallFirst';
    else if (this.stage === 'ground') this.stage = 'wall';
    else this.failure = 'doubleWall';
  }

  /**
   * Advances the shot clock. Returns a result once the throw has resolved,
   * or null while the ball is still live.
   */
  update(dt: number, ballPos: THREE.Vector3 | null, speed: number, bucket: THREE.Vector3): ThrowResult | null {
    this.elapsed += dt;

    if (!ballPos) return this.miss('outOfPlay');

    const dx = ballPos.x - bucket.x;
    const dz = ballPos.z - bucket.z;
    const inside =
      Math.hypot(dx, dz) < BUCKET_R - BALL_R * 0.4 &&
      ballPos.y > BALL_R * 0.5 &&
      ballPos.y < BUCKET_H;
    this.currentlyInside = inside;

    if (inside) {
      this.insideFor += dt;
      if (this.insideFor >= SETTLE_IN_BUCKET) {
        if (this.failure) return this.miss(this.failure);
        // Landing in the bucket only counts off the full ground-then-wall sequence.
        if (this.stage !== 'wall') return this.miss('noSequence');
        return { scored: true };
      }
    } else {
      this.insideFor = 0;
    }

    if (Math.abs(ballPos.x) > 20 || ballPos.z > 32 || ballPos.z < -4 || ballPos.y < -2) {
      return this.miss(this.failure ?? 'outOfPlay');
    }

    // Ball has come to rest outside the bucket.
    this.restingFor = speed < 0.3 && !inside ? this.restingFor + dt : 0;
    if (this.restingFor > 0.7) return this.miss(this.failure ?? 'missedBucket');

    if (this.elapsed > FLIGHT_TIMEOUT) return this.miss(this.failure ?? 'timeout');

    return null;
  }

  private miss(reason: MissReason): ThrowResult {
    return { scored: false, reason };
  }
}
