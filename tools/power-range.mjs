import { solve, CFG } from './solver.mjs';

// Where does the useful part of the power bar actually sit?
const cfg = {
  ...CFG, bucketR: 0.35, minPitch: -0.9, maxPitch: 1.1,
  minSpeed: Number(process.env.MIN_SPEED ?? 5),
  maxSpeed: Number(process.env.MAX_SPEED ?? 17)
};

const cases = [];
for (const bz of [0.6, 1.55, 2.5]) {
  for (const gap of [2.0, 3.75, 5.5]) {
    cases.push({ bucket: { x: 0, z: bz }, feather: { x: 0, z: bz + gap } });
  }
}

const powers = [];
const speeds = [];
for (const L of cases) {
  const r = solve(cfg, L, 120);
  if (r.cost !== 0) { console.log(`  unsolved ${L.bucket.z}/${L.feather.z}`); continue; }
  const speed = cfg.minSpeed + r.power * (cfg.maxSpeed - cfg.minSpeed);
  powers.push(r.power);
  speeds.push(speed);
  console.log(
    `  bucket z=${L.bucket.z} feather z=${L.feather.z.toFixed(2)}  ` +
    `power=${r.power.toFixed(3)}  speed=${speed.toFixed(2)} m/s  pitch=${r.pitch.toFixed(2)}`
  );
}

const min = Math.min(...speeds), max = Math.max(...speeds);
console.log(`\nspeed range used: ${min.toFixed(2)} .. ${max.toFixed(2)} m/s`);
console.log(`power range used: ${Math.min(...powers).toFixed(3)} .. ${Math.max(...powers).toFixed(3)}`);
console.log(`suggested MIN_SPEED=${Math.max(1, min - 1.5).toFixed(1)}  MAX_SPEED=${(max + 1.5).toFixed(1)}`);
