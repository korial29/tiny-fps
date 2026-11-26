import { BUST, BUST_Y, body } from '../skin';
import type { Skin } from '../skin';
import { TURN } from './types';
import type { Corner, Moulded, Shell } from './types';
import {
  PART,
  smooth,
  twin,
  pecs,
  bust,
  CAST,
  vambrace,
  chestHigh,
  REGIONS,
  OFF,
  partOf,
} from './regions';
import type { Region } from './regions';
import { LIMITS } from './clip';

export const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
  return ((z ^ (z >>> 14)) >>> 0) / 2 ** 32;
};

/** The region as the skin's build wears it: the woman's chest plate has her own swell. */
export const shaped = (g: Region, s: Skin): Region =>
  s.b && g.swell === pecs ? { ...g, swell: bust } : g;

export const bell = (a: number, w: number) => Math.exp(-((a / w) ** 2));
const unit = (x: number, y: number, z: number) => {
  const n = Math.hypot(x, y, z) || 1;
  return [x / n, y / n, z / n];
};

/**
 * The share of the skin a moulded plate may come closer to than OFF, how close it comes to any and
 * how far it stands off at most, and the least the skin must face out from the trunk's axis (the
 * cosine) to be moulded: the eye's skin (body(2)) closes the trunk with a cap over the shoulders
 * whose normals point up, and set off to the shell along them the plate rose over the head (the
 * user, 2026-11-12, climbing: "the legs go up").
 */
const [CLEAR, FLOOR, CEIL, FACING] = [0.03, 0.004, 0.08, 0.5];
/** How far round from the front the shell is fitted (radians): past it its polynomial runs wild. */
const FIT = 1.35;

const shells = new Map<number, Shell>();

/** The fit's terms: even powers of the angle round the axis by powers of the height. */
const [POW_A, POW_Y] = [4, 5];
const fitAt = (w: number[], a: number, y: number) => {
  const [a2, h] = [a * a, (y - 1.35) / 0.2];
  let [sum, pa] = [0, 1];
  for (let i = 0, p = 0; i < POW_A; i++, pa *= a2) {
    let py = pa;
    for (let j = 0; j < POW_Y; j++, p++, py *= h) {
      sum += w[p] * py;
    }
  }
  return sum;
};

/** Her bust on the skin where it faces forward by `ahead` (retarget() in skin.ts), along -z. */
const sag = (b: number, x: number, y: number, ahead: number) =>
  b
    ? BUST *
      Math.min(Math.max(ahead * 1.6, 0), 1) *
      bell(Math.abs(x) - 0.066, 0.05) *
      bell(y - BUST_Y, y < BUST_Y ? 0.042 : 0.065)
    : 0;

/**
 * Her bust as the shell has it (the user, 2026-11-12: keep the bust on the woman, smooth the man):
 * as deep as on her skin, the same bells but smooth across the sternum and round the sides.
 */
const bustR = (b: number, a: number, r: number, y: number) =>
  b
    ? BUST *
      smooth(0, 0.625, Math.cos(a)) *
      twin(r * Math.sin(a), 0.066, 0.05) *
      bell(y - BUST_Y, y < BUST_Y ? 0.042 : 0.065) *
      Math.cos(a)
    : 0;

/**
 * Her breasts on the shell (the user, 2026-11-12: a uniform dome each, a little bigger): a round
 * dome each side, `h` out at its middle (x, y) and falling to nothing `r` away, smooth at its rim;
 * it stands in for the skin's bust and bust()'s cups.
 */
export const DOME = { x: 0.07, y: 1.362, r: 0.078, h: 0.05 };
export const dome = (x: number, y: number) =>
  [x - DOME.x, x + DOME.x].reduce((sum, dx) => {
    const q = 1 - (dx * dx + (y - DOME.y) ** 2) / DOME.r ** 2;
    return sum + DOME.h * Math.max(0, q) ** 2;
  }, 0);
/** The ninja's vest has them a little smaller (the user, 2026-11-13): this much of their height. */
export const SLIM = 0.65;

const polar = (z0: number, x: number, z: number) => [Math.atan2(x, z0 - z), Math.hypot(x, z - z0)];

/** The skin's radius at a point of the man's rest skin, its normal's z given: hers has the bust on. */
const skinR = (b: number, z0: number, x: number, y: number, z: number, nz: number) => {
  const [a, r] = polar(z0, x, z);
  return r + sag(b, x, y, -nz) * Math.cos(a);
};

/**
 * The marine's chest shell swells toward the shoulders (the user, 2026-11-13: the plate on over the
 * top of the pecs, near the shoulders): there the shoulder's skin stands out of the trunk's, and a
 * plate held off it stood a step over the plate under the split. `out` more, from the first angle
 * `a` (degrees) to the second and the first height `y` to the second, so the two are one surface;
 * less again up to the collar piece (`top`), which it would cover.
 */
export const SWELL = { out: 0.008, a: [32, 52], y: [1.33, 1.41], top: [1.44, 1.5] };

/** The shell's radius at angle a and height y, its clearance left out. */
const rawR = (b: number, gi: number, w: number[], a: number, y: number) => {
  const f = fitAt(w, a, y);
  const swell = b ? dome : REGIONS[gi].swell;
  // The marine's swells toward the shoulders (SWELL).
  const out = REGIONS[gi].alone
    ? 0
    : SWELL.out *
      smooth(SWELL.a[0], SWELL.a[1], (Math.abs(a) * 180) / Math.PI) *
      smooth(SWELL.y[0], SWELL.y[1], y) *
      (1 - 0.6 * smooth(SWELL.top[0], SWELL.top[1], y));
  return f + out + (swell ? swell(f * Math.sin(a), y, 0) : 0) * (b && REGIONS[gi].alone ? SLIM : 1);
};

/**
 * The shell of build b's region gi, fitted once on the near skin, whatever the level drawn: points
 * all over its trunk's triangles, the corners and between them, the bust taken off, fitted by least
 * squares; then OFF clear of the region's points but the closest CLEAR of them.
 */
const shellOf = (b: number, gi: number): Shell => {
  const key = b * REGIONS.length + gi;
  const had = shells.get(key);
  if (had) {
    return had;
  }
  const { t, l, u, v: own } = body(1, b);
  const v = u ?? own;
  const W = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1 / 3, 1 / 3, 1 / 3],
    [2 / 3, 1 / 6, 1 / 6],
    [1 / 6, 2 / 3, 1 / 6],
    [1 / 6, 1 / 6, 2 / 3],
  ];
  const pts: number[][] = [];
  for (let k = 0; k < t.length / 3; k++) {
    if (partOf(l![k]) == PART.TRUNK) {
      for (const c of W) {
        const p = [0, 1, 2, 5].map(j =>
          [0, 1, 2].reduce((sum, q) => sum + v[t[k * 3 + q] * 6 + j] * c[q], 0),
        );
        if (p[1] > 1.15 && p[1] < 1.55) {
          pts.push(p);
        }
      }
    }
  }
  let [front, back] = [Infinity, -Infinity];
  for (const p of pts) {
    if (p[1] > 1.2 && p[1] < 1.5) {
      front = Math.min(front, p[2]);
      back = Math.max(back, p[2]);
    }
  }
  // The axis, up through the middle of the chest.
  const z0 = (front + back) / 2;
  const M = POW_A * POW_Y;
  const A = Array.from({ length: M }, () => new Array<number>(M + 1).fill(0));
  const e = new Array<number>(M).fill(0);
  for (const [x, y, z, nz] of pts) {
    const [a, r] = polar(z0, x, z);
    if (Math.abs(a) < FIT) {
      const f = e.map((_, p) => {
        e.fill(0);
        e[p] = 1;
        return fitAt(e, a, y);
      });
      const hgt = skinR(b, z0, x, y, z, nz) - bustR(b, a, r, y);
      for (let p = 0; p < M; p++) {
        for (let q = 0; q < M; q++) {
          A[p][q] += f[p] * f[q];
        }
        A[p][M] += f[p] * hgt;
      }
    }
  }
  // Gauss-Jordan with partial pivoting.
  for (let p = 0; p < M; p++) {
    let m = p;
    for (let q = p + 1; q < M; q++) {
      m = Math.abs(A[q][p]) > Math.abs(A[m][p]) ? q : m;
    }
    [A[p], A[m]] = [A[m], A[p]];
    for (let q = 0; q < M; q++) {
      if (q != p) {
        const f = A[q][p] / A[p][p];
        for (let r = p; r <= M; r++) {
          A[q][r] -= f * A[p][r];
        }
      }
    }
  }
  const w = A.map((row, p) => row[M] / row[p]);
  // Not clear of all of it: the step at the armpits (the trunk's split) would push the whole shell
  // out; the few corners there keep FLOOR.
  const over: number[] = [];
  for (const [x, y, z, nz] of pts) {
    if (LIMITS[gi].every(f => f([x, y, z, 0, 0, 0, 0, 0, 0, 0]) >= 0)) {
      over.push(skinR(b, z0, x, y, z, nz) - rawR(b, gi, w, polar(z0, x, z)[0], y));
    }
  }
  over.sort((p, q) => q - p);
  const shell = { z0, w, clear: over[Math.floor(over.length * CLEAR)] + OFF };
  shells.set(key, shell);
  return shell;
};

/**
 * A moulded plate (the user, 2026-11-12: the chest uneven, as the plate followed every facet of the
 * skin, its creases and the line under the bust): a shell round the trunk (shellOf()), its radius
 * smooth in the angle (even: both sides alike) and the height. Each corner of the region on the
 * skin `s` is set off to the shell, with the shell's normal, turned as the skin turns.
 */
export const moulding = (s: Skin, gi: number) => {
  const b = s.b ?? 0;
  const { z0, w, clear } = shellOf(b, gi);
  const shell = (a: number, y: number) => rawR(b, gi, w, a, y) + clear;
  const done = new WeakMap<Corner, Moulded>();
  const { t } = s;
  const facing = (x: number, z: number, n: number[]) => {
    const a = polar(z0, x, z)[0];
    return n[0] * Math.sin(a) - n[2] * Math.cos(a);
  };
  return (c: Corner, k: number, turned = 0): Moulded => {
    const had = done.get(c);
    if (had) {
      return had;
    }
    const [x, y, z] = c;
    // The rest normal of the skin as drawn, the build's own: the plate is set off along it. A
    // corner on the rim of a hole has its own the other way (`turned`, cooking()).
    const o = unit(
      ...([0, 1, 2].map(j =>
        [0, 1, 2].reduce(
          (sum, q) =>
            sum + s.v[t[k * 3 + q] * 6 + 3 + j] * c[3 + q] * (turned & (TURN << q) ? -(j != 1) : 1),
          0,
        ),
      ) as [number, number, number]),
    );
    if (facing(x, z, o) < FACING || Math.abs(polar(z0, x, z)[0]) > FIT) {
      // Not facing out, or round past the fit (shellOf()): set off as an unmoulded plate, along
      // the skin, with its normal.
      const m = [OFF, 0, 0, 0, ...o];
      done.set(c, m);
      return m;
    }
    // Her bust is on the skin as drawn (retarget(), by the man's normal): the plate starts from it.
    const base = [x, y, z - sag(b, x, y, -unit(c[6], c[7], c[8])[2])];
    // Onto the shell where the normal meets it, not where it leaves the skin: on her bust the
    // normals fan out, and the plate set off by the gap at its foot was uneven (the user, 2026-11-13).
    /** How far the shell is past the point `d` along the normal, and the shell there. */
    const gap = (d: number) => {
      const p = base.map((c, j) => c + o[j] * d);
      const [a, r] = polar(z0, p[0], p[2]);
      const R = shell(a, p[1]);
      return [R - r, a, R, p[1]];
    };
    let [g, a, R, py] = gap(0);
    let [lo, hi] = [0, CEIL];
    // Where the normal crosses the shell, by halving: a dome's slope is too steep to walk down
    // (hers). His chest is flat enough for the gap at the foot, but over the trunk's split the
    // shoulder's skin turns its normal off the trunk's, and his plate set off by it stood 3 to 5 mm
    // over the plate under the split, a line across it (the user, 2026-11-17): there, halving.
    const f0 = facing(x, z, o);
    const tilt = b ? 1 : smooth(0.97, 0.9, f0);
    for (let i = 0; tilt > 0 && i < 12; i++) {
      const m = (lo + hi) / 2;
      [g, a, R, py] = gap(m);
      if (g > 0) {
        lo = m;
      } else {
        hi = m;
      }
    }
    const first = gap(0)[0] / f0;
    if (tilt > 0) {
      [g, a, R, py] = gap(lo);
    }
    const d = Math.min(CEIL, Math.max(FLOOR, first + (lo - first) * tilt));
    const [sa, ca] = [Math.sin(a), Math.cos(a)];
    const e = 1e-3;
    const Ra = (shell(a + e, py) - shell(a - e, py)) / (2 * e);
    const Ry = (shell(a, py + e) - shell(a, py - e)) / (2 * e);
    // The shell's normal: its slope round the axis crossed with its slope up it.
    const Pa = [Ra * sa + R * ca, 0, -Ra * ca + R * sa];
    const Py = [Ry * sa, 1, -Ry * ca];
    const N = unit(
      Pa[1] * Py[2] - Pa[2] * Py[1],
      Pa[2] * Py[0] - Pa[0] * Py[2],
      Pa[0] * Py[1] - Pa[1] * Py[0],
    );
    const out = N[0] * sa - N[2] * ca >= 0 ? N : N.map(q => -q);
    // By the armhole, back down onto the skin over the last centimetres under the plate's edge
    // (the user, 2026-11-17): there the skin hollows under the arm, centimetres under the shell,
    // and the plate's edge stood off it as a wall as tall, cut in slivers. Down to half again OFF:
    // at OFF the shoulder's skin, out over the trunk's under the split, came through it. Under the
    // split alone: over it the plate followed the step between the trunk's skin and the
    // shoulder's, a line across it.
    const deg = (a * 180) / Math.PI;
    const arm =
      REGIONS[gi].high === chestHigh
        ? smooth(30, 50, Math.abs(deg)) *
          (1 - smooth(0.005, 0.05, chestHigh(deg) - y)) *
          (1 - smooth(1.385, 1.405, y))
        : 0;
    const keep = 1 - arm;
    const m = [
      1.5 * OFF + (d - 1.5 * OFF) * keep,
      (o[0] - out[0]) * keep,
      (o[1] - out[1]) * keep,
      (o[2] - out[2]) * keep,
      ...o,
    ];
    done.set(c, m);
    return m;
  };
};

/** The cast forearm plate's radius at the angle `t` round the arm (0 out to the side, toward +z) and height `y`, on the side `side`. */

const castR = (t: number, y: number, side: number) => {
  const [y0, y1, y2] = CAST.y;
  const k = y < y1 ? 0 : 1;
  const f = Math.min(Math.max((y - (k ? y1 : y0)) / (k ? y2 - y1 : y1 - y0), 0), k ? 1.2 : 1);
  const [ax, az] = [CAST.x, CAST.z].map(v => v[k] + (v[k + 1] - v[k]) * f);
  const [c, s] = [Math.cos(t), Math.sin(t)];
  const r = (Math.abs(c / ax) ** CAST.n + Math.abs(s / az) ** CAST.n) ** (-1 / CAST.n);
  return r + vambrace(side * (CAST.cx + r * c), y);
};

/**
 * The forearm's plate on the skin `s` (CAST): each corner set off along the skin's rest normal to
 * the cast's radius, with the cast's normal, as moulding() does the chest's.
 */
export const casting = (s: Skin) => {
  const { t } = s;
  return (c: Corner, k: number, turned = 0): Moulded => {
    const [x, y, z] = c;
    const side = Math.sign(x) || 1;
    const o = unit(
      ...([0, 1, 2].map(j =>
        [0, 1, 2].reduce(
          (sum, q) =>
            sum + s.v[t[k * 3 + q] * 6 + 3 + j] * c[3 + q] * (turned & (TURN << q) ? -(j != 1) : 1),
          0,
        ),
      ) as [number, number, number]),
    );
    const dx = x * side - CAST.cx;
    const a = Math.atan2(z, dx);
    const d = Math.max(CAST.floor, castR(a, y, side) - Math.hypot(dx, z));
    // The cast's normal, from its slopes round the arm and up it.
    const at = (q: number, h: number) => {
      const r = castR(q, h, side);
      return [side * r * Math.cos(q), h, r * Math.sin(q)];
    };
    const e = 1e-3;
    const [p0, p1, h0, h1] = [at(a - e, y), at(a + e, y), at(a, y - e), at(a, y + e)];
    const ta = p1.map((v, j) => v - p0[j]);
    const ty = h1.map((v, j) => v - h0[j]);
    let N = unit(
      ta[1] * ty[2] - ta[2] * ty[1],
      ta[2] * ty[0] - ta[0] * ty[2],
      ta[0] * ty[1] - ta[1] * ty[0],
    );
    if (N[0] * side * Math.cos(a) + N[2] * Math.sin(a) < 0) {
      N = N.map(v => -v);
    }
    return [d, o[0] - N[0], o[1] - N[1], o[2] - N[2], ...o];
  };
};
