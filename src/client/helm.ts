// The woman's helmet on the moon (the user, 2026-11-11: hers must be told from his at a glance,
// "like a Mandalorian's"; an idea of a shape, nothing copied): a smooth dome with straight cheeks
// down past the jaw and a lip at the bottom, a little smaller since (the user, 2026-11-11); a dark T for a visor, a slit across the eyes and a
// slot from its middle down to the lip, framed in the team's colour; a grey plate on each cheek; a
// crest in the team's colour over the top; a round cap on each ear, and a
// thin stalk with a sight on the right one, up past the dome. A pure function of the head joint's
// place, built once per level of detail in the head's own frame (metres, -z the front).
import { TAU } from '../shared/physics';
import { face, pow, sheet } from './helmet';
import type { Spot } from './helmet';
import { GLOSS, SHINE, place } from './mesh';
import type { Vec3 } from './mesh';
import { turn } from './rig';
import type { Quat } from './rig';

/**
 * The dome: its middle (the widest ring, level with the brow), its half width, height over the
 * middle and depth, how square it is seen from above, how flat on top, and the height of its lip
 * under the chin. It holds the head of the skin (1.555 to 1.803 m, the head joint at 1.62): the
 * head fills 97 % of it at the cheekbones.
 */
export const DOME = {
  c: [0, 0.05, 0.003] as Vec3,
  r: [0.101, 0.128, 0.123] as Vec3,
  e: [2.5, 2.3] as [number, number],
  rim: -0.074,
  /** The cheeks draw in by this share half way down, and the lip flares out by this one: none, the bottom cut straight (the user, 2026-11-11). */
  waist: 0.02,
  flare: 0,
};

/**
 * The T: the slit's middle height and half height at the nose and at its ends, how far round it
 * goes (radians from the front), and the slot's half width (metres across the front).
 */
export const TEE = {
  y: 0.066,
  h: [0.017, 0.009] as [number, number],
  round: 1.12,
  slot: 0.016,
  /** The frame round it, in the team's colour: how much wider than the glass, and how far each stands off the dome. */
  frame: 0.007,
  off: [0.0015, 0.003] as [number, number],
};

/** The ear caps: their height on the dome, radius and thickness; the stalk's height over the cap and half width. */
export const EAR = { y: 0.045, r: 0.036, t: 0.014, stalk: 0.19, w: 0.005 };

/**
 * The cheek plates, grey, each side of the slot under the slit: how far round they go (radians),
 * the gap to the T's frame, how much their top edge falls to the back, and how far they stand off.
 */
export const CHEEK = { round: 1.3, gap: 0.012, fall: 0.05, off: 0.006 };

/** The crest, in the team's colour: a stripe from the brow over the top to the back of the dome, its half width and how far it stands off. */
export const CREST = { w: 0.015, off: 0.002, from: 0.112 };

const WHITE = [0.88, 0.89, 0.92];
const IRON = [0.25, 0.27, 0.3];
const STEEL = [0.56, 0.58, 0.63];
const PALE = [0.74, 0.76, 0.8];
const GLASS = [0.02, 0.025, 0.035];
/** Tinted with the team's colour when drawn. */
const TEAM = [1, 1, 1];

/** How far out the dome is at height y, as a share of its half width and depth. */
const girth = (y: number) => {
  const [, cy] = DOME.c;
  if (y >= cy) {
    const q = DOME.e[1];
    return Math.max(1 - ((y - cy) / DOME.r[1]) ** q, 0) ** (1 / q);
  }
  const s = (cy - y) / (cy - DOME.rim);
  return 1 - DOME.waist * Math.sin(Math.PI * Math.min(s, 1)) + DOME.flare * s ** 4;
};

/** The dome's surface at the turn `a` (radians from the front, + to the right) and height y. */
export const dome = (a: number, y: number): Vec3 => {
  const h = girth(y);
  const p = DOME.e[0];
  return [
    DOME.c[0] + DOME.r[0] * h * pow(Math.sin(a), 2 / p),
    y,
    DOME.c[2] - DOME.r[2] * h * pow(Math.cos(a), 2 / p),
  ];
};

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** The dome's top: under it the surface is taken by height, at it by its one point. */
const TOP = DOME.c[1] + DOME.r[1];

/** The point of the dome at (a, y) set `off` metres out along its normal, with that normal. */
export const onDome = (a: number, y: number, off = 0): Spot => {
  const h = 1e-4;
  const yy = Math.min(y, TOP - 2 * h);
  const p = dome(a, yy);
  let n = unit(cross(sub(dome(a + h, yy), dome(a - h, yy)), sub(dome(a, yy + h), dome(a, yy - h))));
  // Outward: away from the dome's axis, or up near its top.
  if (n[0] * (p[0] - DOME.c[0]) + n[2] * (p[2] - DOME.c[2]) + n[1] * (yy - DOME.c[1]) < 0) {
    n = [-n[0], -n[1], -n[2]];
  }
  return [[p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off], n];
};

/** An open strip of triangles between the rows of points `rows`, all of one length. */
const strip = (rows: Spot[][], col: number[], layer: number, out: number[]) => {
  rows.slice(1).forEach((row, r) => {
    for (let i = 0; i + 1 < row.length; i++) {
      const [a, b, c, d] = [rows[r][i], rows[r][i + 1], row[i], row[i + 1]];
      face(out, col, layer, [a, c, d]);
      face(out, col, layer, [a, d, b]);
    }
  });
  return out;
};

/** The slit's half height at the turn `a`: tall at the nose, thin at its ends. */
export const slit = (a: number) => {
  const t = Math.min(Math.abs(a) / TEE.round, 1);
  return TEE.h[0] + (TEE.h[1] - TEE.h[0]) * t ** 1.5;
};

/** The turn at which the slot's edge is at height y: the dome's front is not a circle. */
const slotTurn = (y: number, half: number) => {
  let a = half / DOME.r[2];
  for (let i = 0; i < 6; i++) {
    a *= half / (Math.abs(dome(a, y)[0]) || half);
  }
  return a;
};

/** Whether the dome's point at (a, y) is under the T's glass grown by `grow` metres. */
export const glazed = (a: number, y: number, grow = 0) => {
  const t = Math.abs(a);
  const across = t <= TEE.round + grow / DOME.r[2] && Math.abs(y - TEE.y) <= slit(a) + grow;
  return across || (y < TEE.y && Math.abs(dome(a, y)[0]) <= TEE.slot + grow && Math.cos(a) > 0);
};

/** The T as two strips set `off` out of the dome, grown by `grow`: the slit across, the slot down. */
const tee = (grow: number, off: number, n: number, col: number[], layer: number) => {
  const out: number[] = [];
  const round = TEE.round + grow / DOME.r[2];
  const turns = Array.from({ length: n + 1 }, (_, i) => -round + (2 * round * i) / n);
  strip(
    [-1, -0.5, 0, 0.5, 1].map(k => turns.map(a => onDome(a, TEE.y + k * (slit(a) + grow), off))),
    col,
    layer,
    out,
  );
  const rows = Math.max(3, n >> 2);
  const [low, high] = [DOME.rim + 0.004 - grow, TEE.y];
  strip(
    Array.from({ length: rows + 1 }, (_, r) => {
      const y = low + ((high - low) * r) / rows;
      const a = slotTurn(y, TEE.slot + grow);
      return [-1, -0.5, 0, 0.5, 1].map(k => onDome(a * k, y, off));
    }),
    col,
    layer,
    out,
  );
  return out;
};

/** The cheek's outline at (u, v): u 0 at the slot's frame to 1 round toward the ear, v 0 at the lip to 1 under the slit, its top falling to the back. */
const outline = (u: number, v: number): [a: number, y: number] => {
  const low = DOME.rim + 0.004;
  const y0 = TEE.y - slit(0) - TEE.frame - CHEEK.gap - CHEEK.fall * u ** 2;
  const y = low + (y0 - low) * v;
  const a0 = slotTurn(y, TEE.slot + TEE.frame + CHEEK.gap);
  return [a0 + (CHEEK.round - a0) * u, y];
};

/** Where the turn a (either side) and height y fall on the cheek's outline, or nothing off it. */
const onCheek = (a: number, y: number): [u: number, v: number] | undefined => {
  const a0 = slotTurn(y, TEE.slot + TEE.frame + CHEEK.gap);
  const u = (Math.abs(a) - a0) / (CHEEK.round - a0);
  const [, yl] = outline(u, 0);
  const [, yh] = outline(u, 1);
  const v = (y - yl) / (yh - yl);
  return u > 0 && u < 1 && v > 0 && v < 1 && Math.cos(a) > 0 ? [u, v] : undefined;
};

/**
 * The cheeks (the user, 2026-11-11: the helmet itself, shaped as a skull is, after a Mandalorian
 * helmet, an idea and nothing copied): the dome is left out under each, and the cheek is a
 * surface of its own CHEEK.off out, smooth but for one sharp crease. Down from the slit: the
 * cheekbone stands out (`bone`, metres at its peak, at height `boneV` of the cheek), then the
 * cheek is hollow, then the jaw stands out again (`jaw` at `jawV`). The hollow is a V: its crease
 * runs from `tip` (u, v), under the cheekbone by the eye, down the helmet to `foot` on the lip,
 * `depth` in at its deepest (`deepV`) and back to `lip` of that at the lip; it is `half` wide each
 * side of the crease. Heights v from 0 at the lip to 1 under the slit, turns u from 0 at the slot
 * to 1 toward the ear (outline()).
 */
export const FACETS = {
  bone: 0.007,
  boneV: 0.84,
  jaw: 0.005,
  jawV: 0.12,
  tip: [0.2, 0.74],
  foot: [0.52, 0],
  depth: 0.02,
  deepV: 0.4,
  lip: 0.45,
  half: 0.26,
};

/** The crease's turn at height v (none over the tip: the tip's). */
const crease = (v: number) => {
  const t = Math.min(v / FACETS.tip[1], 1);
  return FACETS.foot[0] + (FACETS.tip[0] - FACETS.foot[0]) * t;
};

/** How deep the V is at its crease at height v: nothing at the tip, deepest at deepV, `lip` of that at the lip. */
const deep = (v: number) => {
  if (v >= FACETS.tip[1]) {
    return 0;
  }
  const { deepV, depth, lip } = FACETS;
  return v > deepV
    ? depth * Math.sin(((FACETS.tip[1] - v) / (FACETS.tip[1] - deepV)) * (Math.PI / 2))
    : depth * (lip + (1 - lip) * Math.sin((v / deepV) * (Math.PI / 2)));
};

/** How far the cheek stands out of CHEEK.off at (u, v): the cheekbone and the jaw out, the V in. */
export const relief = (u: number, v: number) => {
  const bell = (x: number, w: number) => Math.exp(-((x / w) ** 2));
  const across = Math.sin(Math.PI * Math.min(Math.max(u, 0), 1)) ** 0.5;
  const out =
    across * (FACETS.bone * bell(v - FACETS.boneV, 0.1) + FACETS.jaw * bell(v - FACETS.jawV, 0.11));
  const v_ = Math.max(0, 1 - Math.abs(u - crease(v)) / FACETS.half);
  return out - deep(v) * v_;
};

/** The cheek's rows, and its columns: the crease's is the fourth, so it is an edge of the mesh. */
const ROWS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.68, 0.74, 0.8, 0.87, 0.94, 1];
const columns = (v: number) => {
  const c = crease(v);
  return [0, c / 3, (2 * c) / 3, c, ...[0.2, 0.4, 0.6, 0.8, 1].map(t => c + (1 - c) * t)];
};
const CREASE = 3;

/** A cheek on the side `sx`: smooth each side of the crease, sharp on it, and a wall down to the dome round its edge. */
const cheek = (sx: number, out: number[]) => {
  const at = (u: number, v: number, off: number): Vec3 => {
    const [a, y] = outline(u, v);
    return onDome(sx * a, y, off)[0];
  };
  const grid = ROWS.map(v => columns(v).map(u => at(u, v, CHEEK.off + relief(u, v))));
  const color = (u: number, v: number) => {
    const k = Math.min(Math.max(-relief(u, v) / FACETS.depth, 0), 1);
    return STEEL.map(c => c * (1 - 0.6 * k));
  };
  const outward = (p: Vec3): Vec3 => [p[0] - DOME.c[0], 0, p[2] - DOME.c[2]];
  // Each side of the crease its own smooth normals: the mean of the faces round a corner.
  for (const [c0, c1] of [
    [0, CREASE],
    [CREASE, columns(0).length - 1],
  ]) {
    const n = grid.map(row => row.map(() => [0, 0, 0] as Vec3));
    const tris: [number, number, number, number, number, number][] = [];
    for (let r = 0; r + 1 < ROWS.length; r++) {
      for (let i = c0; i < c1; i++) {
        tris.push([r, i, r + 1, i, r + 1, i + 1], [r, i, r + 1, i + 1, r, i + 1]);
      }
    }
    for (const [r0, i0, r1, i1, r2, i2] of tris) {
      const [a, b, c] = [grid[r0][i0], grid[r1][i1], grid[r2][i2]];
      let f = cross(sub(b, a), sub(c, a));
      const o = outward(a);
      f = f[0] * o[0] + f[2] * o[2] < 0 ? [-f[0], -f[1], -f[2]] : f;
      for (const [r, i] of [
        [r0, i0],
        [r1, i1],
        [r2, i2],
      ]) {
        n[r][i] = [n[r][i][0] + f[0], n[r][i][1] + f[1], n[r][i][2] + f[2]];
      }
    }
    for (const [r0, i0, r1, i1, r2, i2] of tris) {
      const cols = columns(ROWS[r0]);
      const col = color((cols[i0] + cols[Math.min(i0 + 1, cols.length - 1)]) / 2, ROWS[r0]);
      face(
        out,
        col,
        GLOSS,
        [
          [r0, i0],
          [r1, i1],
          [r2, i2],
        ].map(([r, i]) => [grid[r][i], unit(n[r][i])] as Spot),
      );
    }
  }
  // The wall: from the edge down to the dome, round the outline.
  const last = ROWS.length - 1;
  const n = columns(0).length;
  const ring: [number, number][] = [
    ...Array.from({ length: n }, (_, i): [number, number] => [0, i]),
    ...Array.from({ length: last }, (_, r): [number, number] => [r + 1, n - 1]),
    ...Array.from({ length: n - 1 }, (_, i): [number, number] => [last, n - 2 - i]),
    ...Array.from({ length: last }, (_, r): [number, number] => [last - 1 - r, 0]),
  ];
  ring.slice(1).forEach(([r, i], e) => {
    const [pr, pi] = ring[e];
    const [p, q] = [grid[pr][pi], grid[r][i]];
    const [pb, qb] = [at(columns(ROWS[pr])[pi], ROWS[pr], 0), at(columns(ROWS[r])[i], ROWS[r], 0)];
    const o = outward(p);
    const wall = (a: Vec3, b: Vec3, c: Vec3) => {
      const f = unit(cross(sub(b, a), sub(c, a)));
      const k = Math.sign(f[0] * o[0] + f[2] * o[2]) || 1;
      face(
        out,
        IRON,
        -1,
        [a, b, c].map(x => [x, [f[0] * k, f[1] * k, f[2] * k]] as Spot),
      );
    };
    wall(p, q, qb);
    wall(p, qb, pb);
  });
};

/** The crest: up the front from over the slit, over the top and down the back to the dome's middle. */
const crest = (n: number) => {
  const high = TOP - 0.004;
  const ys = Array.from({ length: n + 1 }, (_, i) => i / n);
  const rows = [
    ...ys.map(t => [CREST.from + (high - CREST.from) * t, 0] as const),
    ...ys.map(t => [high + (DOME.c[1] - high) * t, 1] as const),
  ].map(([y, back]) => {
    const a = slotTurn(y, CREST.w);
    return [-1, -0.5, 0, 0.5, 1].map(k => onDome(back ? Math.PI - a * k : a * k, y, CREST.off));
  });
  return strip(rows, TEAM, GLOSS, []);
};

/** A round cap on the ear at side `sx` (1 the right), and on the right one the stalk and its sight. */
const ear = (sx: number, n: number, out: number[]) => {
  const [c] = onDome((sx * TAU) / 4, EAR.y);
  const x0 = c[0] - sx * 0.01;
  const x1 = c[0] + sx * EAR.t;
  const ring = (x: number, r: number, m: (t: number) => Vec3): Spot[] =>
    Array.from({ length: n }, (_, i) => {
      const t = (i / n) * TAU;
      return [[x, c[1] + r * Math.sin(t), c[2] + r * Math.cos(t)], m(t)] as Spot;
    });
  const side = (t: number): Vec3 => [0, Math.sin(t), Math.cos(t)];
  const flat = (): Vec3 => [sx, 0, 0];
  sheet([ring(x0, EAR.r, side), ring(x1, EAR.r, side)], WHITE, GLOSS, out);
  sheet([ring(x1, EAR.r, flat), ring(x1 + sx * 0.003, EAR.r * 0.55, flat)], PALE, GLOSS, out);
  sheet(
    [ring(x1 + sx * 0.003, EAR.r * 0.55, flat), [[[x1 + sx * 0.003, c[1], c[2]], flat()]]],
    IRON,
    -1,
    out,
  );
  if (sx > 0) {
    // The stalk: a thin box up the back of the cap, a sight across its top.
    const box = (lo: Vec3, hi: Vec3) => {
      const q = (k: number, s: number, u: number[], v: number[]): void => {
        const p = (a: number, b: number): Vec3 => {
          const w: Vec3 = [0, 0, 0];
          w[k] = s > 0 ? hi[k] : lo[k];
          w[(k + 1) % 3] = a;
          w[(k + 2) % 3] = b;
          return w;
        };
        const m: Vec3 = [0, 0, 0];
        m[k] = s;
        const spots = [p(u[0], v[0]), p(u[1], v[0]), p(u[1], v[1]), p(u[0], v[1])].map(
          w => [w, m] as Spot,
        );
        face(out, IRON, -1, [spots[0], spots[1], spots[2]]);
        face(out, IRON, -1, [spots[0], spots[2], spots[3]]);
      };
      for (let k = 0; k < 3; k++) {
        const [u, v] = [(k + 1) % 3, (k + 2) % 3];
        q(k, 1, [lo[u], hi[u]], [lo[v], hi[v]]);
        q(k, -1, [lo[u], hi[u]], [lo[v], hi[v]]);
      }
    };
    const z = c[2] + EAR.r * 0.45;
    box([x1 - 0.004, c[1], z - EAR.w], [x1 + 0.004, c[1] + EAR.stalk, z + EAR.w]);
    box(
      [x1 - 0.006, c[1] + EAR.stalk - 0.012, z - 0.03],
      [x1 + 0.006, c[1] + EAR.stalk + 0.006, z + EAR.w],
    );
  }
};

interface Kit {
  /** What keeps its colours, and what is tinted with the team's. */
  plain: number[];
  team: number[];
}

/** Round the dome and up it, and across the T, at the far, near and close levels. */
const DETAIL = [
  [14, 8, 8],
  [28, 16, 20],
  [48, 28, 36],
];
const kits = new Map<number, Kit>();

const kit = (lod: number): Kit => {
  const level = Math.min(lod, 2);
  let k = kits.get(level);
  if (k) {
    return k;
  }
  const [lon, lat, across] = DETAIL[level];
  const plain: number[] = [];
  // The dome from its lip to its top: half the rows under the middle, by height, and half over it, by latitude.
  const below = lat >> 1;
  const heights = [
    ...Array.from({ length: below }, (_, r) => DOME.rim + ((DOME.c[1] - DOME.rim) * r) / below),
    ...Array.from(
      { length: lat - below },
      (_, r) =>
        DOME.c[1] + DOME.r[1] * Math.sin(((TAU / 4) * r) / (lat - below)) ** (2 / DOME.e[1]),
    ),
  ];
  const ring = (y: number, off = 0) =>
    Array.from({ length: lon }, (_, i) => onDome((i / lon) * TAU, y, off));
  const crown: Spot = [
    [DOME.c[0], TOP, DOME.c[2]],
    [0, 1, 0],
  ];
  const whole = sheet([...heights.map(y => ring(y)), [crown]], WHITE, GLOSS);
  // The triangles all under the glass are left out: none is left just behind it to flicker through.
  for (let i = 0; i < whole.length; i += 30) {
    const hidden = [0, 10, 20].every(j => {
      const [x, y, z] = whole.slice(i + j, i + j + 3);
      return glazed(Math.atan2(x - DOME.c[0], DOME.c[2] - z), y, -0.002);
    });
    // Under the cheeks, where they are drawn, the dome is theirs: the triangles wholly under one.
    const cheeked =
      level > 0 &&
      [0, 10, 20].every(j => {
        const [x, y, z] = whole.slice(i + j, i + j + 3);
        return !!onCheek(Math.atan2(x - DOME.c[0], DOME.c[2] - z), y);
      });
    if (!hidden && !cheeked) {
      plain.push(...whole.slice(i, i + 30));
    }
  }
  // Under the lip: a dark ring in to the neck.
  const neck = ring(DOME.rim).map(
    ([p]) =>
      [
        [p[0] * 0.62, DOME.rim + 0.004, DOME.c[2] + (p[2] - DOME.c[2]) * 0.62],
        [0, -1, 0],
      ] as Spot,
  );
  sheet([ring(DOME.rim).map(([p]) => [p, [0, -1, 0]] as Spot), neck], IRON, -1, plain);
  plain.push(...tee(0, TEE.off[1], across, GLASS, SHINE));
  const team = tee(TEE.frame, TEE.off[0], across, TEAM, GLOSS);
  team.push(...crest(lat));
  if (level) {
    for (const sx of [1, -1]) {
      ear(sx, lon >> 1, plain);
      cheek(sx, plain);
    }
  }
  kits.set(level, (k = { plain, team }));
  return k;
};

/**
 * Appends her helmet at level of detail `lod` (0 far, 1 near, 2 and up close) on the head joint at
 * `at` turned by `q`, the frame of its T in `rgb`, the team's colour (0 to 1). The far one has no
 * ear caps and no cheek plates.
 */
export const helm = (out: number[], at: Vec3, q: Quat, rgb: number[], lod: number) => {
  const k = kit(lod);
  const axes = [turn(q, [1, 0, 0]), turn(q, [0, 1, 0]), turn(q, [0, 0, -1])];
  place(out, k.plain, at, axes, [0, 0, 0], 1);
  place(out, k.team, at, axes, [0, 0, 0], 1, rgb);
};
