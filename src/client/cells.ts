// The map's static vertices cut into runs for culling: each pass draws only the runs whose bounds
// reach into its frustum. The runs keep the triangles' order, so the depth ties between coplanar
// faces resolve as before, and a triangle outside a frustum gives no pixel there: what is drawn is
// the same to the byte.
import { STRIDE } from './mesh';

/** Metres a run spans at most, unless one of its triangles is bigger. */
export const CELL = 48;
/** Metres added around each run's bounds. */
const MARGIN = 0.01;
/** How much more than the smaller of a run and a big triangle their bounds may span together. */
const SLACK = 1.25;
/** Vertices of hidden runs drawn through rather than starting a new draw: a draw costs more than they do. */
export const GAP = 3000;

/** Runs of whole triangles in buffer order: the first vertex and count of each, and its bounds (min then max). */
export interface Cells {
  n: number;
  first: Int32Array;
  count: Int32Array;
  box: Float32Array;
}

/**
 * Cuts the vertices [0, end) of `v` (STRIDE floats each, positions first) into runs. A triangle joins
 * the run before it while their bounds together span no more than `limit`, or than a little more
 * than the smaller of the two: the halves of a big face stay together, but a ground two kilometres
 * wide does not swallow every small triangle after it.
 */
export const cells = (v: ArrayLike<number>, end: number, limit = CELL): Cells => {
  const tris = Math.floor(end / 3);
  const first = new Int32Array(tris);
  const count = new Int32Array(tris);
  const box = new Float32Array(tris * 6);
  let n = -1;
  // The open run's bounds.
  let [ax, ay, az, bx, by, bz] = [0, 0, 0, 0, 0, 0];
  for (let t = 0; t < tris; t++) {
    let o = t * 3 * STRIDE;
    let [cx, cy, cz] = [v[o], v[o + 1], v[o + 2]];
    let [dx, dy, dz] = [cx, cy, cz];
    for (let k = 1; k < 3; k++) {
      o += STRIDE;
      const [x, y, z] = [v[o], v[o + 1], v[o + 2]];
      cx = Math.min(cx, x);
      cy = Math.min(cy, y);
      cz = Math.min(cz, z);
      dx = Math.max(dx, x);
      dy = Math.max(dy, y);
      dz = Math.max(dz, z);
    }
    if (n >= 0) {
      const [ux, uy, uz] = [Math.min(ax, cx), Math.min(ay, cy), Math.min(az, cz)];
      const [vx, vy, vz] = [Math.max(bx, dx), Math.max(by, dy), Math.max(bz, dz)];
      const span = Math.max(vx - ux, vy - uy, vz - uz);
      const run = Math.max(bx - ax, by - ay, bz - az);
      const tri = Math.max(dx - cx, dy - cy, dz - cz);
      if (span <= Math.max(limit, SLACK * Math.min(run, tri))) {
        [ax, ay, az, bx, by, bz] = [ux, uy, uz, vx, vy, vz];
        count[n] += 3;
        box.set([ax, ay, az, bx, by, bz], n * 6);
        continue;
      }
    }
    n++;
    [ax, ay, az, bx, by, bz] = [cx, cy, cz, dx, dy, dz];
    first[n] = t * 3;
    count[n] = 3;
    box.set([ax, ay, az, bx, by, bz], n * 6);
  }
  n++;
  // A centimetre around each run: a face lying on a frustum's plane still counts as in it, whatever
  // the floats' rounding on either side.
  for (let i = 0; i < n * 6; i++) {
    box[i] += i % 6 < 3 ? -MARGIN : MARGIN;
  }
  return { n, first: first.slice(0, n), count: count.slice(0, n), box: box.slice(0, n * 6) };
};

/** The six planes of a column-major view-projection `m` (WebGL's clip volume), 4 floats each, inside positive. */
const planes = new Float32Array(24);

/**
 * Puts in `out` the draws (first vertex, count) that cover the runs of `c` reaching into the
 * frustum of `m`, hidden runs of up to `gap` vertices between two seen ones drawn through. Returns
 * the number of draws. With `eye`, only the runs whose bounds come within `reach` metres of it
 * (Landfall's undergrowth, Decor.grass), or with `beyond` only the
 * others (its far palms), none past `limit`.
 */
export const seen = (
  c: Cells,
  m: Float32Array,
  out: Int32Array,
  gap = GAP,
  eye?: ArrayLike<number>,
  reach = 0,
  beyond = false,
  limit = Infinity,
): number => {
  for (let i = 0; i < 3; i++) {
    for (let s = 0; s < 2; s++) {
      const p = (i * 2 + s) * 4;
      const k = s ? -1 : 1;
      for (let j = 0; j < 4; j++) {
        planes[p + j] = m[j * 4 + 3] + k * m[j * 4 + i];
      }
    }
  }
  let draws = 0;
  // The open draw's end, -1 when none.
  let end = -1;
  for (let r = 0; r < c.n; r++) {
    const b = r * 6;
    if (eye) {
      // The nearest point of the run's bounds to the eye, and how far.
      let d2 = 0;
      for (let k = 0; k < 3; k++) {
        const e = eye[k];
        const t = Math.max(c.box[b + k] - e, 0, e - c.box[b + 3 + k]);
        d2 += t * t;
      }
      // `beyond`: the runs the same test leaves out, and only those.
      if (d2 > reach * reach != beyond || d2 > limit * limit) {
        continue;
      }
    }
    let inside = true;
    for (let p = 0; p < 24 && inside; p += 4) {
      const x = planes[p];
      const y = planes[p + 1];
      const z = planes[p + 2];
      // The box's corner furthest along the plane's normal.
      const d =
        x * c.box[b + (x > 0 ? 3 : 0)] +
        y * c.box[b + (y > 0 ? 4 : 1)] +
        z * c.box[b + (z > 0 ? 5 : 2)] +
        planes[p + 3];
      inside = d >= 0;
    }
    if (!inside) {
      continue;
    }
    const f = c.first[r];
    if (end >= 0 && f - end <= gap) {
      end = f + c.count[r];
      out[draws * 2 - 1] = end - out[draws * 2 - 2];
    } else {
      out[draws * 2] = f;
      end = f + c.count[r];
      out[draws * 2 + 1] = c.count[r];
      draws++;
    }
  }
  return draws;
};
