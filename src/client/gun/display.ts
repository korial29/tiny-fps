// The gun displays: the digits, the counter, the LCD, the scope and the smoke.
import { CHARGE_MAX, NADE_MAX } from '../../shared/constants';
import { TAU } from '../../shared/physics';
import { glow as lit, tri } from '../flag';
import { place, unit } from '../mesh';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import { GLYPHS, SHOTS } from '../computer';
import { WINDOW } from '../pistol';
import { sgn, tube } from './loft';
import { DARK } from './paint';
import { axisY } from './railgun';
import { HOUSING_BACK, HOUSING_FOOT, HOUSING_SLOPE } from './rifle';
import { BACK, BACK_N, FACE } from './sidearm';

/** The segments of the digits 0 to 9, a to g: top, top right, bottom right, bottom, bottom left, top left, middle. */
const DIGITS = [
  'abcdef',
  'bc',
  'abdeg',
  'abcdg',
  'bcfg',
  'acdfg',
  'acdefg',
  'abc',
  'abcdefg',
  'abcdfg',
];
/** A digit: width, height, thickness of a segment, gap between the two digits. */
const [DW, DH, DT, DGAP] = [0.019, 0.0205, 0.005, 0.004];
/** The rectangle of each segment in a digit `w` wide, `h` tall, its segments `t` thick: across and up from its bottom left corner. */
const segments = (
  w: number,
  h: number,
  t: number,
): Record<string, [number, number, number, number]> => ({
  a: [0, h - t, w, h],
  b: [w - t, h / 2, w, h],
  c: [w - t, 0, w, h / 2],
  d: [0, 0, w, t],
  e: [0, 0, t, h / 2],
  f: [0, h / 2, t, h],
  g: [0, (h - t) / 2, w, (h + t) / 2],
});
const SEGMENTS = segments(DW, DH, DT);
/**
 * The counter on the gun's glossy black cut, in the middle of its outline (the user, 2026-11-09: no
 * screen or support of its own, the frame round and near the edge): the digits' middle up the face
 * from BACK, the half height the charge gauge counts from, the digits' scale.
 */
const [SM, SHH, DK] = [FACE[0], 0.0163, 1];
/** The digits' foot, so that they are in the middle of the screen; the charge gauge, a thin bar under them up the back face: where it starts and ends, and the gap between its cells. */
const DY = SM - (DH * DK) / 2;
const [GFROM, GTO, GGAP] = [SM - SHH + 0.0008, DY - 0.0004, 0.0012];
const readouts = new Map<number, number[]>();
/**
 * Printed circuit tracks round the digits, inside the frame (the user, 2026-11-09): the right
 * half's, mirrored to the left, each a run of [across, up from the middle] points ending in a pad.
 */
export const TRACKS = [
  [
    [0.0225, 0.004],
    [0.028, 0.004],
    [0.033, 0.009],
    [0.036, 0.009],
  ],
  [
    [0.0225, -0.004],
    [0.026, -0.004],
    [0.031, -0.009],
    [0.031, -0.016],
  ],
  [
    [0.0225, 0],
    [0.035, 0],
  ],
  [
    [0.004, 0.0125],
    [0.004, 0.017],
    [0.009, 0.022],
    [0.019, 0.022],
  ],
  [
    [0.014, 0.0125],
    [0.014, 0.016],
    [0.024, 0.016],
    [0.028, 0.02],
  ],
  [
    [0.008, -0.017],
    [0.008, -0.021],
    [0.013, -0.026],
  ],
  [
    [0.0185, -0.017],
    [0.0185, -0.023],
  ],
];

/**
 * The shots in the battery as two glowing seven-segment digits on a dark screen set in the back of
 * a small block on top of the body, in model space: cyan, red at 4 or fewer, thick segments that bloom only a
 * little, the screen framed in a line of their colour. The block is part of the readout, so only a gun that shows the ammo carries it. 99 at most.
 * While the gun charges, a gauge of CHARGE_MAX cells under the digits lights `level` of them, the
 * strength the shot would have; all orange at the full charge. Not `shown`: the block and the dark
 * screen only, the gun still booting.
 */
export const readout = (ammo: number, level = 0, shown = true, glyphs = false): number[] => {
  const n = Math.min(Math.max(Math.floor(ammo), 0), 99);
  const key = ((n * 8 + Math.min(Math.max(level, 0), CHARGE_MAX)) * 2 + +shown) * 2 + +glyphs;
  let out = readouts.get(key);
  if (!out) {
    const v: number[] = (out = []);
    // The back face's axes: up its slope and out of it, from BACK.
    const slope: Vec3 = [0, BACK_N[2], -BACK_N[1]];
    const N = BACK_N;
    const at = (a: number, b: number, k: number): Vec3 => [
      BACK[0] + a,
      BACK[1] + slope[1] * b + N[1] * k,
      BACK[2] + slope[2] * b + N[2] * k,
    ];
    // The Hunter's signs glow his ember, as his wrist computer's.
    const rgb = glyphs ? [1, 0.22, 0.06] : n > 4 ? [0.25, 0.9, 1] : [1, 0.18, 0.12];
    /** The gauge's cells, the lit ones or the dim ones, while it charges. */
    const gauge = (on: boolean) => {
      const w = ((2 * DW + DGAP) * DK - (CHARGE_MAX - 1) * GGAP) / CHARGE_MAX;
      for (let c = 0; level > 0 && c < CHARGE_MAX; c++) {
        if (c < level === on) {
          const x = (-DW - DGAP / 2) * DK + c * (w + GGAP);
          const p = (a: number, b: number) => at(a, b, 0.0027);
          const rgb = !on
            ? glyphs
              ? [0.12, 0.03, 0.01]
              : [0.04, 0.12, 0.16]
            : level >= CHARGE_MAX
              ? [1.3, 0.6, 0.15]
              : glyphs
                ? [1, 0.22, 0.06]
                : [0.25, 0.9, 1];
          // The Hunter's gauge lies in his screen's window, under his signs.
          const [g0, g1] = glyphs ? [WINDOW[2] - 0.0145, WINDOW[2] - 0.0115] : [GFROM, GTO];
          tri(v, p(x, g0), p(x + w, g0), p(x + w, g1), rgb);
          tri(v, p(x, g0), p(x + w, g1), p(x, g1), rgb);
        }
      }
    };
    gauge(false);
    const from = v.length;
    if (glyphs && shown) {
      // The Hunter's pistol counts in the signs of his wrist computer (computer.ts, the user,
      // 2026-11-26): four cells across the screen, two dashes a shot, lit from the left; the
      // battery's GUN_MAG is the computer's HUNTER_CELLS. The dark dashes are drawn too, dim.
      const [cw, cg] = [0.015, 0.0025];
      const x0 = -(4 * cw + 3 * cg) / 2;
      const y0 = WINDOW[2] - cw / 2 + 0.004;
      let left = n;
      GLYPHS.forEach((glyph, g) => {
        const on = 2 * Math.min(SHOTS[g], left);
        left -= on / 2;
        glyph.forEach(([right, up, a], i) => {
          const [c, s] = [0.1 * cw * Math.cos(a), 0.1 * cw * Math.sin(a)];
          const [w, h] = [0.05 * cw * -Math.sin(a), 0.05 * cw * Math.cos(a)];
          const [x, y] = [x0 + g * (cw + cg) + right * cw, y0 + up * cw];
          const p = (dx: number, dy: number) => at(x + dx, y + dy, 0.0027);
          const tone = i < on ? rgb : rgb.map(k => k * 0.12);
          tri(v, p(-c - w, -s - h), p(c - w, s - h), p(c + w, s + h), tone);
          tri(v, p(-c - w, -s - h), p(c + w, s + h), p(-c + w, -s + h), tone);
        });
      });
    }
    [...(shown && !glyphs ? `${n}`.padStart(2, '0') : '')].forEach((ch, i) => {
      const x0 = (-DW - DGAP / 2 + i * (DW + DGAP)) * DK;
      for (const seg of DIGITS[+ch]) {
        const [a, b, d, e] = SEGMENTS[seg];
        // Alien glyphs (the user, 2026-11-09): each segment a thin slash, cut on the slant at both
        // ends, apart from the next, the digit leaning forward. Segments lie on the screen, a hair out of it.
        const p = (x: number, t: number) =>
          at(x0 + (x + (t - DH / 2) * 0.3) * DK, DY + t * DK, 0.0027);
        const h = d - a > e - b;
        const [u0, u1, w0, w1] = h
          ? [a + 0.0012, d - 0.0012, b, e]
          : [b + 0.0012, e - 0.0012, a, d];
        const [l, m, s] = [u1 - u0, (w0 + w1) / 2, (w1 - w0) * 0.32];
        const slash = [
          [0, m - s],
          [0.7, m - s],
          [1, m + s],
          [0.3, m + s],
        ].map(([k, w]) => (h ? p(u0 + k * l, w) : p(w, u0 + k * l)));
        if (!h) {
          slash.reverse();
        }
        tri(v, slash[0], slash[1], slash[2], rgb);
        tri(v, slash[0], slash[2], slash[3], rgb);
      }
    });
    // The lit cells and the frame glow with the digits. The Hunter's screen is set into his
    // pistol (pistol.ts): no frame of light round it, and no tracks.
    if (shown) {
      gauge(true);
    }
    if (shown && !glyphs) {
      // Round, 2 mm inside the cut's smooth outline (the user, 2026-11-09), a band 2.4 mm wide (the user, 2026-11-09: wider), 1 mm
      // out of the face, clear of the outline 0.2 mm out.
      const ring = (j: number, g: number) =>
        at(
          (FACE[1] - g) * sgn(Math.cos((j * TAU) / 32)),
          FACE[0] + (FACE[2] - g) * sgn(Math.sin((j * TAU) / 32)),
          0.001,
        );
      for (let i = 0; i < 32; i++) {
        const [a, b, c, d] = [
          ring(i, 0.002),
          ring(i + 1, 0.002),
          ring(i + 1, 0.0044),
          ring(i, 0.0044),
        ];
        tri(v, a, b, c, rgb);
        tri(v, a, c, d, rgb);
      }
      // The tracks, 0.6 mm wide and dim, each run ending in a pad 1.4 mm square, mirrored.
      const dim = rgb.map(c => c * 0.35);
      const quad = (o: number[], q: number[], w: number, c: number[]) => {
        const l = Math.hypot(q[0] - o[0], q[1] - o[1]) || 1;
        const [ux, uy] = [((q[0] - o[0]) / l) * w, ((q[1] - o[1]) / l) * w];
        const p = (x: number, y: number) => at(x, SM + y, 0.0008);
        const [a, b, c2, d] = [
          p(o[0] - ux + uy, o[1] - uy - ux),
          p(q[0] + ux + uy, q[1] + uy - ux),
          p(q[0] + ux - uy, q[1] + uy + ux),
          p(o[0] - ux - uy, o[1] - uy + ux),
        ];
        tri(v, a, b, c2, c);
        tri(v, a, c2, d, c);
      };
      for (const s of [-1, 1]) {
        for (const t of TRACKS) {
          const m = t.map(([x, y]) => [s * x, y]);
          m.slice(1).forEach((q, i) => quad(m[i], q, 0.0003, dim));
          const e = m[m.length - 1];
          quad(
            e,
            [e[0] + 1e-6, e[1]],
            0.0007,
            rgb.map(c => c * 0.6),
          );
        }
      }
    }
    lit(v, from, 1);
    readouts.set(key, out);
  }
  return out;
};

const lcds = new Map<number, number[]>();
/**
 * The LCD on the rail gun: the middle of its screen, its half width and height, and the way it faces
 * (the user, 2026-11-08: square to the receiver's left flank, standing out of it like a camera's
 * screen opened out, facing back to the eye, a little up), with its right and up across that.
 */
const LCD: Vec3 = [-0.054, 0.104, -0.012];
const [LW, LH] = [0.019, 0.013];
const LN = unit([0, 0.25, 1]);
const LR = unit([LN[2], 0, -LN[0]]);
const LU: Vec3 = [LN[1] * LR[2], LN[2] * LR[0] - LN[0] * LR[2], -LN[1] * LR[0]];

/**
 * The rail gun's counter, a small LCD out of the left of its receiver turned to the player, in model space
 * (the user, 2026-11-08: like the screen on the back of a digital camera), in a dark case: neon like
 * the others' (the user, 2026-11-08), two glowing violet digits on a dark screen framed in a line of
 * their colour, red at 5 or less. It counts as the HUD does (charge()): a full capsule is 33.
 */
export const lcd = (ammo: number): number[] => {
  const n = Math.min(Math.max(Math.floor(ammo), 0), 99);
  let v = lcds.get(n);
  if (!v) {
    const out: number[] = (v = []);
    /** A point on the screen, `a` right and `b` up from its middle, `d` out of it. */
    const p = (a: number, b: number, d = 0): Vec3 =>
      [0, 1, 2].map(i => LCD[i] + LR[i] * a + LU[i] * b + LN[i] * d) as Vec3;
    const quad = (a0: number, b0: number, a1: number, b1: number, d: number, rgb: number[]) => {
      tri(out, p(a0, b0, d), p(a1, b0, d), p(a1, b1, d), rgb);
      tri(out, p(a0, b0, d), p(a1, b1, d), p(a0, b1, d), rgb);
    };
    /** A dark box across the screen's plane, from `d0` behind to `d1` in front. */
    const box = (a0: number, b0: number, a1: number, b1: number, d0: number, d1: number) => {
      quad(a0, b0, a1, b1, d1, DARK);
      quad(a1, b0, a0, b1, d0, DARK);
      for (const [x0, y0, x1, y1] of [
        [a0, b1, a0, b0],
        [a1, b0, a1, b1],
        [a0, b0, a1, b0],
        [a1, b1, a0, b1],
      ]) {
        tri(out, p(x0, y0, d0), p(x1, y1, d0), p(x1, y1, d1), DARK);
        tri(out, p(x0, y0, d0), p(x1, y1, d1), p(x0, y0, d1), DARK);
      }
    };
    box(-LW - 0.003, -LH - 0.003, LW + 0.003, LH + 0.003, -0.016, 0.0004);
    quad(-LW, -LH, LW, LH, 0.0008, DARK);
    const from = out.length;
    // Red under a sixth of a capsule (33 full): the HUD's count.
    const rgb = n > 5 ? [0.7, 0.45, 1.1] : [1.2, 0.3, 0.12];
    // The frame, a band just inside the screen's edge.
    const f = 0.0012;
    quad(-LW, -LH, LW, f - LH, 0.0014, rgb);
    quad(-LW, LH - f, LW, LH, 0.0014, rgb);
    quad(-LW, f - LH, f - LW, LH - f, 0.0014, rgb);
    quad(LW - f, f - LH, LW, LH - f, 0.0014, rgb);
    // The digits, scaled from the pistol's: 1.6 cm tall.
    const k = (2 * LH * 0.6) / DH;
    [...`${n}`.padStart(2, '0')].forEach((ch, i) => {
      const a0 = -(DW + DGAP / 2) * k + i * (DW + DGAP) * k;
      for (const seg of DIGITS[+ch]) {
        const [x0, y0, x1, y1] = SEGMENTS[seg];
        quad(a0 + x0 * k, (y0 - DH / 2) * k, a0 + x1 * k, (y1 - DH / 2) * k, 0.0014, rgb);
      }
    });
    lit(out, from, 1);
    lcds.set(n, out);
  }
  return v;
};

const scopes = new Map<number, number[]>();
/**
 * The counter's screen fills the housing's sloping back above the body (the user, 2026-11-09), but
 * for 1.3 mm of metal round it: its foot and top heights, its middle, its up, the way it faces; half
 * its height up the face, half its width at the foot and at the top (the face's, under its rounded top).
 */
const [S0, S1] = [0.099, 0.1325];
const SC: Vec3 = [
  0,
  (S0 + S1) / 2,
  -(HOUSING_BACK + HOUSING_SLOPE * ((S0 + S1) / 2 - HOUSING_FOOT)),
];
const SU = unit([0, 1, -HOUSING_SLOPE]);
const SN: Vec3 = [0, -SU[2], SU[1]];
const [SH, SB, ST] = [(S1 - S0) / 2 / SU[1], 0.019, 0.0145];
/** The digits on it: width, height, thickness of a segment, gap between the two; well inside the ring (the user, 2026-11-09). */
const [RW, RH, RT, RGAP] = [0.0075, 0.0155, 0.0022, 0.0025];
const RSEG = segments(RW, RH, RT);
/** The grenade pips under the digits: their side, the step between two, their middle up the screen; orange when loaded, dim once spent. */
const [PIP, PIP_GAP, PIP_AT] = [0.0034, 0.0062, -0.0128];
const [PIP_ON, PIP_OFF] = [
  [1.3, 0.55, 0.08],
  [0.22, 0.09, 0.03],
];

/**
 * The laser rifle's counter (`n` rounds in its cell), in model space: a trapezoid screen, narrow at
 * the top, set in the sloped back of the housing and turned to the eye, ringed in a line of the
 * digits' colour (cyan, red at 7 or fewer), with the two digits once `shown`; under them, when
 * `nades` is given, NADE_MAX orange pips for the launcher's grenades, dim for the spent ones (the
 * user, 2026-11-10). All glow but the dark screen.
 */
export const scope = (n: number, shown = true, nades?: number): number[] => {
  n = Math.min(Math.max(Math.floor(n), 0), 99);
  const g = nades === undefined ? -1 : Math.min(Math.max(Math.floor(nades), 0), NADE_MAX);
  const key = (n * 2 + +shown) * (NADE_MAX + 2) + g + 1;
  let v = scopes.get(key);
  if (!v) {
    const out: number[] = (v = []);
    /** A point `a` right of the middle, `b` up the screen, `d` out of it. */
    const p = (a: number, b: number, d: number): Vec3 =>
      [0, 1, 2].map(i => SC[i] + (i ? 0 : a) + SU[i] * b + SN[i] * d) as Vec3;
    /** Half the width at `b` up the screen, `k` times it. */
    const half = (b: number, k = 1) => k * (SB + ((ST - SB) * (b + SH)) / (2 * SH));
    const quad = (a0: number, b0: number, a1: number, b1: number, d: number, rgb: number[]) => {
      tri(out, p(a0, b0, d), p(a1, b0, d), p(a1, b1, d), rgb);
      tri(out, p(a0, b0, d), p(a1, b1, d), p(a0, b1, d), rgb);
    };
    // The dark screen, its corners on the trapezoid.
    const [h, t] = [half(-SH), half(SH)];
    tri(out, p(-h, -SH, 0.004), p(h, -SH, 0.004), p(t, SH, 0.004), DARK);
    tri(out, p(-h, -SH, 0.004), p(t, SH, 0.004), p(-t, SH, 0.004), DARK);
    const from = out.length;
    const rgb = n > 7 ? [0.25, 0.75, 1.05] : [1.2, 0.3, 0.12];
    // The ring: each side a thin band.
    const ring = 0.0014;
    for (const s of [-1, 1]) {
      const [x0, x1] = [s * half(-SH), s * half(SH)];
      tri(
        out,
        p(x0, -SH, 0.0045),
        p(x0 - s * ring, -SH, 0.0045),
        p(x1 - s * ring, SH, 0.0045),
        rgb,
      );
      tri(out, p(x0, -SH, 0.0045), p(x1 - s * ring, SH, 0.0045), p(x1, SH, 0.0045), rgb);
      quad(
        -half(s * SH),
        s * SH - (s > 0 ? ring : 0),
        half(s * SH),
        s * SH + (s < 0 ? ring : 0),
        0.0045,
        rgb,
      );
    }
    if (shown) {
      // Two digits in the middle of the screen, well clear of its ring.
      [...`${n}`.padStart(2, '0')].forEach((ch, i) => {
        const a0 = -RW - RGAP / 2 + i * (RW + RGAP);
        for (const seg of DIGITS[+ch]) {
          const [x0, y0, x1, y1] = RSEG[seg];
          quad(a0 + x0, y0 - RH / 2, a0 + x1, y1 - RH / 2, 0.005, rgb);
        }
      });
      // The grenades: a row of square pips between the digits and the ring's foot.
      for (let j = 0; j < (g < 0 ? 0 : NADE_MAX); j++) {
        const a = (j - (NADE_MAX - 1) / 2) * PIP_GAP;
        const c = j < g ? PIP_ON : PIP_OFF;
        quad(a - PIP / 2, PIP_AT - PIP / 2, a + PIP / 2, PIP_AT + PIP / 2, 0.005, c);
      }
    }
    lit(out, from, 1);
    scopes.set(key, out);
  }
  return v;
};

/** A puff of smoke, built once: a ball of radius 1, light grey smoke (layer -3: see-through, soft where seen edge-on), its opacity in green. */
const PUFF: number[] = [];
tube(
  PUFF,
  [
    [-1, 0, 0, 0],
    [-0.7, 0, 0.71, 0.71],
    [0, 0, 1, 1],
    [0.7, 0, 0.71, 0.71],
    [1, 0, 0, 0],
  ],
  8,
  () => [0.3, 0.95, -3, 0.32],
);
/**
 * The smoke off the overheated rail gun (the user, 2026-11-09) at the time `t`, for the gun whose
 * grip is at `at`, turned by `ax` and `k` times its size: SMOKE puffs, each born small and thick on
 * the coils, rising 30 cm straight up and drifting aside as it swells and thins away over 1.4 s, one
 * after another.
 */
const SMOKE = 12;
const WORLD: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
export const smoke = (out: Out, at: Vec3, [r, u, f]: Vec3[], k: number, t: number) => {
  for (let i = 0; i < SMOKE; i++) {
    const p = (t * 0.7 + i / SMOKE) % 1;
    const g = 0.3 + 0.12 * ((i * 0.618) % 1);
    const m: Vec3 = [0, axisY(g) + 0.02, -g];
    const side = Math.sin(i * 2.4) * 0.07 * p;
    const c = [0, 1, 2].map(
      j => at[j] + k * (r[j] * (m[0] + side) + u[j] * m[1] - f[j] * m[2]) + (j == 1 ? 0.3 * p : 0),
    ) as Vec3;
    place(out, PUFF, c, WORLD, [0, 0, 0], k * (0.015 + 0.07 * p), [1, (1 - p) ** 1.2, 1]);
  }
};
