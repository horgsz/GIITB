import RAPIER from '@dimforge/rapier3d-compat';

const FIELD_HALF_WIDTH = 6, WALL_HEIGHT = 5, RING = 20;
const BALL_R = 0.045, BUCKET_H = 0.36, BUCKET_WALL_T = 0.012;
const THROW_HEIGHT = 1.55;

await RAPIER.init();

export function makeCourt(cfg, bucket) {
  const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  w.timestep = 1 / 120;
  const ev = new RAPIER.EventQueue(true);

  const gb = w.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const ground = w.createCollider(
    RAPIER.ColliderDesc.cuboid(30, 0.5, 30).setTranslation(0, -0.5, 0)
      .setRestitution(cfg.courtRest).setFriction(0.7)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), gb).handle;

  const wb = w.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const wall = w.createCollider(
    RAPIER.ColliderDesc.cuboid(FIELD_HALF_WIDTH, WALL_HEIGHT / 2, 0.25)
      .setTranslation(0, WALL_HEIGHT / 2, -0.25)
      .setRestitution(cfg.courtRest).setFriction(0.5)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), wb).handle;

  const bb = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(bucket.x, 0, bucket.z));
  const bucketHandles = new Set();
  const mat = (d) => d.setRestitution(0.12).setFriction(0.9)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  bucketHandles.add(w.createCollider(
    mat(RAPIER.ColliderDesc.cylinder(0.01, cfg.bucketR)).setTranslation(0, 0.01, 0), bb).handle);
  const hw = cfg.bucketR * Math.tan(Math.PI / RING);
  for (let i = 0; i < RING; i++) {
    const t = (i / RING) * Math.PI * 2, rad = cfg.bucketR + BUCKET_WALL_T / 2;
    bucketHandles.add(w.createCollider(
      mat(RAPIER.ColliderDesc.cuboid(hw, BUCKET_H / 2, BUCKET_WALL_T / 2))
        .setTranslation(Math.sin(t) * rad, BUCKET_H / 2, Math.cos(t) * rad)
        .setRotation({ x: 0, y: Math.sin(t / 2), z: 0, w: Math.cos(t / 2) }), bb).handle);
  }
  return { w, ev, ground, wall, bucketHandles, bucket };
}

/**
 * Simulates one throw. Returns the outcome plus a continuous `cost` used for optimisation:
 * 0 on a make, otherwise how far (in metres) the ball was from dropping into the bucket,
 * with penalties layered on for breaking the bounce sequence.
 */
export function throwOnce(court, cfg, feather, yaw, pitch, power) {
  const { w, ev, ground, wall, bucketHandles, bucket } = court;
  const speed = cfg.minSpeed + power * (cfg.maxSpeed - cfg.minSpeed);
  const cp = Math.cos(pitch);

  const body = w.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(feather.x, THROW_HEIGHT, feather.z)
    .setLinvel(Math.sin(yaw) * cp * speed, Math.sin(pitch) * speed, -Math.cos(yaw) * cp * speed)
    .setLinearDamping(cfg.linDamp).setAngularDamping(cfg.angDamp).setCcdEnabled(true));
  const ball = w.createCollider(RAPIER.ColliderDesc.ball(BALL_R)
    .setRestitution(cfg.ballRest).setFriction(0.45).setDensity(1.2)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);

  let stage = 'air', fail = null, insideFor = 0, restFor = 0, out = null;
  let best = Infinity, reachedWall = false;
  const dt = w.timestep;

  for (let i = 0; i < 10 * 120 && !out; i++) {
    w.step(ev);
    ev.drainCollisionEvents((h1, h2, started) => {
      if (!started || (h1 !== ball.handle && h2 !== ball.handle)) return;
      const o = h1 === ball.handle ? h2 : h1;
      if (bucketHandles.has(o) || fail) return;
      if (o === ground) {
        if (stage === 'air') stage = 'ground';
        else if (stage === 'wall' && cfg.allowBounceAfterWall) { /* rolling in is allowed */ }
        else fail = stage === 'ground' ? 'doubleBounce' : 'bounceAfterWall';
      } else if (o === wall) {
        if (stage === 'air') fail = 'wallFirst';
        else if (stage === 'ground') { stage = 'wall'; reachedWall = true; }
        else fail = 'doubleWall';
      }
    });

    const p = body.translation(), lv = body.linvel();
    const sp = Math.hypot(lv.x, lv.y, lv.z);
    const radial = Math.hypot(p.x - bucket.x, p.z - bucket.z);

    // Closest approach to the rim at any point, used as the optimiser's gradient.
    if (p.y < BUCKET_H + 0.35) best = Math.min(best, radial);

    const inside = radial < cfg.bucketR - BALL_R * 0.4 && p.y > BALL_R * 0.5 && p.y < BUCKET_H;
    insideFor = inside ? insideFor + dt : 0;

    if (insideFor >= 0.5) {
      out = fail ? { scored: false, reason: fail }
        : stage !== 'wall' ? { scored: false, reason: 'noSequence' }
        : { scored: true, reason: 'SCORE' };
    } else if (Math.abs(p.x) > 20 || p.z > 32 || p.z < -4 || p.y < -2) {
      out = { scored: false, reason: fail ?? 'outOfPlay' };
    } else {
      restFor = sp < 0.3 && !inside ? restFor + dt : 0;
      if (restFor > 0.7) out = { scored: false, reason: fail ?? 'missedBucket' };
    }
  }

  w.removeRigidBody(body);
  const res = out ?? { scored: false, reason: fail ?? 'timeout' };

  /*
   * Cost must be informative everywhere, or the optimiser lands on a flat plateau and
   * cannot escape. Three additive terms: how far through ground -> wall the shot got,
   * whether a rule was broken, and how close the ball came to the rim.
   */
  if (res.scored) {
    res.cost = 0;
  } else {
    const stagePenalty = stage === 'air' ? 20 : stage === 'ground' ? 10 : 0;
    const failPenalty = fail ? 15 : 0;
    const distance = Number.isFinite(best) ? Math.min(best, 10) : 10;
    res.cost = stagePenalty + failPenalty + distance;
  }
  res.reachedWall = reachedWall;
  return res;
}
