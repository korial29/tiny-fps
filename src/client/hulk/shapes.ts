import type { V, Mat } from './types';
import { sub, cross, unit, mid, off, QUAD, face, loft } from './common';

// Small solids the cabin is furnished with.

/** A tube from a to b, w across: three sides and no ends, enough at arm's length. */
export const rod = (a: V, b: V, w: number, m: Mat) => {
  const d = unit(sub(b, a));
  const s = unit(cross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const u = cross(s, d);
  const r = 0.58 * w;
  const tri = [0, 1, 2, 0].map(i =>
    off(off([0, 0, 0], s, r * Math.cos(2.0944 * i)), u, r * Math.sin(2.0944 * i)),
  );
  loft(
    tri.map(t => off(a, t)),
    tri.map(t => off(b, t)),
    () => m,
    mid(a, b),
  );
};

/** A box in the frame of `o` and its axes `ax`, from `lo` to `hi` along them: its faces less those of `skip` (bits as box()'s: 4 the bottom), the top (+ax[1]) in `top`. */
export const cube = (o: V, ax: V[], lo: V, hi: V, m: Mat, top = m, skip = 0) => {
  const at = (t: V) => off(off(off(o, ax[0], t[0]), ax[1], t[1]), ax[2], t[2]);
  const c = at(mid(lo, hi));
  for (let i = 0; i < 6; i++) {
    if ((skip >> i) & 1) {
      continue;
    }
    const [e, p, q] = [i >> 1, ((i >> 1) + 1) % 3, ((i >> 1) + 2) % 3];
    face(
      QUAD.map(k => {
        const t = [0, 0, 0];
        [t[e], t[p], t[q]] = [(i & 1 ? hi : lo)[e], (k & 1 ? hi : lo)[p], (k & 2 ? hi : lo)[q]];
        return at(t);
      }),
      i == 3 ? top : m,
      c,
    );
  }
};

/**
 * A slab in the frame of `o` and its axes `ax`, from `lo` to `hi` along them: its section across
 * ax[0] and ax[1] a rectangle whose corners are rounded (radius r, or one each: the bottom's back
 * and front, the top's front and back), `seg` steps a corner, run along ax[2] and capped at both
 * ends unless `open`, the one at lo[2] in `rear`. Its flat top in `top`.
 */
export const slab = (
  o: V,
  ax: V[],
  lo: V,
  hi: V,
  r: number | number[],
  m: Mat,
  top = m,
  seg = 2,
  open = false,
  rear = m,
) => {
  const pr = rounded(lo, hi, r, seg);
  const at = (u: number, v: number, w: number) => off(off(off(o, ax[0], u), ax[1], v), ax[2], w);
  const c = at((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
  const ring = (w: number) => pr.map(([u, v]) => at(u, v, w));
  const [a, b] = [ring(lo[2]), ring(hi[2])];
  loft(
    [...a, a[0]],
    [...b, b[0]],
    j => {
      const [p, q] = [pr[j], pr[(j + 1) % pr.length]];
      return hi[1] - p[1] < 1e-6 && hi[1] - q[1] < 1e-6 ? top : m;
    },
    c,
  );
  if (!open) {
    face(a, rear, c);
    face(b, m, c);
  }
};

/** A flat plate in the frame of `o` and `ax`, across ax[0] and ax[1] from lo to hi, its corners rounded as slab()'s, facing +ax[2]. */
export const plate = (o: V, ax: V[], lo: V, hi: V, r: number | number[], m: Mat, seg = 2) => {
  const at = (u: number, v: number) => off(off(o, ax[0], u), ax[1], v);
  face(
    rounded(lo, hi, r, seg).map(([u, v]) => at(u, v)),
    m,
    off(at((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2), ax[2], -1),
  );
};

/** A rectangle lo to hi (their first two coordinates) with its corners rounded: the loop round it. */
const rounded = (lo: V, hi: V, r: number | number[], seg: number) => {
  const rs = typeof r == 'number' ? [r, r, r, r] : r;
  const lim = Math.min(hi[0] - lo[0], hi[1] - lo[1]) / 2;
  const pr: number[][] = [];
  [
    [lo[0], lo[1], 1, 1, Math.PI],
    [hi[0], lo[1], -1, 1, 1.5 * Math.PI],
    [hi[0], hi[1], -1, -1, 0],
    [lo[0], hi[1], 1, -1, 0.5 * Math.PI],
  ].forEach(([u, v, su, sv, t0], i) => {
    const k = Math.min(rs[i], lim);
    const [cu, cv] = [u + su * k, v + sv * k];
    for (let s = 0; s <= (k > 0 ? seg : 0); s++) {
      const t = t0 + (s / seg) * Math.PI * 0.5;
      pr.push([cu + k * Math.cos(t), cv + k * Math.sin(t)]);
    }
  });
  return pr;
};

/** The axes `ax` turned by `t` round the unit axis `a` (Rodrigues). */
export const turn = (ax: V[], a: V, t: number) =>
  ax.map(v => {
    const [c, s] = [Math.cos(t), Math.sin(t)];
    const k = (1 - c) * (a[0] * v[0] + a[1] * v[1] + a[2] * v[2]);
    const x = cross(a, v);
    return [0, 1, 2].map(i => v[i] * c + x[i] * s + a[i] * k);
  });
