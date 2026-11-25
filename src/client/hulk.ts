// Landfall's scenery (docs/BEACH.md): the crashed ship and its debris, drawn once on the map's
// boxes (LAYOUT of shared/beach.ts), which are ghosts: what is drawn here is what stops a runner.
// The hull's section is the stacked boxes of RINGS with their corners cut and filled, not the
// circle through them: a circle of 7 m would stand 1.5 m off the ledges a runner walks.
// Painted panels (TEX.PAINT, dimmed where it burnt), flat lit paint (layer -1), a few glows (-2).
import { HOLD, LAYOUT, ZED } from '../shared/beach';
import type { Piece } from '../shared/beach';
import { TEAM_TINT } from '../shared/map';
import { ground, hash, noise, raise } from '../shared/relief';
import { TEX } from '../shared/types';
import type { World, WorldDef } from '../shared/world';
import { SHINE, dress, place, smooth } from './mesh';
import type { Vec3 } from './mesh';
import { SAND } from './shore';

type V = number[];
/** A material: a texture (`l` its layer, c[0] its light, `s` its tiles a metre) or a flat paint (`l` under 0, `c` its colour). */
interface Mat {
  l: number;
  c: V;
  s: number;
}
const tex = (l: number, k = 1, s = 1): Mat => ({ l, c: [k], s });
const ink = (c: V, k = 1, l = -1): Mat => ({ l, c: c.map(v => v * k), s: 1 });

const MID = ZED / 2;
/** The hull's paint in the light; its panels are 2 m. */
const PALE = 0.52;
const SKIN = tex(TEX.PAINT, PALE, 0.5);
const GIRDER = tex(TEX.STEEL, 0.45);
const PLATE = tex(TEX.METAL, 0.7);
const SOOT = ink([0.03, 0.03, 0.035]);
const IRON = ink([0.13, 0.135, 0.15]);
const STRIPE = [0.8, 0.3, 0.04];
const GLASS = ink([0.03, 0.06, 0.09], 1, SHINE);
/** Dry sand, as shore.ts paints it. */
const DUNE = ink([0.64, 0.59, 0.48], 1, SAND);
/** An emergency lamp's glow. */
const LAMP = ink([1, 0.62, 0.25], 1, -2);
const DOWN = [0, -99, 0];

/**
 * Half the hull's section, from the keel up to the edge of its back: half width, height over the
 * axis. RINGS' boxes with each outer corner cut 0.4 m and each inner one filled as much, the flank
 * leaning out to the belt over a runner's head.
 */
const HALF = [
  [5.8, -9],
  [5.8, -5],
  [5.8, -2.6],
  [6.5, -1.7],
  [6.5, 2.1],
  [6.1, 2.5],
  [5.25, 2.5],
  [4.9, 2.85],
  [4.9, 4.6],
  [4.5, 5],
  [2.85, 5],
  [2.5, 5.35],
  [2.5, 6.7],
  [2.2, 7],
];
/** The whole section: up red's side, down blue's. */
const LOOP = [...HALF, ...HALF.map(([h, y]) => [-h, y]).reverse()];
const LAST = LOOP.length - 1;
/** The seven segments of a figure in a cell 1 by 2 (x0, y0, x1, y1), and the hull number's figures as bits of them. */
const SEG = [
  [0, 1.75, 1, 2],
  [0.75, 1, 1, 2],
  [0.75, 0, 1, 1],
  [0, 0, 1, 0.25],
  [0, 0, 0.25, 1],
  [0, 1, 0.25, 2],
  [0, 0.875, 1, 1.125],
];
const NUMBER = [63, 102, 91, 7];

const sm = (t: number) => {
  t = Math.min(Math.max(t, 0), 1);
  return t * t * (3 - 2 * t);
};
const sub = (a: V, b: V) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: V) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const mid = (a: V, b: V) => a.map((v, i) => (v + b[i]) / 2);
/** `a` moved by k times `d`. */
const off = (a: V, d: V, k = 1) => a.map((v, i) => v + d[i] * k);
/** A rectangle across two axes: corner `i` of 4 picks a or b on each. */
const QUAD = [0, 1, 3, 2];

/** What is being drawn. */
let o: number[] = [];
/** The sand's height. */
let gy = (_x: number, _z: number) => 0;

const put = (p: V, n: V, m: Mat, k: number) => {
  if (m.l < 0) {
    o.push(p[0], p[1], p[2], n[0], n[1], n[2], m.c[0] * k, m.c[1] * k, m.l, m.c[2] * k);
  } else {
    // A texture runs in world metres on the plane the face is nearest, as on a brush.
    const [u, v] =
      Math.abs(n[1]) > 0.7 ? [p[0], p[2]] : Math.abs(n[0]) > 0.7 ? [p[2], p[1]] : [p[0], p[1]];
    o.push(p[0], p[1], p[2], n[0], n[1], n[2], u * m.s, v * m.s, m.l, Math.min(m.c[0] * k, 1.99));
  }
};

/** A flat face, a fan from its first corner, turned away from the point `c`; `k` dims it, or each corner. */
const face = (q: V[], m: Mat, c: V, k: number | number[] = 1) => {
  let n = [0, 0, 0];
  q.forEach((a, i) => {
    const b = q[(i + 1) % q.length];
    n = off(n, [
      (a[1] - b[1]) * (a[2] + b[2]),
      (a[2] - b[2]) * (a[0] + b[0]),
      (a[0] - b[0]) * (a[1] + b[1]),
    ]);
  });
  if (Math.hypot(n[0], n[1], n[2]) < 1e-9) {
    return;
  }
  n = unit(n);
  const d = sub(mid(q[0], q[2]), c);
  if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0) {
    n = n.map(v => -v);
  }
  for (let i = 1; i < q.length - 1; i++) {
    for (const j of [0, i, i + 1]) {
      put(q[j], n, m, typeof k == 'number' ? k : k[j]);
    }
  }
};

/** The skin between two lines of as many points, away from `c` (toward it with `inv`): `m` each strip's material, or none; ka and kb the points' light. */
const loft = (
  a: V[],
  b: V[],
  m: (j: number) => Mat | undefined,
  c: V,
  ka?: number[],
  kb = ka,
  inv = false,
) => {
  for (let j = 0; j < a.length - 1; j++) {
    const mat = m(j);
    if (mat) {
      face(
        [a[j], a[j + 1], b[j + 1], b[j]],
        mat,
        inv ? off(a[j], sub(a[j], c)) : c,
        ka && kb ? [ka[j], ka[j + 1], kb[j + 1], kb[j]] : 1,
      );
    }
  }
};

/** A box's faces, less those of `skip` (a bit each: 1 and 2 across x, 4 the bottom, 8 the top, 16 and 32 across z). */
const box = (a: V, b: V, m: Mat, top = m, skip = 4) => {
  const c = mid(a, b);
  for (let i = 0; i < 6; i++) {
    if (!((skip >> i) & 1)) {
      const [x, p, q] = [i >> 1, ((i >> 1) + 1) % 3, ((i >> 1) + 2) % 3];
      face(
        QUAD.map(e => {
          const v = [0, 0, 0];
          [v[x], v[p], v[q]] = [(i & 1 ? b : a)[x], (e & 1 ? b : a)[p], (e & 2 ? b : a)[q]];
          return v;
        }),
        i == 3 ? top : m,
        c,
      );
    }
  }
};

/** A beam from a to b, w across and h deep. */
const bar = (a: V, b: V, w: number, m: Mat, h = w) => {
  const d = unit(sub(b, a));
  const s = unit(cross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const u = cross(s, d);
  const [p, q] = [a, b].map(e =>
    QUAD.map(i => off(off(e, s, ((i & 1) - 0.5) * w), u, ((i >> 1) - 0.5) * h)),
  );
  const c = mid(a, b);
  loft([...p, p[0]], [...q, q[0]], () => m, c);
  face(p, m, c);
  face(q, m, c);
};

/** Torn metal: n teeth on the edge a to b, each reaching as far as `d` at most, turned away from `c`. */
const teeth = (a: V, b: V, d: V, n: number, m: Mat, k = 1, c = DOWN) => {
  for (let i = 0; i < n; i++) {
    const [p, q] = [off(a, sub(b, a), i / n), off(a, sub(b, a), (i + 1) / n)];
    face([p, q, off(mid(p, q), d, 0.3 + 0.7 * hash(i, a[0] * 7 + a[2] * 3 + a[1], 11))], m, c, k);
  }
};

/** A box with its upright edges cut by `cut`, grown by `grow`: its sides, lit `k` at the foot and at the top, and its top in `top`. */
const prism = (a: V, b: V, cut: number, m: Mat, top?: Mat, grow = 0, k = [1, 1]) => {
  const [x0, x1, z0, z1] = [a[0] - grow, b[0] + grow, a[2] - grow, b[2] + grow];
  const ring = (y: number) =>
    [
      [x0 + cut, z0],
      [x1 - cut, z0],
      [x1, z0 + cut],
      [x1, z1 - cut],
      [x1 - cut, z1],
      [x0 + cut, z1],
      [x0, z1 - cut],
      [x0, z0 + cut],
      [x0 + cut, z0],
    ].map(([x, z]) => [x, y, z]);
  const [p, q] = [ring(a[1]), ring(b[1])];
  loft(
    p,
    q,
    () => m,
    mid(a, b),
    p.map(() => k[0]),
    p.map(() => k[1]),
  );
  if (top) {
    face(q.slice(1), top, a);
  }
};

/** Sand blown against the foot of a box that stands in the dry beach. */
const drift = ({ min: a, max: b }: Piece) => {
  const c = mid(a, b);
  if (gy(c[0], c[2]) < 0.3 || a[1] > gy(c[0], c[2])) {
    return;
  }
  const at = (i: number, out: number) => {
    const [x, z] = [(i + 1) & 2 ? b[0] + out : a[0] - out, i & 2 ? b[2] + out : a[2] - out];
    const g = gy(x, z);
    return [
      x,
      g + (out ? -0.04 : Math.min(0.12 + 0.35 * hash(i % 4, c[0] + c[2], 5), b[1] - g)),
      z,
    ];
  };
  for (let i = 0; i < 4; i++) {
    const q = [at(i, 0), at(i + 1, 0), at(i + 1, 0.9), at(i, 0.9)];
    face(
      q,
      DUNE,
      DOWN,
      q.map(p => 0.92 + 0.16 * noise(p[0] / 11, p[2] / 11, 5)),
    );
  }
};

/** A model of mesh.ts set at `at`, its length (-z) along `f`, level: `k` its scale across, up and along. */
const stand = (src: number[], at: V, f: V, k: V = [1, 1, 1]) =>
  place(o, src, at as Vec3, [[-f[2], 0, f[0]], [0, 1, 0], f as Vec3], [0, 0, 0], k as Vec3);

// ---------------------------------------------------------------------------------------------
// The hull.

/** An engine bell, its throat at the origin, 1.8 m long and 1.7 m at the lip, dark inside. */
const BELL = dress(
  smooth(
    [
      [0, -0.1],
      [0.7, -0.1],
      [1, 0.6],
      [1.5, 1.4],
      [1.7, 1.8],
      [1.5, 1.72],
      [0.6, 0.3],
      [0, 0.3],
    ],
    14,
  ),
  [0.15, 0.14, 0.14],
);

/** The hull's three sections: their skin, their torn ends, the stern and its bells, the fins, the nose in the trees. */
const hull = () => {
  LAYOUT.hull.forEach(([x0, x1, c], n) => {
    /** The section at x, scaled by s round a point that sinks as it narrows; `jag` tears it along x. */
    const ring = (x: number, s = 1, jag = 0) =>
      LOOP.map(([h, y], i) => [
        x + jag * (0.15 + 1.1 * hash(i, n, 3)),
        c + y * s - 2.5 * (1 - s),
        MID + h * s,
      ]);
    /** The broken ends: the tail's east, both of the middle, the nose's west. */
    const torn = [n ? x0 : -99, n < 2 ? x1 : 999];
    /** How much of its paint a point of the skin has left: burnt black at a broken end, stained in patches. */
    const lit = (p: V) =>
      (0.16 +
        0.84 *
          sm(
            (Math.min(...torn.map(t => Math.abs(p[0] - t))) -
              4 * noise(p[0] / 2, p[1] / 2 + p[2], 9)) /
              3,
          )) *
      (0.62 + 0.5 * noise(p[0] / 6, (p[1] + p[2]) / 5, 4 + n)) *
      // Smoke has come out of the hold's doors.
      (n == 1 ? 0.3 + 0.7 * sm((Math.hypot(p[0] - 59, p[1] - HOLD.floor - 1) - 2) / 3) : 1);
    const axis = (x: number) => [x, c, MID];
    const cut = n == 1 ? HOLD.door : [0, 0];
    for (let x = x0; x < x1; x += 1.5) {
      const [a, b] = [ring(x), ring(x + 1.5)];
      // The hold's side doors are holes in the middle section's flanks.
      const open = x >= cut[0] && x < cut[1];
      loft(
        a,
        b,
        j => (open && (j == 1 || j == LAST - 2) ? undefined : SKIN),
        axis(x),
        a.map(lit),
        b.map(lit),
      );
      for (const s of [-1, 1]) {
        const q = (xa: number, xb: number, ya: number, yb: number) =>
          QUAD.map(i => [i & 1 ? xb : xa, c + (i & 2 ? yb : ya), MID + s * 6.53]);
        // The stripe along the belt.
        const band = q(x, x + 1.5, -1.45, -1);
        face(band, ink(STRIPE), axis(x), band.map(lit));
        // A row of windows on the middle and the nose, some blown, none where it burnt.
        const w = q(x + 0.3, x + 1.2, 0.6, 1.25);
        if (n && lit(w[0]) > 0.3) {
          face(w, hash(x, s, 8) < 0.25 ? SOOT : GLASS, axis(x));
        }
      }
    }
    for (const [x, d] of [
      [x0, -1],
      [x1, 1],
    ]) {
      const [rim, in0, in1] = [ring(x), ring(x, 0.93), ring(x - 0.3 * d, 0.93)];
      const far = axis(x - 9 * d);
      if (torn.includes(x)) {
        // A broken end: the skin torn past it, a frame, and 0.3 m in the dark behind it the decks, the ribs and what hangs from them.
        loft(
          rim,
          ring(x, 1, d),
          () => SKIN,
          axis(x),
          rim.map(() => 0.1),
        );
        loft(rim, in0, () => IRON, far);
        loft(in0, in1, () => IRON, axis(x), undefined, undefined, true);
        in1.slice(0, -1).forEach((p, j) => face([axis(x - 0.3 * d), p, in1[j + 1]], SOOT, far));
        const xb = x - 0.14 * d;
        [
          [-2, 5.4],
          [2.5, 4.55],
        ].forEach(([y, h], e) => {
          bar([xb, c + y, MID - h], [xb, c + y, MID + h], 0.3, GIRDER, 0.24);
          for (let i = 0; i < 6; i++) {
            const z = MID + (2 * hash(i, x, 21 + e) - 1) * h;
            const l = 0.5 + 2.4 * hash(i, x, 23 + e);
            bar(
              [x, c + y, z],
              [x + d * 0.25, c + y - l, z + 0.3 * l * (hash(i, x, 25) - 0.5)],
              0.06,
              SOOT,
            );
          }
        });
        for (const z of [-3.8, -1.4, 1.4, 3.8]) {
          bar([xb, c - 9, MID + z], [xb, c + 4.6, MID + z], 0.3, GIRDER, 0.24);
        }
        // Embers in there.
        for (let i = 0; i < 6; i++) {
          const e = [x - 0.27 * d, c - 4 + 8 * hash(i, x, 31), MID + 9 * (hash(i, x, 32) - 0.5)];
          face(
            [e, off(e, [0, 0.1, 0.06]), off(e, [0, 0, 0.14])],
            ink([1, 0.35, 0.05], 0.5 + hash(i, x, 33), -2),
            far,
          );
        }
      } else if (n) {
        // The nose, crumpled into the trees: it narrows and sinks to a point, glazed round its upper half.
        let [a, s0] = [rim, 1];
        for (const [xn, s] of [
          [109, 0.86],
          [111.5, 0.6],
          [113, 0.3],
          [113.6, 0.02],
        ]) {
          const b = ring(xn, s);
          const glazed = s0 > 0.5;
          loft(
            a,
            b,
            j => (glazed && j > 7 && j < LAST - 8 ? GLASS : SKIN),
            axis(xn - 3),
            a.map(() => 0.55 + 0.45 * s),
          );
          [a, s0] = [b, s];
        }
      } else {
        // The stern: a plate and three engine bells over the water.
        rim.slice(0, -1).forEach((p, j) => face([axis(x), p, rim[j + 1]], IRON, far, 0.8));
        for (const [y, z] of [
          [4.2, 0],
          [0.7, -3.3],
          [0.7, 3.3],
        ]) {
          stand(BELL, [x, c + y, MID + z], [-1, 0, 0]);
        }
      }
    }
    if (!n) {
      for (const s of [-1, 1]) {
        // The number on the tail's belt, read from each side.
        NUMBER.forEach((bits, i) =>
          SEG.forEach(([u0, v0, u1, v1], b) => {
            if ((bits >> b) & 1) {
              face(
                QUAD.map(e => [
                  17.5 + s * ((i - 2) * 1.7 + (e & 1 ? u1 : u0) * 1.2),
                  c - 0.55 + (e & 2 ? v1 : v0) * 1.2,
                  MID + s * 6.54,
                ]),
                ink([0.05, 0.08, 0.16]),
                axis(17),
              );
            }
          }),
        );
        // A fin leaning out from the belt's edge, raked aft past the stern, a stripe across it: nothing a runner on the ledge touches.
        const lean = [0, 5.6, s * 3.6];
        const fin = [[9], [19], [8.5, 1], [3, 1]].map(([x, up]) =>
          off([x, c + 2.5, MID + s * 6.5], lean, up ?? 0),
        );
        const side = unit(cross(lean, [1, 0, 0]));
        const band = [0.45, 0.6].flatMap(t =>
          [0, 1].map(j => off(fin[j], sub(fin[3 - j], fin[j]), t)),
        );
        const [p, q] = [-0.17, 0.17].map(t => {
          const f = fin.map(v => off(v, side, t));
          face(f, SKIN, off(f[0], side, -t), 0.9);
          face(
            [band[0], band[1], band[3], band[2]].map(v => off(v, side, t * 1.1)),
            ink(STRIPE),
            fin[0],
          );
          return f;
        });
        loft([...p, p[0]], [...q, q[0]], () => IRON, mid(fin[0], fin[2]));
      }
    }
  });
};

// ---------------------------------------------------------------------------------------------
// The hold.

/** The inside of the middle section: the floor, the walls and their ribs, the ceiling, the two bulkheads, the passages of the side doors. */
const hold = () => {
  const { floor, ceil, half, x, door, lintel, walls, way } = HOLD;
  const [x0, x1] = x;
  const top = floor + lintel;
  const UP = [0, 99, 0];
  /** A level rectangle. */
  const flat = (xa: number, xb: number, y: number, za: number, zb: number) =>
    QUAD.map(i => [i & 1 ? xb : xa, y, i & 2 ? zb : za]);
  /** An upright one across the hull. */
  const wall = (xw: number, ya: number, yb: number, za: number, zb: number) =>
    QUAD.map(i => [xw, i & 2 ? yb : ya, i & 1 ? zb : za]);
  face(flat(x0, x1, floor, MID - half, MID + half), tex(TEX.GRATE), DOWN);
  face(flat(x0, x1, ceil, MID - half, MID + half), tex(TEX.METAL, 0.5), UP);
  for (const s of [-1, 1]) {
    const [zi, zo] = [MID + s * half, MID + s * 5.8];
    const out = [0, 0, MID + s * 99];
    for (const [xa, xb, ya] of [
      [x0, door[0], floor],
      [door[1], x1, floor],
      [door[0], door[1], top],
    ]) {
      face(
        QUAD.map(i => [i & 1 ? xb : xa, i & 2 ? ceil : ya, zi]),
        PLATE,
        out,
      );
    }
    // The door's passage through the flank, and its torn edge outside.
    face(flat(door[0], door[1], floor, zi, zo), tex(TEX.GRATE), DOWN);
    face(flat(door[0], door[1], top, zi, zo), GIRDER, UP);
    face(flat(door[0] + 0.4, door[1] - 0.4, top - 0.03, zo - 0.5, zo - 0.38), LAMP, UP);
    door.forEach((xd, i) => {
      face(wall(xd, floor, top, zi, zo), GIRDER, [xd + (i ? 9 : -9), 0, 0]);
      teeth([xd, floor, zo], [xd, top, zo], [i ? -0.3 : 0.3, 0, 0], 6, SKIN, 0.16, [0, 0, MID]);
    });
    teeth([door[0], top, zo], [door[1], top, zo], [0, -0.25, 0], 7, SKIN, 0.16, [0, 0, MID]);
    // The end walls' halves, and a rib every 2 m up each wall and half across the ceiling.
    for (const [xe, d] of [
      [x0, -9],
      [x1, 9],
    ]) {
      face(wall(xe, floor, ceil, MID, zi), PLATE, [xe + d, 0, 0]);
    }
    for (let xr = x0 + 1; xr < x1; xr += 2) {
      const [za, zb] = [Math.min(MID, zi), Math.max(MID, zi)];
      if (xr < door[0] || xr > door[1]) {
        box(
          [xr - 0.1, floor, s > 0 ? zb - 0.14 : za],
          [xr + 0.1, ceil, s > 0 ? zb : za + 0.14],
          GIRDER,
        );
      }
      box([xr - 0.1, ceil - 0.14, za], [xr + 0.1, ceil, zb], GIRDER, GIRDER, 8);
    }
  }
  const steel = tex(TEX.STEEL, 0.8);
  for (const [a, b] of walls) {
    box([a, floor, MID - half], [b, ceil, MID - way / 2], steel);
    box([a, floor, MID + way / 2], [b, ceil, MID + half], steel);
    box([a, top, MID - way / 2], [b, ceil, MID + way / 2], steel, steel, 0);
  }
  // Emergency lamps along the ceiling, and a few cables down from it, over a runner's head.
  for (let xl = x0 + 2; xl < x1; xl += 4) {
    face(flat(xl - 0.6, xl + 0.6, ceil - 0.16, MID - 0.08, MID + 0.08), LAMP, UP);
    const z = MID + 7 * (hash(xl, 1, 41) - 0.5);
    bar([xl + 1, ceil, z], [xl + 1.2, ceil - 0.3 - 0.6 * hash(xl, 2, 41), z + 0.2], 0.05, SOOT);
  }
};

// ---------------------------------------------------------------------------------------------
// The wings.

/** How far under the line of the steps' edges the wing's underside is drawn: its 0.8 m, and a step. */
const DEEP = 1.27;

/** A wing (red's with s = 1): one slab from its ragged tip in the sand to the hull's back, its top the plane through its steps' upper edges. */
const wing = (s: number) => {
  const steps = LAYOUT.pieces.filter(p => p.kind == 'wing' && p.min[2] > MID == s > 0);
  const end = steps[steps.length - 1];
  /** Each step's upper edge on the tip's side, west and east; then the last one's other edge. */
  const edge = [
    ...steps.map(p => [p.min[0], p.max[0]].map(x => [x, p.max[1], s > 0 ? p.max[2] : p.min[2]])),
    [end.min[0], end.max[0]].map(x => [x, end.max[1], s > 0 ? end.min[2] : end.max[2]]),
  ];
  const [L, R] = [0, 1].map(i => edge.map(e => e[i]));
  const c = mid(L[0], R[steps.length]);
  const [over, below] = [off(c, [0, 9, 0]), off(c, [0, -9, 0])];
  const under = (p: V) => off(p, [0, -DEEP, 0]);
  const lit = (p: V) =>
    0.5 + 0.6 * noise(p[0] / 5, p[2] / 5, 17) - 0.3 * sm((Math.abs(p[2] - MID) - 44) / 5);
  loft(L, R, () => SKIN, below, L.map(lit), R.map(lit));
  /** Where it stands clear of the sand: before that it is solid to the ground. */
  const clear = steps.findIndex(p => p.min[1] > p.max[1] - 1.5);
  const low = steps[0].min[1];
  const foot = (p: V, j: number) => (j < clear ? [p[0], low, p[2]] : under(p));
  for (const side of [L, R]) {
    loft(side, side.map(foot), () => GIRDER, c);
  }
  loft(L.slice(clear).map(under), R.slice(clear).map(under), () => PLATE, over);
  face([under(L[clear]), under(R[clear]), foot(R[clear], 0), foot(L[clear], 0)], GIRDER, c);
  face([L[0], R[0], foot(R[0], 0), foot(L[0], 0)], GIRDER, c);
  // The ragged tip, going on down into the sand, and three spars under the slab that stick out of it.
  const run = sub(L[0], L[1]);
  teeth(L[0], R[0], off(run, [0, -0.3, 0]), 9, SKIN, 0.3);
  for (const t of [0.2, 0.5, 0.8]) {
    const at = (i: number, k: number) => off(under(off(L[i], sub(R[i], L[i]), t)), run, k);
    bar(at(0, 0.7 + t), at(steps.length - 1, 0), 0.35, GIRDER, 0.5);
  }
  // Skin gone over two bays: the ribs under it, drawn flush.
  for (const i of [8, 17]) {
    const bay = (u0: number, u1: number, m: Mat) =>
      face(
        QUAD.map(e =>
          off(
            off(
              off(L[i], sub(R[i], L[i]), e & 1 ? u1 : u0),
              sub(L[i + 1], L[i]),
              e & 2 ? 0.92 : 0.08,
            ),
            [0, 0.03, 0],
          ),
        ),
        m,
        below,
      );
    bay(0.3, 0.72, SOOT);
    [0.4, 0.51, 0.62].forEach(u => bay(u, u + 0.02, IRON));
  }
};

// ---------------------------------------------------------------------------------------------
// The debris and the camps.

/** A wheel lying along -z from its hub's back: 0.6 m in radius, 1 m wide. */
const WHEEL = dress(
  smooth(
    [
      [0, 0.1],
      [0.3, 0.1],
      [0.36, 0],
      [0.52, 0],
      [0.6, 0.15],
      [0.6, 0.85],
      [0.52, 1],
      [0.36, 1],
      [0.3, 0.9],
      [0, 0.9],
    ],
    12,
  ),
  [0.05, 0.05, 0.055],
);

/** A line of points [across, up] carried to (x + across, y + up, z), then its mirror across x. */
const arch = (pts: number[][], x: number, y: number, z: number) =>
  [...pts, ...pts.map(([h, v]) => [-h, v]).reverse()].map(([h, v]) => [x + h, y + v, z]);

/** Each kind of piece, drawn on its box: `t` its tint in the map, `s` 1 in red's half and -1 in blue's. */
const KIND: Record<string, (p: { min: V; max: V }, t: V | undefined, s: number) => void> = {
  // Skin lying flat or afloat, its edge torn; or a slab of it standing in the sand, its stringers on one face.
  panel: ({ min: a, max: b }, _t, s) => {
    const k = 0.55 + 0.45 * hash(a[0], a[2], 51);
    const paint = tex(TEX.PAINT, PALE * k, 0.5);
    const thin = b[0] - a[0] < 1 ? 0 : b[2] - a[2] < 1 ? 2 : -1;
    if (thin >= 0) {
      box(a, b, paint, IRON);
      const [p, q] = [a.slice(), b.slice()];
      p[1] = q[1] = b[1];
      p[thin] = q[thin] = (a[thin] + b[thin]) / 2;
      teeth(p, q, [0, 0.4, 0], 9, SKIN, 0.3);
      for (const y of [0.5, 1.1, 1.7]) {
        const [e, f] = [a.slice(), b.slice()];
        e[1] = f[1] = b[1] - y;
        e[thin] = f[thin] = (s > 0 ? a : b)[thin] - s * 0.04;
        bar(e, f, 0.08, IRON);
      }
      return;
    }
    box(a, b, GIRDER, paint);
    const rim = [0, 1, 3, 2, 0].map(i => [i & 1 ? b[0] : a[0], b[1], i & 2 ? b[2] : a[2]]);
    rim.slice(1).forEach((q, i) => {
      const out = sub(mid(rim[i], q), [(a[0] + b[0]) / 2, b[1], (a[2] + b[2]) / 2]);
      teeth(rim[i], q, [Math.sign(out[0]) * 0.35, -0.12, Math.sign(out[2]) * 0.35], 4, SKIN, 0.35);
    });
    if (k > 0.75) {
      face(
        QUAD.map(i => [a[0] + (i & 1 ? 1.1 : 0.7), b[1] + 0.02, i & 2 ? b[2] : a[2]]),
        ink(STRIPE),
        DOWN,
        k,
      );
    }
  },
  // A cargo container: corrugated sides, door bars on one end.
  container: ({ min: a, max: b }, t = STRIPE) => {
    box(a, b, ink(t, 0.5));
    const long = b[0] - a[0] > b[2] - a[2] ? 0 : 2;
    for (let u = a[long] + 0.3; u < b[long] - 0.2; u += 0.6) {
      const [p, q] = [a.map(v => v - 0.05), b.map(v => v + 0.05)];
      [p[long], q[long], p[1], q[1]] = [u, u + 0.3, a[1], b[1] - 0.15];
      box(p, q, ink(t, 0.68));
    }
    for (const u of [0.35, 0.65]) {
      const e = off(a, sub(b, a), u);
      [e[long], e[1]] = [a[long] - 0.04, a[1]];
      bar(e, [e[0], b[1] - 0.1, e[2]], 0.08, IRON);
    }
  },
  // A supply case: planks, two straps, the lid in the team's colour on those that carry its long guns.
  crate: ({ min: a, max: b }, t) => {
    box(a, b, tex(TEX.WOOD), t && ink(t, 0.75));
    for (const u of [0.25, 0.75]) {
      const z = a[2] + (b[2] - a[2]) * u;
      box([a[0] - 0.02, a[1], z - 0.1], [b[0] + 0.02, b[1] + 0.02, z + 0.1], IRON);
    }
  },
  // The flag's step: a hatch cover in the team's colour.
  dais: ({ min: a, max: b }, t = STRIPE) => {
    box(a, b, GIRDER, ink(t, 0.6));
    face(
      QUAD.map(i => [
        i & 1 ? b[0] - 0.5 : a[0] + 0.5,
        b[1] + 0.02,
        i & 2 ? b[2] - 0.5 : a[2] + 0.5,
      ]),
      ink(t, 0.95),
      DOWN,
    );
  },
  // A tarpaulin sagging between its four poles, lit on both faces.
  shelter: ({ min: a, max: b }, t) => {
    if (!t) {
      box(a, b, tex(TEX.STEEL, 0.8));
      return;
    }
    const at = (i: number, j: number, d: number) => [
      a[0] + ((b[0] - a[0]) * i) / 6,
      b[1] - d - 0.25 * Math.sin((Math.PI * i) / 6) * Math.sin((Math.PI * j) / 4),
      a[2] + ((b[2] - a[2]) * j) / 4,
    ];
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 4; j++) {
        for (const d of [0, 0.03]) {
          face(
            [at(i, j, d), at(i + 1, j, d), at(i + 1, j + 1, d), at(i, j + 1, d)],
            ink(t, i & 1 ? 0.62 : 0.8),
            [a[0], d ? 99 : -99, a[2]],
          );
        }
      }
    }
  },
  // The landing gear: its strut's housing, cut at the corners, and the bogie's three wheels on their beam.
  gear: ({ min: a, max: b }, t) => {
    if (t) {
      prism(a, b, 0.4, ink(t, 0.7), ink(t, 0.55));
      prism([a[0], b[1] - 0.9, a[2]], [b[0], b[1] - 0.6, b[2]], 0.4, IRON, undefined, 0.04);
      return;
    }
    const z = (a[2] + b[2]) / 2;
    for (let i = 0; i < 3; i++) {
      stand(WHEEL, [a[0] + 0.7 + i * 1.5, b[1] - 0.6, b[2]], [0, 0, -1], [1, 1, b[2] - a[2]]);
    }
    box([a[0] + 0.3, b[1] - 0.8, z - 0.2], [b[0] - 0.3, b[1] - 0.4, z + 0.2], GIRDER);
  },
  // The nacelle on the sand, drawn whole on its roof's box: a cowling round the passage, its lips, its rear torn.
  nacelle: ({ min: a, max: b }, t, s) => {
    if (!t) {
      return;
    }
    const [x, y] = [(a[0] + b[0]) / 2, b[1] - 3.6];
    const shell = (z: number) =>
      arch(
        [
          [2.5, -1],
          [2.5, 2.7],
          [2.2, 3],
          [1.3, 3],
          [1.3, 3.3],
          [1, 3.6],
        ],
        x,
        y,
        z,
      );
    const bore = (z: number) =>
      arch(
        [
          [1.3, -1],
          [1.3, 2.1],
          [1.3, 2.1],
          [1.3, 2.1],
          [1.05, 2.4],
          [1.05, 2.4],
        ],
        x,
        y,
        z,
      );
    const c = [x, y + 1, (a[2] + b[2]) / 2];
    const k = shell(0).map((_, j) => 0.5 + 0.5 * hash(j, s, 61));
    loft(shell(a[2]), shell(b[2]), j => (j > 2 && j < 8 ? ink(t, 0.7) : SKIN), c, k);
    loft(bore(a[2]), bore(b[2]), () => GIRDER, c, undefined, undefined, true);
    for (const z of [a[2], b[2]]) {
      loft(shell(z), bore(z), () => IRON, c);
    }
    const rear = shell(s > 0 ? b[2] : a[2]);
    rear.slice(1).forEach((q, j) => teeth(rear[j], q, [0, 0, s * 0.9], 2, SKIN, 0.25, c));
  },
  // The engine in the lagoon, awash: its housing, and at each end its fan.
  engine: ({ min: a, max: b }, t = STRIPE) => {
    const x = (a[0] + b[0]) / 2;
    const shell = (z: number) =>
      arch(
        [
          [2.5, -5],
          [2.5, -0.4],
          [2.1, 0],
        ],
        x,
        b[1],
        z,
      );
    const c = [x, b[1] - 2.5, (a[2] + b[2]) / 2];
    const k = shell(0).map((_, j) => 0.45 + 0.4 * hash(j, 3, 62));
    loft(shell(a[2]), shell(b[2]), j => (j == 2 ? ink(t, 0.6) : SKIN), c, k);
    for (const [z, d] of [
      [a[2], -1],
      [b[2], 1],
    ]) {
      face(shell(z), SOOT, c);
      const at = (r: number, w: number, out: number) => [
        x + r * Math.cos(w),
        c[1] + r * Math.sin(w),
        z + d * out,
      ];
      const step = Math.PI / 7;
      for (let i = 0; i < 14; i++) {
        const w = i * step;
        face(
          [
            at(0.5, w, 0.2),
            at(2.25, w - 0.1, 0.22),
            at(2.25, w + 0.22, 0.05),
            at(0.5, w + 0.3, 0.08),
          ],
          ink([0.42, 0.43, 0.46]),
          c,
        );
        face([at(0, 0, 0.3), at(0.55, w, 0.1), at(0.55, w + step, 0.1)], IRON, c);
        face(
          [at(2.3, w, 0.04), at(2.3, w + step, 0.04), at(2.48, w + step, 0.04), at(2.48, w, 0.04)],
          PLATE,
          c,
        );
      }
    }
  },
  // The escape pod: its corners cut, its foot scorched, a band in the team's colour, the hatch open toward the flag, its parachute on the sand behind.
  pod: ({ min: a, max: b }, _t, s) => {
    const team = TEAM_TINT[s > 0 ? 0 : 1];
    const g = a[1] + 0.5;
    const c = mid(a, b);
    const [x, z] = [c[0], (s > 0 ? a[2] : b[2]) - s * 0.04];
    prism(a, b, 0.42, SKIN, tex(TEX.PAINT, PALE * 0.8, 0.5), 0, [0.5, 1]);
    prism(a, [b[0], g + 0.8, b[2]], 0.42, SOOT, undefined, 0.04);
    prism([a[0], g + 2, a[2]], [b[0], g + 2.4, b[2]], 0.42, ink(team, 0.8), undefined, 0.03);
    face(
      QUAD.map(i => [x + (i & 1 ? 0.65 : -0.65), g + (i & 2 ? 1.95 : 0), z]),
      SOOT,
      c,
    );
    for (const u of [-0.7, 0.7]) {
      bar([x + u, g, z], [x + u, g + 2, z], 0.1, IRON);
      face(
        QUAD.map(i => [
          x + 3.03 * Math.sign(u),
          g + (i & 2 ? 1.7 : 1.2),
          c[2] + (i & 1 ? 0.3 : -0.3),
        ]),
        GLASS,
        c,
      );
    }
    bar([x - 0.7, g + 2, z], [x + 0.7, g + 2, z], 0.1, IRON);
    box([x + 1, g - 0.1, z - s * 2.6 - 0.95], [x + 2.3, g + 0.1, z - s * 2.6 + 0.95], SKIN);
    const hub = [x, g + 0.28, c[2] + s * 7];
    const rim = (i: number) => {
      const r = 3 + 1.3 * hash(i % 14, s, 71);
      return [
        x + r * Math.cos((i * Math.PI) / 7),
        g + 0.03 + 0.2 * hash(i % 14, s, 72),
        hub[2] + r * Math.sin((i * Math.PI) / 7),
      ];
    };
    for (let i = 0; i < 14; i++) {
      face([hub, rim(i), rim(i + 1)], ink(i & 1 ? STRIPE : [0.8, 0.8, 0.76], 0.9), DOWN);
    }
  },
  // A heap of ribs: a plate on it, girders lying round it.
  heap: ({ min: a, max: b }, t = STRIPE) => {
    box(a, b, GIRDER, ink(t, 0.55));
    const g = Math.max(gy(a[0], a[2]), 0);
    bar([a[0] - 0.9, g + 0.1, a[2] - 0.25], [b[0] + 0.5, g + 0.3, a[2] - 0.05], 0.25, GIRDER);
    bar([b[0] + 0.2, g + 0.25, a[2] - 0.6], [b[0] + 0.05, g + 0.1, b[2] + 0.8], 0.25, GIRDER);
    bar([a[0] - 0.1, g + 0.3, b[2] + 0.2], [b[0] - 0.4, g + 0.1, b[2] + 0.05], 0.22, IRON);
  },
  // A frame fallen at a broken end, two girders of it on the sand and a rib still standing against the hull.
  frame: ({ min: a, max: b }, _t, s) => {
    box([a[0] + 0.2, a[1], a[2]], [b[0] - 0.2, b[1], b[2]], IRON);
    box([a[0], b[1] - 0.16, a[2]], b, GIRDER, GIRDER, 0);
    box([a[0], b[1] - 0.8, a[2]], [b[0], b[1] - 0.64, b[2]], GIRDER, GIRDER, 0);
    const z = (a[2] + b[2]) / 2;
    bar([a[0] + 0.14, b[1], z - s * 0.7], [a[0] + 0.14, b[1] + 3.4, z + s * 0.6], 0.26, GIRDER);
  },
};
KIND.float = KIND.raft = KIND.panel;

/** The kinds of the camps: the rest is debris. */
const CAMP = ['pod', 'dais', 'crate', 'shelter'];
/** The kinds no sand lies against: afloat, or cloth, or the flag's step. */
const BARE = ['shelter', 'float', 'raft', 'engine', 'dais'];

/**
 * The wreck by part, each its vertices in the renderer's format: the hull's three sections, the
 * hold inside the middle one, the two wings, the debris, the camps. Read from the map at the call.
 */
export const parts = (def: WorldDef) => {
  const w = def.relief && ({ relief: raise(def.relief) } as World);
  gy = (x, z) => {
    const g = w ? ground(w, x, z) : 0;
    return g > -1e9 ? g : 0;
  };
  const made = (f: () => void) => {
    o = [];
    f();
    return o;
  };
  const scrap = (camp: boolean) => () => {
    for (const p of LAYOUT.pieces) {
      if (KIND[p.kind] && CAMP.includes(p.kind) == camp) {
        const b = def.brushes.find(e =>
          e.min.every((v, i) => v == p.min[i] && e.max[i] == p.max[i]),
        );
        KIND[p.kind](p, b?.tint, (p.min[2] + p.max[2]) / 2 < MID ? -1 : 1);
        if (!BARE.includes(p.kind)) {
          drift(p);
        }
      }
    }
  };
  return {
    hull: made(hull),
    hold: made(hold),
    wings: made(() => [1, -1].forEach(wing)),
    debris: made(scrap(false)),
    camps: made(scrap(true)),
  };
};

/** Its vertices, in the renderer's format. */
export const hulk = (def: WorldDef): number[] => Object.values(parts(def)).flat();
