import { solve, CFG } from './solver.mjs';

// Strict rules: no ground contact after the wall. Find where a legal shot exists at all.
const bucketZs = [0.6, 1.0, 1.4, 1.8, 2.2];
const gaps = [2, 3.5, 5];

for (const bucketR of [0.28, 0.35, 0.45]) {
  const cfg = { ...CFG, bucketR };
  console.log(`\n=== bucket radius ${bucketR} m ===`);
  for (const bz of bucketZs) {
    const cells = [];
    for (const gap of gaps) {
      const L = { bucket: { x: 0, z: bz }, feather: { x: 0, z: bz + gap } };
      const r = solve(cfg, L, 50);
      cells.push(`gap${gap}=${r.cost === 0 ? 'YES' : `no(${r.cost.toFixed(1)})`}`);
    }
    console.log(`  bucket z=${bz}  ${cells.join('  ')}`);
  }
}
