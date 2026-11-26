import type { Corner } from './types';
import { PART, REGIONS } from './regions';
import type { Region } from './regions';

/** The angle of the rest point (x, z) round the region's middle line, degrees: + outward on a limb, toward +x on the trunk; from the region's face. */
export const angle = (g: Region, x: number, z: number) => {
  const side = g.part == PART.TRUNK && !g.legs ? 1 : Math.sign(x) || 1;
  const a = (Math.atan2((x - g.cx * side) * side, -z) * 180) / Math.PI;
  return g.face ? ((a - g.face + 540) % 360) - 180 : a;
};

/** The region's constraints on a rest point, each >= 0 inside. */
const limits = (g: Region) => {
  const raw = (c: Corner) => angle({ ...g, face: 0 }, c[0], c[2]);
  return [
    (c: Corner) => c[1] - (g.low ? g.low(raw(c), c) : g.y[0]),
    (c: Corner) => (g.high ? Math.min(g.high(raw(c), c), g.y[1]) : g.y[1]) - c[1],
    (c: Corner) => angle(g, c[0], c[2]) - g.a[0],
    (c: Corner) => g.a[1] - angle(g, c[0], c[2]),
    ...(g.round
      ? [
          (c: Corner) => {
            const [ha, cy, hy] = g.round!;
            return 1 - (angle(g, c[0], c[2]) / ha) ** 2 - ((c[1] - cy) / hy) ** 2;
          },
        ]
      : []),
  ];
};

const mix = (p: Corner, q: Corner, t: number) => p.map((v, i) => v + (q[i] - v) * t);

/** Each triangle in four, by its edges' middles. */
export const split = (tris: Corner[][]) =>
  tris.flatMap(([a, b, c]) => {
    const [ab, bc, ca] = [mix(a, b, 0.5), mix(b, c, 0.5), mix(c, a, 0.5)];
    return [
      [a, ab, ca],
      [ab, b, bc],
      [ca, bc, c],
      [ab, bc, ca],
    ];
  });

/** Where the corner `c` of a moulded plate lies at rest: set off by `m` (moulding()), as a point to test against a region's limits. */
export const landed = (c: Corner, m: number[]): Corner => [
  c[0] + m[4] * m[0],
  c[1] + m[5] * m[0],
  c[2] + m[6] * m[0],
  0,
  0,
  0,
  0,
  0,
  0,
  0,
];

/** Clips the polygon `poly` to where `f` >= 0 (Sutherland-Hodgman, corners eased along the edges). */
export const clip = (poly: Corner[], f: (c: Corner) => number, bit: number) => {
  const out: Corner[] = [];
  // Each corner's once: a moulded plate's limit looks for its place on the shell.
  const fs = poly.map(f);
  for (let i = 0; i < poly.length; i++) {
    const [p, q] = [poly[i], poly[(i + 1) % poly.length]];
    const [fp, fq] = [fs[i], fs[(i + 1) % poly.length]];
    if (fp >= 0) {
      out.push(p);
    }
    if (fp >= 0 != fq >= 0) {
      // A corner on the region's edge: marked with the limit that made it (BITS).
      // Where the limit is nil between them: by halves, for a limit that is no straight line
      // (a curved edge cut by straight-line guesses came out in teeth).
      let [lo, hi] = [0, 1];
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        if (f(mix(p, q, mid)) >= 0 == fp >= 0) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      const c = mix(p, q, (lo + hi) / 2);
      c[BITS] = (p[BITS] & q[BITS]) | bit;
      out.push(c);
    }
  }
  return out;
};

/** How far round past a plate's side a skin triangle may lie and still be cut (degrees). */
export const REACH = 40;

/** Where a corner keeps the limits it lies on (a bit each): two corners sharing one make an edge of the plate. */
export const BITS = 9;

export const LIMITS = REGIONS.map(g => limits(g));
/** Each region's heights, to pass over the triangles out of all reach at once. */
export const SPANS = REGIONS.map(g => [g.y[0] - 0.003, g.y[1] + 0.003]);

/** How many scratches the plates have close up, and their colours: worn to the grey, or paler. */
export const SCRATCHES = 110;
export const WORN = [
  [0.46, 0.47, 0.5],
  [0.62, 0.63, 0.66],
];
/** The scratches' colours on coloured plates: the white under the paint, and paler. */
export const SCRATCHED = [
  [0.86, 0.87, 0.89],
  [0.97, 0.97, 0.98],
];
