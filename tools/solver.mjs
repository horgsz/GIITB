import { makeCourt, throwOnce } from './sim-core.mjs';

export const CFG = {
  bucketR: 0.28,
  ballRest: 0.8,
  courtRest: 0.72,
  minSpeed: 5,
  maxSpeed: 17,
  minPitch: -0.9,
  maxPitch: 1.1,
  maxYaw: Math.PI / 3.6,
  // Flight damping only. Rolling resistance is applied on the ground at runtime.
  linDamp: 0.04,
  angDamp: 0.3
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Compass search over (yaw, pitch, power) with a shrinking step. */
function refine(court, cfg, feather, start) {
  let [yaw, pitch, power] = start;
  let cost = throwOnce(court, cfg, feather, yaw, pitch, power).cost;
  let step = [0.08, 0.08, 0.08];

  for (let iter = 0; iter < 60 && cost > 0; iter++) {
    let improved = false;
    const axes = [
      [step[0], 0, 0], [-step[0], 0, 0],
      [0, step[1], 0], [0, -step[1], 0],
      [0, 0, step[2]], [0, 0, -step[2]]
    ];
    for (const [dy, dp, dw] of axes) {
      const ny = clamp(yaw + dy, -cfg.maxYaw, cfg.maxYaw);
      const np = clamp(pitch + dp, cfg.minPitch, cfg.maxPitch);
      const nw = clamp(power + dw, 0, 1);
      const c = throwOnce(court, cfg, feather, ny, np, nw).cost;
      if (c < cost) { cost = c; yaw = ny; pitch = np; power = nw; improved = true; }
    }
    if (!improved) {
      step = step.map((s) => s * 0.55);
      if (step[0] < 0.0008) break;
    }
  }
  return { yaw, pitch, power, cost };
}

/**
 * Finds a scoring throw for a layout, or the closest near-miss.
 *
 * Seeds are taken from a coarse grid sorted by cost rather than sampled randomly, so
 * results are deterministic and repeatable — a random multi-start disagreed with itself
 * between runs, which made it useless for validating constants.
 */
export function solve(cfg, layout, starts = 40) {
  const court = makeCourt(cfg, layout.bucket);

  const seeds = [];
  const N = 9;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      for (let k = 0; k <= N; k++) {
        const yaw = -cfg.maxYaw + (i / N) * 2 * cfg.maxYaw;
        const pitch = cfg.minPitch + (j / N) * (cfg.maxPitch - cfg.minPitch);
        const power = k / N;
        const r = throwOnce(court, cfg, layout.feather, yaw, pitch, power);
        if (r.cost === 0) {
          const hit = { yaw, pitch, power, cost: 0 };
          const tol = measureTolerance(court, cfg, layout, hit);
          court.w.free();
          return { ...hit, tol };
        }
        seeds.push({ yaw, pitch, power, cost: r.cost });
      }
    }
  }

  seeds.sort((a, b) => a.cost - b.cost);
  let best = { cost: Infinity };
  for (let s = 0; s < Math.min(starts, seeds.length); s++) {
    const seed = seeds[s];
    const r = refine(court, cfg, layout.feather, [seed.yaw, seed.pitch, seed.power]);
    if (r.cost < best.cost) best = r;
    if (best.cost === 0) break;
  }

  const tol = best.cost === 0 ? measureTolerance(court, cfg, layout, best) : null;
  court.w.free();
  return { ...best, tol };
}

/** How much slop a player has around a solution on each axis. */
function measureTolerance(court, cfg, layout, best) {
  const probe = (axis) => {
    let lo = 0, hi = 0;
    for (let d = 0.002; d <= 0.5; d += 0.002) {
      const p = [best.yaw, best.pitch, best.power];
      p[axis] += d;
      if (throwOnce(court, cfg, layout.feather, p[0], p[1], p[2]).cost !== 0) break;
      hi = d;
    }
    for (let d = 0.002; d <= 0.5; d += 0.002) {
      const p = [best.yaw, best.pitch, best.power];
      p[axis] -= d;
      if (throwOnce(court, cfg, layout.feather, p[0], p[1], p[2]).cost !== 0) break;
      lo = d;
    }
    return { lo, hi };
  };
  return { yaw: probe(0), pitch: probe(1), power: probe(2) };
}
