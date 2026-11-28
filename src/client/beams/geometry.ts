// The camera-facing shapes the tracer is drawn with: ribbons, discs, the arc's crescent, the spun disc.
import { CUT } from '../../shared/types';
import { discVertices } from '../hunter';
import { STRIDE } from '../mesh';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import { DISC_BANK } from './constants';

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const vert = (out: Out, p: Vec3, [r, g, b]: number[]) =>
  out.push(...p, 0, 1, 0, r, g, -2, b);
/**
 * The armour's disc (discVertices()) at `p` flying along `d`: its face up, banked DISC_BANK toward
 * its right, turned `spin` radians about its face. Lit like the bodies: it is metal, not light.
 */
export const spun = (out: Out, p: Vec3, d: Vec3, spin: number) => {
  const flat = norm([d[0], 0, d[2]]);
  const side = norm(cross(flat, [0, 1, 0]));
  const [cb, sb] = [Math.cos(DISC_BANK), Math.sin(DISC_BANK)];
  const n: Vec3 = [side[0] * sb, cb, side[2] * sb];
  const e = norm(cross(n, side));
  // e, f, n right-handed as the disc's own frame, or its faces would turn inside out.
  const f = cross(n, e);
  const [c, s] = [Math.cos(spin), Math.sin(spin)];
  const x: Vec3 = [0, 1, 2].map(k => e[k] * c + f[k] * s) as Vec3;
  const y: Vec3 = [0, 1, 2].map(k => f[k] * c - e[k] * s) as Vec3;
  const v = discVertices(1);
  for (let i = 0; i < v.length; i += STRIDE) {
    for (const [o, w] of [
      [i, 1],
      [i + 3, 0],
    ]) {
      out.push(...[0, 1, 2].map(k => w * p[k] + v[o] * x[k] + v[o + 1] * y[k] + v[o + 2] * n[k]));
    }
    out.push(...v.slice(i + 6, i + STRIDE));
  }
};
/**
 * What glows is drawn at its size times this: beyond 5 m it grows with the distance (at most 2.5
 * times), so that it stays a few pixels; nearer it may shrink down to `lo`, so that a ball or a
 * flash at the own muzzle does not fill the view.
 */
export const far = (eye: Vec3, c: Vec3, lo: number) =>
  Math.min(Math.max(Math.hypot(...sub(eye, c)) / 5, lo), 2.5);

/**
 * A flat ribbon along a to b, of half width w at a and wb at b, its width turned across the view
 * from eye and lifted toward it by `lift`.
 */
export const ribbon = (
  out: Out,
  a: Vec3,
  b: Vec3,
  w: number,
  rgb: number[],
  eye: Vec3,
  lift: number,
  wb = w,
  lo = 1,
) => {
  const d = sub(b, a);
  let s = cross(d, sub(a, eye));
  if (Math.hypot(...s) < 1e-6 * Math.hypot(...d)) {
    s = cross(d, [0, 1, 0]);
  }
  s = norm(s);
  const [p, q, r, t] = [
    [a, w],
    [a, -w],
    [b, -wb],
    [b, wb],
  ].map(([c, k]) => {
    const to = norm(sub(eye, c as Vec3));
    const wide = (k as number) * far(eye, c as Vec3, lo);
    return (c as Vec3).map((v, i) => v + s[i] * wide + to[i] * lift) as Vec3;
  });
  for (const v of [p, q, r, p, r, t]) {
    vert(out, v, rgb);
  }
};

/** A disc of radius r round c facing the eye, lifted toward it, as a fan of n triangles. */
export const disc = (
  out: Out,
  c: Vec3,
  r: number,
  rgb: number[],
  eye: Vec3,
  lift = 0,
  n = 8,
  lo = 0.1,
) => {
  const to = sub(c, eye);
  const s = norm(cross(to, [0, 1, 0]));
  const u = norm(cross(s, to));
  const k = r * far(eye, c, lo);
  const l = norm(to).map((v, i) => c[i] - v * lift) as Vec3;
  const rim = (i: number): Vec3 => {
    const [x, y] = [Math.cos((i * 2 * Math.PI) / n) * k, Math.sin((i * 2 * Math.PI) / n) * k];
    return [0, 1, 2].map(j => l[j] + s[j] * x + u[j] * y) as Vec3;
  };
  for (let i = 0; i < n; i++) {
    for (const v of [l, rim(i), rim(i + 1)]) {
      vert(out, v, rgb);
    }
  }
};

/** The arc of energy's crescent: its half span (m), the radians it bends round, its tilt off level, and its glow and core. */
export const [CRESCENT, BOW, TILT] = [0.8, 1.2, 0.6];
export const WAVE: [number, number[]][] = [
  [0.1, [0.15, 0.7, 1.6]],
  [0.035, [1.4, 2.6, 3]],
];

/**
 * An arc of energy at `c` flying along `d`, thrown by the cut `cut`: a crescent across its flight,
 * tilted the way the blade came down (from the top left for ARC_L), bowed out the way the blade
 * went and its tips bent back, thick in the middle, with a fainter one trailing.
 */
export const crescent = (out: Out, c: Vec3, d: Vec3, cut: number, eye: Vec3) => {
  const r = norm(cross(d, [0, 1, 0]));
  const u = cross(r, d);
  const t = cut == CUT.ARC_L ? -TILT : TILT;
  const ax = r.map((v, i) => v * Math.cos(t) + u[i] * Math.sin(t)) as Vec3;
  // Across the flight and square to the span, toward the bottom of the swing.
  const bow = cross(ax, d).map(v => (cut == CUT.ARC_L ? v : -v)) as Vec3;
  const N = 6;
  for (const [back, k] of [
    [0, 1],
    [0.35, 0.55],
  ]) {
    const at = (j: number): Vec3 => {
      const a = (j / N) * BOW;
      return c.map(
        (v, i) =>
          v +
          (ax[i] * Math.sin(a) - bow[i] * (1 - Math.cos(a)) * 0.6) * CRESCENT * k -
          d[i] * ((1 - Math.cos(a)) * CRESCENT * 0.5 + back),
      ) as Vec3;
    };
    for (let j = -N; j < N; j++) {
      const w = (n: number) => 1 - (Math.abs(n) / N) ** 2 * 0.85;
      WAVE.forEach(([h, rgb], i) =>
        ribbon(
          out,
          at(j),
          at(j + 1),
          h * k * w(j),
          rgb.map(v => v * k),
          eye,
          0.02 * i,
          h * k * w(j + 1),
        ),
      );
    }
  }
};
