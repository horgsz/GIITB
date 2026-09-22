import { solve, CFG } from './solver.mjs';

// Must mirror src/constants.ts.
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

const layout = {
  bucket: { x: Number(process.env.BX ?? 0), z: Number(process.env.BZ ?? 1.55) },
  feather: { x: Number(process.env.FX ?? 0), z: Number(process.env.FZ ?? 5.3) }
};

const r = solve(cfg, layout, 60);
if (r.cost !== 0) {
  console.log(`no solution (best miss ${r.cost.toFixed(3)})`);
  process.exit(1);
}

console.log(JSON.stringify({
  bucket: layout.bucket,
  feather: layout.feather,
  yaw: r.yaw,
  pitch: r.pitch,
  power: r.power,
  tolerance: {
    yaw: r.tol.yaw,
    pitch: r.tol.pitch,
    power: r.tol.power
  }
}, null, 2));
