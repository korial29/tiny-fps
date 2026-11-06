// Capture the flag, drawn: each team's base (a pad with a glowing ring) and its flag (a pole with
// a cloth that waves), as triangles in the renderer's vertex format (mesh.ts). Pure functions of the
// state and the clock, no state, no DOM, no GL. Everything is lit and casts a shadow, but the rings
// and the pole tips (layer -2), which glow.
import { FLAG_REACH, TEAM_COLOR } from '../shared/constants';
import { FLAG } from '../shared/types';
import type { FlagState, PlayerState } from '../shared/types';
import { STRIDE, place, segment, solid } from './mesh';
import type { Vec3 } from './mesh';

/** One flag to draw. */
export interface FlagDraw {
  /** The team the flag belongs to: its colour. */
  team: number;
  /** The foot of the pole: the base, where it lies, or the feet of the carrier. */
  at: Vec3;
  /** On a carrier's back: where he looks (yaw) and his speed on x and z, which the cloth trails against. */
  by?: { yaw: number; vx: number; vz: number };
  /** Lying where it was dropped. */
  dropped?: boolean;
}

/** Height of a pole, metres. */
export const POLE = 2.4;
/** The cloth: length along the wind and height at the pole. */
const CLOTH: [number, number] = [1, 0.62];
/** Pieces of a cloth along its length, and sides of a ring. */
const PIECES = 8;
const SIDES = 28;
/** The glow of an unlit part, as a multiple of its colour: above 1 it blooms. */
export const GLOW = 2.2;
/** How far a pad stands out of the roof, and a ring over it, metres. */
const PAD = 0.04;
const RING = 0.045;

/** A team's colour as RGB in 0..1: TEAM_COLOR is always #rrggbb. */
export const teamRgb = (team: number): number[] => {
  const n = parseInt(TEAM_COLOR[team].slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255].map(c => c / 255);
};

/** What the renderer draws of the match: the base of each team and the flags in play. */
export interface CtfScene {
  bases: readonly Vec3[];
  flags: readonly FlagDraw[];
  /** Each team's gun rack, where it has one, and the health packs that are there to take. */
  racks?: readonly (Vec3 | undefined)[];
  packs?: readonly Vec3[];
}

/** The flags to draw from a snapshot: each at its base, where it lies, or on the back of its carrier (none if he is not drawn). */
export const flagDraws = (
  flags: readonly FlagState[],
  bases: readonly Vec3[],
  who: (id: number) => PlayerState | undefined,
): FlagDraw[] =>
  flags.flatMap((f, team): FlagDraw[] => {
    if (f.state === FLAG.DROPPED) {
      return [{ team, at: [f.x, f.y, f.z], dropped: true }];
    }
    if (f.state === FLAG.CARRIED) {
      const p = who(f.by);
      return p ? [{ team, at: [p.x, p.y, p.z], by: { yaw: p.yaw, vx: p.vx, vz: p.vz } }] : [];
    }
    return [{ team, at: bases[team] }];
  });

const AXES: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** Makes the vertices from `from` on glow: the colour gets brighter by `k` and loses its shading. */
export const glow = (out: number[], from: number, k: number) => {
  for (let i = from; i < out.length; i += STRIDE) {
    out[i + 6] *= k;
    out[i + 7] *= k;
    out[i + 9] *= k;
    out[i + 8] = -2;
  }
};

/** A triangle with its flat normal, of one colour (r, g, b). */
export const tri = (out: number[], a: Vec3, b: Vec3, c: Vec3, [r, g, bl]: number[]) => {
  const [ux, uy, uz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const [vx, vy, vz] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  const l = Math.hypot(...n) || 1;
  for (const p of [a, b, c]) {
    out.push(...p, n[0] / l, n[1] / l, n[2] / l, r, g, -1, bl);
  }
};

/** A ring between the radii r0 and r1 on the horizontal at `at`, facing up: SIDES quads. */
export const ring = (out: number[], at: Vec3, r0: number, r1: number, rgb: number[]) => {
  for (let i = 0; i < SIDES; i++) {
    const [a, b] = [i, i + 1].map(k => (k * 2 * Math.PI) / SIDES);
    const p = (r: number, t: number): Vec3 => [
      at[0] + r * Math.cos(t),
      at[1],
      at[2] + r * Math.sin(t),
    ];
    tri(out, p(r0, a), p(r1, b), p(r1, a), rgb);
    tri(out, p(r0, a), p(r0, b), p(r1, b), rgb);
  }
};

/** A disc, a fan of SIDES triangles. */
const disc = (out: number[], at: Vec3, r: number, rgb: number[]) => {
  for (let i = 0; i < SIDES; i++) {
    const [a, b] = [i, i + 1].map(k => (k * 2 * Math.PI) / SIDES);
    tri(
      out,
      at,
      [at[0] + r * Math.cos(b), at[1], at[2] + r * Math.sin(b)],
      [at[0] + r * Math.cos(a), at[1], at[2] + r * Math.sin(a)],
      rgb,
    );
  }
};

/**
 * A team's base at `at`: a low pad of the team colour under a glowing ring of FLAG_REACH, the
 * radius within which a flag is touched and a capture counts. `t` is the clock in seconds: the
 * ring pulses.
 */
export const base = (out: number[], at: Vec3, rgb: number[], t: number) => {
  disc(
    out,
    [at[0], at[1] + PAD, at[2]],
    FLAG_REACH,
    rgb.map(c => c * 0.4),
  );
  const from = out.length;
  ring(out, [at[0], at[1] + RING, at[2]], FLAG_REACH - 0.16, FLAG_REACH, rgb);
  glow(out, from, GLOW * (0.75 + 0.25 * Math.sin(t * 3)));
};

/**
 * The cloth: a pennant from `root` (the top of the pole) along the unit direction `d` (horizontal),
 * `len` long and `h` high at the pole and a point at its tip, hanging down. It waves sideways, more
 * toward its tip, by `amp` metres at the tip, with `t` the clock and `k` the waves per metre it
 * carries. Both sides are drawn, the second a hair behind, each lit by its own normal.
 */
const cloth = (
  out: number[],
  root: Vec3,
  d: Vec3,
  [len, h]: [number, number],
  amp: number,
  t: number,
  rgb: number[],
) => {
  // Sideways, horizontal, across the wind.
  const s: Vec3 = [-d[2], 0, d[0]];
  const at = (u: number, v: number): Vec3 => {
    const w = amp * u * Math.sin(t * 7 - u * 5);
    // A pennant tapers toward its tip: the lower edge rises to meet the upper one.
    const drop = h * v * (1 - u);
    return [
      root[0] + d[0] * len * u + s[0] * w,
      root[1] - drop + 0.12 * len * u * Math.sin(t * 5 - u * 4) * amp,
      root[2] + d[2] * len * u + s[2] * w,
    ];
  };
  for (let i = 0; i < PIECES; i++) {
    const [u0, u1] = [i / PIECES, (i + 1) / PIECES];
    const [a, b, c, e] = [at(u0, 0), at(u1, 0), at(u1, 1), at(u0, 1)];
    // Front, then the back side, drawn with the opposite winding and a hair apart.
    const n = [
      (b[1] - a[1]) * (e[2] - a[2]) - (b[2] - a[2]) * (e[1] - a[1]),
      (b[2] - a[2]) * (e[0] - a[0]) - (b[0] - a[0]) * (e[2] - a[2]),
      (b[0] - a[0]) * (e[1] - a[1]) - (b[1] - a[1]) * (e[0] - a[0]),
    ];
    const l = Math.hypot(...n) || 1;
    const nudge = (p: Vec3, sign: number): Vec3 => [
      p[0] + (n[0] / l) * 0.004 * sign,
      p[1] + (n[1] / l) * 0.004 * sign,
      p[2] + (n[2] / l) * 0.004 * sign,
    ];
    for (const sign of [1, -1]) {
      const q = [a, b, c, e].map(p => nudge(p, sign)) as [Vec3, Vec3, Vec3, Vec3];
      const [p0, p1, p2, p3] = sign > 0 ? q : [q[0], q[3], q[2], q[1]];
      tri(out, p0, p1, p2, rgb);
      tri(out, p0, p2, p3, rgb);
    }
  }
};

/** The pole from a to b, with a glowing bead on its tip. */
const pole = (out: number[], a: Vec3, b: Vec3, rgb: number[]) => {
  segment(out, solid(1, 1, [1, 1], [0, 0]), a, b, [0.6, 0, 0.8], 1, 0.045, [0.82, 0.84, 0.9]);
  const from = out.length;
  place(out, solid(1, 0, [1, 1]), b, AXES, [0, 0, 0], 0.09, rgb);
  glow(out, from, GLOW);
};

/**
 * A flag. At rest on its base it stands upright with the cloth blowing out to one side. On a
 * carrier's back it leans out behind him and the cloth trails away from where he runs, more
 * stretched the faster he goes. Dropped, it lies on the ground, the pole leaning, with a ring
 * on the ground where it is to be touched. `t` is the clock in seconds.
 */
export const flag = (out: number[], f: FlagDraw, rgb: number[], t: number) => {
  const [x, y, z] = f.at;
  const phase = t + f.team * 1.7;
  if (f.by) {
    const { yaw, vx, vz } = f.by;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const speed = Math.hypot(vx, vz);
    // The pole is strapped to the back and leans away from him; the cloth streams against the run.
    const foot: Vec3 = [x - fx * 0.28, y + 0.55, z - fz * 0.28];
    const top: Vec3 = [x - fx * 0.38, y + 0.55 + POLE - 0.2, z - fz * 0.38];
    const [dx, dz] = speed > 1 ? [-vx / speed, -vz / speed] : [-fx, -fz];
    pole(out, foot, top, rgb);
    const wind = Math.min(1, speed / 8);
    cloth(
      out,
      top,
      [dx, 0, dz],
      [CLOTH[0] * (0.7 + 0.5 * wind), CLOTH[1]],
      0.1 + 0.16 * wind,
      phase,
      rgb,
    );
    return;
  }
  if (f.dropped) {
    // Fallen over, the tip toward a direction that depends on the place, the cloth in the dust.
    const a = x * 12.9898 + z * 78.233;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    const top: Vec3 = [x + c * 2.3, y + 0.6, z + s * 2.3];
    pole(out, [x, y + 0.06, z], top, rgb);
    cloth(out, top, [c, 0, s], [CLOTH[0] * 0.8, CLOTH[1] * 0.8], 0.04, phase, rgb);
    const from = out.length;
    ring(out, [x, y + RING, z], FLAG_REACH - 0.1, FLAG_REACH, rgb);
    glow(out, from, GLOW * (0.5 + 0.5 * Math.abs(Math.sin(t * 5))));
    return;
  }
  const top: Vec3 = [x, y + POLE, z];
  pole(out, [x, y, z], top, rgb);
  // The wind blows red and blue flags opposite ways, so the two bases read as apart.
  const w = 0.6 + f.team * Math.PI;
  cloth(out, top, [Math.cos(w), 0, Math.sin(w)], CLOTH, 0.18, phase, rgb);
};
