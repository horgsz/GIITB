import { makeCourt, throwOnce } from './sim-core.mjs';
import { solve, CFG } from './solver.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Honest playability metric: around a known solution, sample a local window of aim inputs
 * and report what fraction score. Re-centres on the centroid of the scoring samples first,
 * because the optimiser lands on the edge of the feasible set, not its middle.
 */
export function windowRate(cfg, layout, seed, n = 12, span = { yaw: 0.18, pitch: 0.18, power: 0.18 }) {
  const court = makeCourt(cfg, layout.bucket);
  const sample = (centre) => {
    const hits = [];
    let total = 0;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        for (let k = 0; k <= n; k++) {
          const yaw = clamp(centre.yaw + (i / n - 0.5) * 2 * span.yaw, -cfg.maxYaw, cfg.maxYaw);
          const pitch = clamp(centre.pitch + (j / n - 0.5) * 2 * span.pitch, cfg.minPitch, cfg.maxPitch);
          const power = clamp(centre.power + (k / n - 0.5) * 2 * span.power, 0, 1);
          total++;
          if (throwOnce(court, cfg, layout.feather, yaw, pitch, power).cost === 0) {
            hits.push({ yaw, pitch, power });
          }
        }
      }
    }
    return { hits, total };
  };

  let { hits, total } = sample(seed);
  let centre = seed;
  if (hits.length > 2) {
    centre = {
      yaw: hits.reduce((a, h) => a + h.yaw, 0) / hits.length,
      pitch: hits.reduce((a, h) => a + h.pitch, 0) / hits.length,
      power: hits.reduce((a, h) => a + h.power, 0) / hits.length
    };
    ({ hits, total } = sample(centre));
  }

  court.w.free();
  return { rate: hits.length / total, centre, count: hits.length };
}

const LAYOUTS = [
  { name: 'A close', bucket: { x: 0, z: 1.2 }, feather: { x: 0, z: 4 } },
  { name: 'B mid', bucket: { x: -0.8, z: 2.0 }, feather: { x: 0.6, z: 6 } },
  { name: 'C deep', bucket: { x: 0.4, z: 3.0 }, feather: { x: -0.4, z: 8 } }
];

const configs = [
  { label: 'STRICT r=0.28', bucketR: 0.28 },
  { label: 'RELAXED r=0.28', bucketR: 0.28, allowBounceAfterWall: true },
  { label: 'RELAXED r=0.35 dead', bucketR: 0.35, courtRest: 0.6, ballRest: 0.65, allowBounceAfterWall: true },
  { label: 'RELAXED r=0.45 dead', bucketR: 0.45, courtRest: 0.55, ballRest: 0.6, allowBounceAfterWall: true }
];

// Only run the comparison when invoked directly, not when imported as a module.
if (process.argv[1] && process.argv[1].endsWith('window.mjs')) {
  for (const c of configs) {
    const cfg = { ...CFG, ...c };
    const parts = [];
    for (const L of LAYOUTS) {
      const s = solve(cfg, L, 45);
      if (s.cost !== 0) { parts.push(`${L.name}=unsolvable`); continue; }
      const w = windowRate(cfg, L, { yaw: s.yaw, pitch: s.pitch, power: s.power });
      parts.push(`${L.name}=${(w.rate * 100).toFixed(1)}%`);
    }
    console.log(`${c.label.padEnd(22)} local window hit-rate: ${parts.join('  ')}`);
  }
}
