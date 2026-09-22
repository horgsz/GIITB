import { solve, CFG } from './solver.mjs';
import { windowRate } from './window.mjs';

// Must mirror src/constants.ts exactly.
const cfg = {
  ...CFG,
  bucketR: 0.35,
  minPitch: -0.9,
  maxPitch: 1.1,
  minSpeed: 5,
  maxSpeed: 17,
  maxYaw: Math.PI / 3.6,
  linDamp: 0.04,
  angDamp: 0.3,
  ballRest: 0.8,
  courtRest: 0.72
};

// Corners and centre of the allowed placement zone.
const BZ = [0.6, 1.55, 2.5];
const GAP = [2.0, 3.75, 5.5];
const X = [-2.0, 0, 2.0];

const cases = [];
for (const bz of BZ) for (const gap of GAP) {
  cases.push({ bucket: { x: 0, z: bz }, feather: { x: 0, z: bz + gap } });
}
// A few worst-case lateral offsets too.
for (const bx of X) for (const fx of X) {
  if (bx === 0 && fx === 0) continue;
  cases.push({ bucket: { x: bx, z: 1.55 }, feather: { x: fx, z: 1.55 + 3.75 } });
}

let ok = 0;
const failures = [];
for (const L of cases) {
  const r = solve(cfg, L, 140);
  const tag = `bucket(${L.bucket.x},${L.bucket.z}) feather(${L.feather.x},${L.feather.z})`;
  if (r.cost === 0) {
    ok++;
    console.log(`  OK   ${tag}`);
  } else {
    failures.push({ tag, cost: r.cost });
    console.log(`  FAIL ${tag}  best miss ${r.cost.toFixed(2)} m`);
  }
}

console.log(`\nsolvable: ${ok}/${cases.length}`);
if (failures.length) {
  console.log('unsolvable placements:');
  failures.forEach((f) => console.log(`  ${f.tag} (${f.cost.toFixed(2)})`));
}

// Playability of a representative mid-zone layout.
const mid = { bucket: { x: 0, z: 1.55 }, feather: { x: 0, z: 5.3 } };
const s = solve(cfg, mid, 140);
if (s.cost === 0) {
  const w = windowRate(cfg, mid, { yaw: s.yaw, pitch: s.pitch, power: s.power });
  console.log(`\nmid-zone window hit-rate: ${(w.rate * 100).toFixed(1)}%`);
  console.log(`ideal shot: yaw=${s.yaw.toFixed(3)} pitch=${s.pitch.toFixed(3)} power=${s.power.toFixed(3)}`);
}
