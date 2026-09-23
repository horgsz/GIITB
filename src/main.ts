import './style.css';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  BUCKET_MAX_Z,
  BUCKET_MIN_Z,
  FEATHER_MAX_GAP,
  FEATHER_MIN_GAP,
  PLACE_HALF_WIDTH,
  MAX_PITCH,
  MAX_SPEED,
  MAX_YAW,
  MIN_PITCH,
  MIN_SPEED,
  MISS_TEXT,
  THROW_HEIGHT,
  type Phase,
  type ThrowResult
} from './constants';
import { Game, type RoundOutcome } from './game';
import { predictPath } from './predict';
import { ShotTracker } from './shot';
import { Ui } from './ui';
import { World } from './world';
import { Audio } from './audio';

/**
 * Seconds for the power meter to sweep all the way up and back down.
 *
 * POWER_CURVE shapes how the meter moves *through* time, not how power maps to ball
 * speed: values above 1 make it linger over low power and hurry through the top, which
 * is where most shots actually live. Ball speed still maps linearly from power, so the
 * physics validation in tools/ remains valid.
 */
const POWER_PERIOD = 2.8;
const POWER_CURVE = 1.7;
const EDGE = PLACE_HALF_WIDTH;

class Controller {
  private phase: Phase = 'setup';
  private game: Game | null = null;
  private tracker: ShotTracker | null = null;

  private bucket = new THREE.Vector3(0, 0, 3);
  private feather = new THREE.Vector3(0, 0, 8);
  private pointer = new THREE.Vector2();

  private yaw = 0;
  private pitch = 0.55;
  private charging = false;
  private chargeTime = 0;
  private power = 0.5;

  private lastOutcome: RoundOutcome | null = null;
  private clock = new THREE.Clock();

  /** Touch devices have no hover, so aiming and placing need different gestures. */
  private touchMode = window.matchMedia('(pointer: coarse)').matches;
  private dragging = false;
  private dragAnchor = { x: 0, y: 0, yaw: 0, pitch: 0 };

  private readonly audio = new Audio();
  /** Last time each surface made a noise, to stop a rolling ball machine-gunning it. */
  private lastSfx: Record<string, number> = {};
  private wasDead = false;
  private chargeSfxAt = 0;

  constructor(private world: World, private ui: Ui) {
    this.ui.onStart((names) => this.startGame(names));
    this.ui.onContinue(() => this.advance());
    this.ui.onMuteToggle((muted) => this.audio.setMuted(muted));
    this.ui.onThrowButton(
      () => this.startCharging(),
      () => {
        if (this.phase === 'aim' && this.charging) this.throwBall();
      }
    );

    const canvas = this.world.renderer.domElement;
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.onPointerUp(e));

    this.world.framePlacement();
    this.world.snapCamera();
  }

  // -- lifecycle ---------------------------------------------------------

  private startGame(names: string[]) {
    this.audio.unlock();
    this.game = new Game(names);
    this.game.startRound();
    this.beginPlacement();
  }

  private beginPlacement() {
    this.phase = 'placeBucket';
    this.world.despawnBall();
    this.world.clearTrail();
    this.world.aimLine.visible = false;
    this.world.featherGroup.visible = false;
    // Touch devices have no hover event to position the ghost before the first drag.
    // Seed it in the middle of the legal zone so mobile players can immediately see
    // what they are placing; dragging still moves it normally.
    this.bucket.set(0, 0, (BUCKET_MIN_Z + BUCKET_MAX_Z) / 2);
    this.world.bucketGroup.position.copy(this.bucket);
    this.world.bucketGroup.visible = true;
    this.world.showZone(BUCKET_MIN_Z, BUCKET_MAX_Z, PLACE_HALF_WIDTH);
    this.world.framePlacement();
    this.ui.setPower(null);
    this.ui.setThrowButtonVisible(false);
    this.ui.setSequence(null);
    this.refreshHud();
  }

  private beginAim() {
    this.phase = 'aim';
    this.charging = false;
    this.dragging = false;
    this.power = 0;
    this.yaw = 0;
    this.pitch = 0.5;
    this.world.despawnBall();
    this.world.clearTrail();
    this.world.frameThrow(this.feather, this.bucket);
    this.ui.setPower(this.power);
    this.ui.setThrowButtonVisible(this.touchMode);
    this.ui.setSequence(null);
    this.updateAimLine();
    this.world.aimLine.visible = true;
    this.refreshHud();
  }

  private throwBall() {
    const game = this.game!;
    this.phase = 'flight';
    this.charging = false;
    this.wasDead = false;
    this.lastSfx = {};
    this.audio.release(this.power);
    this.world.aimLine.visible = false;
    this.ui.setPower(null);
    this.ui.setThrowButtonVisible(false);

    const origin = this.throwOrigin();
    this.world.spawnBall(origin, this.throwVelocity());
    (this.world.ballMesh.material as THREE.MeshStandardMaterial).color.set(
      game.currentPlayer.color
    );

    this.tracker = new ShotTracker(this.world.groundHandle, this.world.wallHandle, (h) =>
      this.world.isBucketCollider(h)
    );
    this.refreshHud();
  }

  private resolveThrow(result: ThrowResult) {
    const game = this.game!;
    this.phase = 'result';

    const thrower = game.currentPlayer;
    const wasOpen = !game.isStealPhase;
    this.lastOutcome = game.applyThrow(result);
    this.refreshHud();

    if (result.scored) {
      this.audio.score();
      if (!wasOpen) this.audio.steal();
    } else {
      this.audio.miss();
    }

    // Round over: the steal pass has finished.
    if (this.lastOutcome) {
      const { pointHolder } = this.lastOutcome;
      if (game.isSolo) {
        this.ui.showResult(
          'Point scored!',
          `${pointHolder.name}: ${pointHolder.score} point${pointHolder.score === 1 ? '' : 's'}. Set the next shot and keep going.`,
          true,
          'Set next shot'
        );
        return;
      }

      const lead = result.scored ? `${thrower.name} steals it! ` : `${MISS_TEXT[result.reason!]} `;
      this.ui.showResult(
        `${pointHolder.name} takes the point`,
        `${lead}${pointHolder.name} places the bucket and feather next round.`,
        true,
        'Next round'
      );
      return;
    }

    const next = game.currentPlayer.name;

    if (result.scored) {
      // Only an "open" throw can score without ending the round.
      const remaining = game.throwsRemaining + 1;
      this.ui.showResult(
        'In the bucket!',
        `${thrower.name} holds the point. ${remaining} player${remaining === 1 ? '' : 's'} can still steal it.`,
        true,
        `${next}'s throw`
      );
      return;
    }

    const detail = game.isSolo
      ? `Try again from the same spot. Current score: ${game.currentPlayer.score}.`
      : wasOpen
        ? `Still nobody in — same spot, ${next} is up.`
      : `The point stays with ${game.pointHolder!.name}.`;
    this.ui.showResult('Miss', `${MISS_TEXT[result.reason!]} ${detail}`, false, `${next}'s throw`);
  }

  /** Called when the player dismisses the result panel. */
  private advance() {
    const game = this.game!;
    if (this.lastOutcome) {
      game.startRound();
      this.beginPlacement();
    } else {
      this.beginAim();
    }
    this.lastOutcome = null;
  }

  // -- input -------------------------------------------------------------

  private setPointerNdc(e: PointerEvent) {
    this.pointer.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
  }

  /** Moves the ghost bucket/feather to wherever the pointer is over the ground. */
  private moveGhost() {
    const hit = this.world.pointerToGround(this.pointer);
    if (!hit) return;

    if (this.phase === 'placeBucket') {
      this.bucket.set(clamp(hit.x, -EDGE, EDGE), 0, clamp(hit.z, BUCKET_MIN_Z, BUCKET_MAX_Z));
      this.world.bucketGroup.position.copy(this.bucket);
      this.world.bucketGroup.visible = true;
    } else if (this.phase === 'placeFeather') {
      this.feather.set(
        clamp(hit.x, -EDGE, EDGE),
        0,
        clamp(hit.z, this.bucket.z + FEATHER_MIN_GAP, this.bucket.z + FEATHER_MAX_GAP)
      );
      this.world.featherGroup.position.copy(this.feather);
      this.world.featherGroup.visible = true;
    }
  }

  private commitPlacement() {
    if (this.phase === 'placeBucket') {
      this.world.setBucket(this.bucket.x, this.bucket.z);
      this.phase = 'placeFeather';
      this.feather.set(
        this.bucket.x,
        0,
        clamp(this.bucket.z + 3, this.bucket.z + FEATHER_MIN_GAP, this.bucket.z + FEATHER_MAX_GAP)
      );
      this.world.setFeather(this.feather.x, this.feather.z);
      this.world.showZone(
        this.bucket.z + FEATHER_MIN_GAP,
        this.bucket.z + FEATHER_MAX_GAP,
        PLACE_HALF_WIDTH
      );
      this.refreshHud();
    } else if (this.phase === 'placeFeather') {
      this.world.setFeather(this.feather.x, this.feather.z);
      this.world.hideZone();
      this.beginAim();
    }
  }

  private startCharging() {
    if (this.phase !== 'aim') return;
    this.charging = true;
    this.chargeTime = 0;
  }

  /** Absolute aim from pointer position (mouse hover). */
  private aimFromPointer() {
    this.yaw = clamp(this.pointer.x, -1, 1) * MAX_YAW;
    const t = (clamp(this.pointer.y, -1, 1) + 1) / 2;
    this.pitch = MIN_PITCH + t * (MAX_PITCH - MIN_PITCH);
    this.updateAimLine();
  }

  /** Relative aim from a drag (touch), so the finger never has to cover the target. */
  private aimFromDrag(e: PointerEvent) {
    const dx = (e.clientX - this.dragAnchor.x) / window.innerWidth;
    const dy = (e.clientY - this.dragAnchor.y) / window.innerHeight;
    this.yaw = clamp(this.dragAnchor.yaw + dx * 2 * MAX_YAW, -MAX_YAW, MAX_YAW);
    this.pitch = clamp(
      this.dragAnchor.pitch - dy * 1.6 * (MAX_PITCH - MIN_PITCH),
      MIN_PITCH,
      MAX_PITCH
    );
    this.updateAimLine();
  }

  private onPointerMove(e: PointerEvent) {
    if (e.pointerType === 'touch') this.setTouchMode(true);
    this.setPointerNdc(e);

    if (this.phase === 'placeBucket' || this.phase === 'placeFeather') {
      // Mouse tracks hover; touch only updates while a finger is down.
      if (!this.touchMode || this.dragging) this.moveGhost();
    } else if (this.phase === 'aim' && !this.charging) {
      if (this.touchMode) {
        if (this.dragging) this.aimFromDrag(e);
      } else {
        this.aimFromPointer();
      }
    }
  }

  private onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'touch') this.setTouchMode(true);
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    this.setPointerNdc(e);
    this.dragging = true;

    if (this.phase === 'placeBucket' || this.phase === 'placeFeather') {
      this.moveGhost();
      // Mouse commits on click; touch lets you drag first and commits on release.
      if (!this.touchMode) { this.audio.click(); this.commitPlacement(); }
    } else if (this.phase === 'aim') {
      if (this.touchMode) {
        this.dragAnchor = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch };
      } else {
        this.startCharging();
      }
    }
  }

  private onPointerUp(e: PointerEvent) {
    if (!this.dragging) return;
    this.dragging = false;

    if (this.phase === 'placeBucket' || this.phase === 'placeFeather') {
      if (this.touchMode) { this.audio.click(); this.commitPlacement(); }
      return;
    }

    if (this.phase === 'aim' && !this.touchMode && this.charging) this.throwBall();
    void e;
  }

  private setTouchMode(on: boolean) {
    if (this.touchMode === on) return;
    this.touchMode = on;
    this.ui.setThrowButtonVisible(on && this.phase === 'aim');
  }

  // -- dev test seam -----------------------------------------------------
  // Only reachable through window.__giitb, which is registered under
  // import.meta.env.DEV and therefore absent from production bundles. These methods
  // survive minification as unreachable dead code (class members are not tree-shaken),
  // but nothing in a production build can call them.
  //
  // This exists because the browser test needs an exact known-good throw, and mouse
  // input cannot deliver one: power depends on release timing to within about ±0.008.

  devSetup(bx: number, bz: number, fx: number, fz: number) {
    this.bucket.set(bx, 0, bz);
    this.world.setBucket(bx, bz);
    this.feather.set(fx, 0, fz);
    this.world.setFeather(fx, fz);
    this.world.hideZone();
    this.beginAim();
  }

  devThrow(yaw: number, pitch: number, power: number) {
    if (this.phase !== 'aim') throw new Error(`devThrow in phase ${this.phase}`);
    this.yaw = yaw;
    this.pitch = pitch;
    this.power = power;
    this.charging = false;
    this.throwBall();
  }

  devState() {
    const g = this.game;
    return {
      phase: this.phase,
      current: g?.currentPlayer.name ?? null,
      placer: g?.placer.name ?? null,
      pointHolder: g?.pointHolder?.name ?? null,
      isStealPhase: g?.isStealPhase ?? false,
      lap: g?.lap ?? 0,
      scores: g?.players.map((p) => ({ name: p.name, score: p.score })) ?? [],
      bucketVisible: this.world.bucketGroup.visible,
      bucketPosition: this.world.bucketGroup.position.toArray()
    };
  }

  // -- aiming maths ------------------------------------------------------

  private throwOrigin() {
    return new THREE.Vector3(this.feather.x, THROW_HEIGHT, this.feather.z);
  }

  private throwVelocity() {
    const speed = MIN_SPEED + this.power * (MAX_SPEED - MIN_SPEED);
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(
      Math.sin(this.yaw) * cp,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cp
    ).multiplyScalar(speed);
  }

  /**
   * Draws the aiming preview. It reveals the flight up to and including the wall strike —
   * enough to read the bounce deliberately — but stops there, so judging the final arc
   * into the bucket is still on the player.
   */
  private updateAimLine() {
    const { points, wallIndex } = predictPath(this.throwOrigin(), this.throwVelocity());

    const cut = wallIndex === -1 ? points.length : Math.min(points.length, wallIndex + 16);
    const shown = points.slice(0, cut);

    this.world.aimLine.geometry.setFromPoints(shown);
    this.world.aimLine.computeLineDistances();
  }

  /**
   * Turns collision events into noises. A ball settling or rolling generates a stream of
   * contacts, so each surface is throttled and very soft hits are ignored.
   */
  private playImpacts(hits: Array<{ handle: number; started: boolean }>) {
    const speed = this.world.ballSpeed;
    if (speed < 0.7) return;

    const now = performance.now();
    const fire = (key: string, gap: number, play: () => void) => {
      if (now - (this.lastSfx[key] ?? -Infinity) < gap) return;
      this.lastSfx[key] = now;
      play();
    };

    for (const hit of hits) {
      if (!hit.started) continue;
      const strength = Math.min(1, speed / 8);

      if (hit.handle === this.world.groundHandle) {
        fire('ground', 90, () => this.audio.bounce(strength));
      } else if (hit.handle === this.world.wallHandle) {
        fire('wall', 90, () => this.audio.wallHit(strength));
      } else if (this.world.isBucketCollider(hit.handle)) {
        fire('bucket', 70, () => this.audio.bucketHit(strength));
      }
    }
  }

  // -- frame loop --------------------------------------------------------

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.phase === 'aim' && this.charging) {
      this.chargeTime += dt;
      const t = (this.chargeTime % POWER_PERIOD) / POWER_PERIOD;
      const sweep = t < 0.5 ? t * 2 : 2 - t * 2;
      this.power = Math.pow(sweep, POWER_CURVE);
      this.ui.setPower(this.power);
      this.updateAimLine();

      this.chargeSfxAt += dt;
      if (this.chargeSfxAt > 0.07) {
        this.chargeSfxAt = 0;
        this.audio.charge(this.power);
      }
    }

    if (this.phase === 'flight' && this.tracker) {
      const substeps = clamp(Math.round(dt / this.world.physics.timestep), 1, 5);
      const hits = this.world.stepPhysics(substeps);
      this.tracker.registerHits(hits);
      this.playImpacts(hits);

      const pos = this.world.ballPosition;
      if (pos) this.world.trackFlight(pos, this.bucket);

      const result = this.tracker.update(dt, pos, this.world.ballSpeed, this.bucket);
      this.ui.setSequence(this.tracker.sequenceState);
      this.world.setBallDead(this.tracker.failed);

      if (this.tracker.failed && !this.wasDead) {
        this.wasDead = true;
        this.audio.dead();
      }

      if (result) {
        this.tracker = null;
        this.resolveThrow(result);
      }
    }

    this.world.updateCamera(dt);
    this.world.render();
  }

  // -- hud ---------------------------------------------------------------

  private refreshHud() {
    const game = this.game;
    if (!game) return;

    const placing = this.phase === 'placeBucket' || this.phase === 'placeFeather';
    const active = placing ? game.placer : game.currentPlayer;
    const highlight = this.phase === 'result' || !active ? null : active.id;
    this.ui.renderScores(game, highlight);

    switch (this.phase) {
      case 'placeBucket':
        this.ui.setBanner(
          game.placer,
          this.touchMode
            ? 'Drag to place the bucket in front of the wall.'
            : 'Click to place the bucket in front of the wall.'
        );
        break;
      case 'placeFeather':
        this.ui.setBanner(
          game.placer,
          this.touchMode
            ? 'Drag to place the feather — further from the wall than the bucket.'
            : 'Click to place the feather — further from the wall than the bucket.'
        );
        break;
      case 'aim': {
        const hint = this.touchMode
          ? 'Drag to aim, then hold THROW and release on the power you want.'
          : 'Move to aim, hold the mouse to charge, release on the power you want.';
        const lead = game.isSolo
          ? 'Solo — '
          : game.isStealPhase
          ? 'Steal attempt — '
          : game.lap > 1
            ? `Still nobody in (lap ${game.lap}) — `
            : '';
        this.ui.setBanner(game.currentPlayer, lead + hint);
        break;
      }
      case 'flight':
        this.ui.setBanner(game.currentPlayer, 'Ground → wall → bucket…');
        break;
      case 'result':
        this.ui.setBanner(null, '');
        break;
    }
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

async function boot() {
  await RAPIER.init();
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const world = new World(canvas);
  const controller = new Controller(world, new Ui());

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__giitb = {
      setup: (bx: number, bz: number, fx: number, fz: number) =>
        controller.devSetup(bx, bz, fx, fz),
      throwExact: (yaw: number, pitch: number, power: number) =>
        controller.devThrow(yaw, pitch, power),
      state: () => controller.devState()
    };
  }

  const loop = () => {
    controller.tick();
    requestAnimationFrame(loop);
  };
  loop();
}

boot();
