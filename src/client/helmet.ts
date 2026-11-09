// The moon's space helmet, after the marine helmets of 90s shooters, not copied: a rounded hard
// shell over the whole head, one wide dark visor across the face in a thick rim, a pod on each ear,
// a low crest on top in the team's colour and a ring at the neck. A pure function of the head
// joint's place: no state, no DOM. Built once per level of detail from mesh.ts's shapes, in the
// head's own frame (the head joint's rest pose, metres, -z the front) and appended where the head is.
import { TAU } from '../shared/physics';
import { GLOW, glow } from './flag';
import { SHINE, STRIDE, aim, dress, place, smooth } from './mesh';
import type { Vec3 } from './mesh';
import { turn } from './rig';
import type { Quat } from './rig';

/**
 * The shell, an ellipsoid in the head joint's frame: its centre and half width, height and depth.
 * The head of the skin (skin.ts, 1.555 to 1.803 m, the head joint at 1.62) lies inside it from the
 * jaw up; its rim is where the shell is cut, under the chin.
 */
export const SHELL = { c: [0, 0.05, 0] as Vec3, r: [0.125, 0.15, 0.145] as Vec3, rim: -0.07 };

/**
 * The visor's opening on the front of the shell: an ellipse across x and y (centre, half width and
 * height) from the brow to under the nose. The visor is a plate on the shell's curve, `SINK` under
 * the rim's top and `LIFT` over the shell; the rim is a bevel around it.
 */
export const VISOR = { c: [0, 0.02] as [number, number], r: [0.085, 0.065] as [number, number] };
const LIFT = 0.002;
const RIM = 0.006;

/**
 * Sides around and steps up of the parts, far, near, close: the shell, the crest, the ear pods and
 * the collar; and the visor's rings and the segments round it (the rim has the same). The far one
 * is about 140 vertices, the near one 500, the close one 800.
 */
const DETAIL = [
  { shell: [8, 2], crest: [4, 2], pod: [0, 0], collar: [0, 0], plate: [1, 8], rim: false },
  { shell: [10, 4], crest: [6, 2], pod: [6, 1], collar: [8, 1], plate: [2, 10], rim: true },
  { shell: [12, 5], crest: [6, 2], pod: [6, 2], collar: [12, 1], plate: [2, 14], rim: true },
];

const WHITE = [0.88, 0.89, 0.92];
const GREY = [0.5, 0.52, 0.56];
const IRON = [0.25, 0.27, 0.3];
const TINT = [0.02, 0.03, 0.06];

/** The profile of a unit dome from the angle a0 to the pole: radius and length along the axis. */
const dome = (a0: number, steps: number): [number, number][] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = a0 + ((TAU / 4 - a0) * i) / steps;
    // The pole is on the axis exactly, not a rounding off it.
    return i == steps ? [0, 1] : [Math.cos(a), Math.sin(a)];
  });

/** The point of the front of the shell, grown by `off`, over (x, y), and its normal. */
const onShell = (x: number, y: number, off: number): [Vec3, Vec3] => {
  const [A, B, D] = SHELL.r.map(v => v + off);
  const dy = y - SHELL.c[1];
  const z = -D * Math.sqrt(Math.max(1 - (x / A) ** 2 - (dy / B) ** 2, 0));
  const n: Vec3 = [x / A ** 2, dy / B ** 2, z / D ** 2];
  const l = Math.hypot(...n);
  return [
    [x, y, z],
    [n[0] / l, n[1] / l, n[2] / l],
  ];
};

/** A ring of the opening scaled by `k` (0 the centre), at angle `i` of `n` round, lifted by `off`. */
const spot = (k: number, i: number, n: number, off: number) =>
  onShell(
    VISOR.c[0] + VISOR.r[0] * k * Math.cos((i * TAU) / n),
    VISOR.c[1] + VISOR.r[1] * k * Math.sin((i * TAU) / n),
    off,
  );

/** Triangles over the front of the shell between points of `rows`, each row a ring of n (the first may be one point), in `col`. */
const plate = (rows: [Vec3, Vec3][][], col: number[], layer: number) => {
  const out: number[] = [];
  const tri = (...p: [Vec3, Vec3][]) => {
    // Wound as the surface faces.
    const [u, v] = [0, 1].map(k => [0, 1, 2].map(j => p[k + 1][0][j] - p[0][0][j]));
    const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const flip = c[0] * p[0][1][0] + c[1] * p[0][1][1] + c[2] * p[0][1][2] < 0;
    (flip ? [p[0], p[2], p[1]] : p).forEach(([q, n]) =>
      out.push(...q, ...n, col[0], col[1], layer, col[2]),
    );
  };
  rows.slice(1).forEach((row, r) => {
    const prev = rows[r];
    row.forEach((_, i) => {
      const j = (i + 1) % row.length;
      if (prev.length == 1) {
        tri(prev[0], row[i], row[j]);
      } else {
        tri(prev[i], row[i], row[j]);
        tri(prev[i], row[j], prev[j]);
      }
    });
  });
  return out;
};

interface Kit {
  shell: number[];
  visor: number[];
  rim: number[];
  crest: number[];
  pod: number[];
  bead: number[];
  collar: number[];
}

const kits = new Map<number, Kit>();

const kit = (lod: number): Kit => {
  const level = Math.min(lod, 2);
  let k = kits.get(level);
  if (!k) {
    const D = DETAIL[level];
    const white = (p: [number, number][], [n]: number[]) => dress(smooth(p, n), [1, 1, 1]);
    const [rings, n] = D.plate;
    const [a, b, d] = SHELL.r;
    const shell = white(
      dome(Math.asin((SHELL.rim - SHELL.c[1]) / SHELL.r[1]), D.shell[1]),
      D.shell,
    );
    // What the visor covers needs no shell behind it: the triangles of the front it will hide.
    const kept: number[] = [];
    for (let i = 0; i < shell.length; i += 3 * STRIDE) {
      const m = [0, 1, 2].map(v => v * STRIDE + i);
      const [x, h, z] = [
        (shell[m[0]] + shell[m[1]] + shell[m[2]]) * (a / 3),
        SHELL.c[1] - ((shell[m[0] + 2] + shell[m[1] + 2] + shell[m[2] + 2]) * b) / 3,
        ((shell[m[0] + 1] + shell[m[1] + 1] + shell[m[2] + 1]) * d) / 3,
      ];
      const hole =
        z < -0.02 &&
        (x / (VISOR.r[0] * 0.95)) ** 2 + ((h - VISOR.c[1]) / (VISOR.r[1] * 0.95)) ** 2 < 1;
      if (!hole) {
        kept.push(...shell.slice(i, i + 3 * STRIDE));
      }
    }
    const ring = (s: number, off: number) =>
      Array.from({ length: n }, (_, i) => spot(s, i, n, off));
    // The plate's rows from its middle out, to the opening's edge.
    const rows = [
      [spot(0, 0, 1, LIFT)],
      ...Array.from({ length: rings }, (_, r) => ring((r + 1) / rings, LIFT)),
    ];
    k = {
      // Below the equator down to the rim, then up over the crown.
      shell: kept,
      // Dark and polished: it reflects the sky.
      visor: plate(rows, TINT, SHINE),
      // The rim: a bevel from the shell's face up to a lip round the plate.
      rim: D.rim ? plate([ring(1.2, 0), ring(1, RIM)], GREY, -1) : [],
      // A spindle laid along the head: a low fin.
      crest: white(
        [
          [0, 0],
          [1, 0.5],
          [0, 1],
        ],
        D.crest,
      ),
      pod: white(dome(0, D.pod[1]), D.pod),
      bead: white(dome(0, 1), [5]),
      collar: white(
        [
          [0.92, 0],
          [1, 1],
        ],
        D.collar,
      ),
    };
    kits.set(level, k);
  }
  return k;
};

/**
 * Appends the helmet at level of detail `lod` (0 far, 1 near, 2 and up close) on the head joint at
 * `at` turned by `q` (see solve() in rig.ts), in `rgb`, the team's colour (0 to 1): its crest and
 * the beads on the ear pods, which glow. The far helmet is the shell, the visor and the crest.
 */
export const helmet = (out: number[], at: Vec3, q: Quat, rgb: number[], lod: number) => {
  const k = kit(lod);
  const head = (v: Vec3) => turn(q, v);
  /** Places `src` scaled by `s` at `p` in the head's frame, its axis along `to`, its x as near `side` as it can be. */
  const part = (src: number[], p: Vec3, to: Vec3, side: Vec3, s: Vec3, tint?: number[]) => {
    const [r, u, f] = aim(to, side);
    const o = head(p);
    place(
      out,
      src,
      [at[0] + o[0], at[1] + o[1], at[2] + o[2]],
      [head(r), head(u), head(f)],
      [0, 0, 0],
      s,
      tint,
    );
  };
  const [c, [a, b, d]] = [SHELL.c, SHELL.r];
  // The shell: revolved about the head's vertical (the axis along up), wider than deep.
  part(k.shell, c, [0, 1, 0], [1, 0, 0], [a, d, b], WHITE);
  // The visor and its rim are built in the head's frame already.
  for (const src of [k.visor, k.rim]) {
    part(src, [0, 0, 0], [0, 0, -1], [1, 0, 0], [1, 1, 1]);
  }
  part(k.crest, [0, 0.197, 0.055], [0, 0, -1], [1, 0, 0], [0.014, 0.01, 0.11], rgb);
  if (!lod) {
    return;
  }
  part(k.collar, [0, SHELL.rim - 0.005, 0], [0, 1, 0], [1, 0, 0], [0.085, 0.098, 0.03], IRON);
  for (const x of [-1, 1]) {
    part(k.pod, [0.115 * x, 0.025, 0.012], [x, 0, 0], [0, 1, 0], [0.05, 0.05, 0.03], GREY);
    const from = out.length;
    part(k.bead, [0.139 * x, 0.025, 0.012], [x, 0, 0], [0, 1, 0], [0.016, 0.016, 0.01], rgb);
    glow(out, from, GLOW);
  }
};
