// The moon base's drawing helpers (docs/MOON.md): quads, panels and blocks indoors, doorway frames, linings.
import { STRIDE } from '../mesh';
import { room } from '../verts';
import type { Brush } from '../../shared/world';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import { INDOORS, LAMP, UV, WHITE } from './constants';

/** A quad indoors: textured, `l` its light (under 2), or glowing in an rgb. */
export const quad = (o: Out, p: Vec3[], c: number | number[], l = 1, [u, v] = UV[1]) => {
  for (const i of [0, 1, 2, 0, 2, 3]) {
    o.push(...p[i], ...INDOORS);
    if (typeof c == 'number') {
      o.push(p[i][u], p[i][v], c, l);
    } else {
      o.push(c[0], c[1], -2, c[2]);
    }
  }
};
/** quad() on the face of the box lo..hi that is flat on the axis k, moved to `at`. */
export const panel = (
  o: Out,
  k: number,
  at: number,
  lo: number[],
  hi: number[],
  c: number | number[],
  l?: number,
) =>
  quad(
    o,
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map(([i, j]) => {
      const v: Vec3 = [0, 0, 0];
      const [p, q] = [(k + 1) % 3, (k + 2) % 3];
      [v[k], v[p], v[q]] = [at, (i ? hi : lo)[p], (j ? hi : lo)[q]];
      return v;
    }),
    c,
    l,
    UV[k],
  );
/** A box indoors, as a brush: its top in the top texture, the rest in the side one, each face lit by where it looks; `tint` twice the palette index of its tint. */
export const block = (o: Out, { min, max, top, side }: Brush, tint = 0) => {
  for (let k = 0; k < 3; k++) {
    panel(o, k, min[k], min, max, side, tint + (k == 1 ? 0.4 : 1.25 - 0.15 * k));
    panel(o, k, max[k], min, max, k == 1 ? top : side, tint + (k == 1 ? 1.85 : 1.25 - 0.15 * k));
  }
};

/**
 * What `make` adds, moved indoors: the indoor normal, and a flat colour shaded by where its face
 * looked, brighter since it takes the ambient only (about what the textured walls get).
 */
export const inside = (o: Out, make: () => void) => {
  const from = o.length;
  make();
  const buf = room(o, 0);
  for (let i = from; i < o.length; i += STRIDE) {
    if (buf[i + 8] == -1) {
      const k = 2.2 * (0.72 + 0.28 * buf[i + 4] - 0.12 * Math.abs(buf[i + 3]));
      buf[i + 6] *= k;
      buf[i + 7] *= k;
      buf[i + 9] *= k;
    }
    [buf[i + 3], buf[i + 4], buf[i + 5]] = INDOORS;
  }
};

/** A lit frame just inside a doorway h high from c0 to c1, in the plane of the axis k at `at`. */
export const frame = (o: Out, k: number, at: number, c0: number, c1: number, h: number) => {
  for (const [a, b, y0] of [
    [c0, c0 + 0.1, 0],
    [c1 - 0.1, c1, 0],
    [c0, c1, h - 0.1],
  ]) {
    // From a to b on x and on z: the panel reads the one across.
    panel(o, k, at, [a, y0, a], [b, h, b], LAMP);
  }
};

/**
 * A white wall indoors in the plane of the axis k at `at`, along the other one from s to t and up
 * to y, `l` its light, open at each door (from, to, height).
 */
export const lining = (
  o: Out,
  k: number,
  at: number,
  s: number,
  t: number,
  y: number,
  l: number,
  doors: number[][] = [],
) => {
  [...doors, [t, t, 0]].forEach(([d0, d1, h], i) => {
    const [lo, hi] = [
      [0, 0, 0],
      [0, y, 0],
    ];
    [lo[2 - k], hi[2 - k]] = [i ? doors[i - 1][1] : s, d0];
    panel(o, k, at, lo, hi, WHITE, l);
    if (d1 > d0) {
      [lo[1], lo[2 - k], hi[2 - k]] = [h, d0, d1];
      panel(o, k, at, lo, hi, WHITE, l);
    }
  });
};
