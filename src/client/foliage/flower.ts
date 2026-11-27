// Small red flowers among the ferns (the user, 2026-11-27): a few blooms a clump, each five
// petals round a yellow heart, held up a little on its own and tilted its own way. Lit paint;
// the petals' normals lean up, lit from above on both faces as the fronds are.
import { TAU } from '../../shared/physics';
import { hash } from '../../shared/relief';

/** Petals a bloom. */
const PETALS = 5;
/** Red petals, a little apart from one clump to the next; and the heart. */
const [RED, HEART] = [
  [0.75, 0.04, 0.03],
  [0.9, 0.6, 0.05],
];

/** One flat triangle, its normal `n`, its colour `c`. */
const tri = (o: number[], a: number[], b: number[], d: number[], n: number[], c: number[]) => {
  for (const p of [a, b, d]) {
    o.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], -1, c[2]);
  }
};

/** A clump of blooms round (x, y, z), seed s: two to four, some 50 cm about, a hand or two over the ground. */
export const flowers = (o: number[], x: number, y: number, z: number, s: number) => {
  const h = (k: number) => hash(s, k, 91);
  const n = 2 + Math.floor(3 * h(0));
  const tint = 0.8 + 0.4 * h(1);
  const red = RED.map((v, i) => v * tint * (i ? 1 + 0.5 * h(2) : 1));
  for (let k = 0; k < n; k++) {
    const g = TAU * (k / n + 0.3 * h(3 + k));
    const at = [
      x + 0.5 * h(10 + k) * Math.cos(g),
      y + 0.15 + 0.2 * h(20 + k),
      z + 0.5 * h(10 + k) * Math.sin(g),
    ];
    const r = 0.12 + 0.08 * h(30 + k);
    // Tilted toward the light a little, each its own way.
    const [tx, tz] = [0.4 * (h(40 + k) - 0.5), 0.4 * (h(50 + k) - 0.5)];
    const up = (dx: number, dz: number) => at[1] + tx * dx + tz * dz;
    const l = Math.hypot(tx, 1, tz);
    const nrm = [-tx / l, 1 / l, -tz / l];
    for (let p = 0; p < PETALS; p++) {
      const [a0, a1] = [(TAU * p) / PETALS + g, (TAU * (p + 0.5)) / PETALS + g];
      // A petal: a kite from the heart out past its tip, wider at its middle.
      const tip = [at[0] + r * Math.cos(a1), 0, at[2] + r * Math.sin(a1)];
      tip[1] = up(tip[0] - at[0], tip[2] - at[2]) + 0.02;
      const side = (a: number) => {
        const q = [at[0] + 0.55 * r * Math.cos(a), 0, at[2] + 0.55 * r * Math.sin(a)];
        q[1] = up(q[0] - at[0], q[2] - at[2]);
        return q;
      };
      tri(o, at, side(a0), tip, nrm, red);
      tri(o, at, tip, side(a0 + TAU / PETALS), nrm, red);
    }
    // The heart, a small triangle over the petals.
    const hr = 0.3 * r;
    tri(
      o,
      [at[0] + hr, at[1] + 0.015, at[2]],
      [at[0] - hr / 2, at[1] + 0.015, at[2] + hr * 0.87],
      [at[0] - hr / 2, at[1] + 0.015, at[2] - hr * 0.87],
      nrm,
      HEART,
    );
  }
};
