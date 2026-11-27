// The rover's building blocks: panels, lofts and tubes in the body's frame.
import { tri } from '../flag';
import { STRIDE, add, dot, dress, mix, segment, smooth, sub } from '../mesh';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';

/** A point of the body's frame: metres right, up and ahead of the centre. */
export const P = (x: number, y: number, a: number): Vec3 => [x, y, -a];

/** A flat polygon of three or four corners facing `to`; a fourth number of the colour is its layer. */
export const panel = (o: number[], [a, b, c, d]: Vec3[], rgb: number[], to: Vec3) => {
  const [u, v] = [sub(b, a), sub(c, a)];
  const back =
    dot([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], to) < 0;
  const from = o.length;
  tri(o, a, back ? c : b, back ? b : c, rgb);
  if (d) {
    tri(o, a, back ? d : c, back ? c : d, rgb);
  }
  for (let i = from + 8; rgb[3] && i < o.length; i += STRIDE) {
    o[i] = rgb[3];
  }
};

/** A skin between two rings of as many corners, each side (in `cols`, in the rings' order) facing away from the middle, and a cap on either ring. */
export const loft = (
  o: number[],
  a: Vec3[],
  b: Vec3[],
  cols: number[][],
  capA?: number[],
  capB?: number[],
) => {
  const all = [...a, ...b];
  const mid = all.reduce(add).map(v => v / all.length) as Vec3;
  const face = (p: Vec3[], rgb: number[]) => panel(o, p, rgb, sub(mix(p[0], p[2], 0.5), mid));
  a.forEach((p, i) => {
    const j = (i + 1) % a.length;
    face([p, a[j], b[j], b[i]], cols[i % cols.length]);
  });
  if (capA) {
    face(a, capA);
  }
  if (capB) {
    face(b, capB);
  }
};

/** A section across the body `a` ahead: its top (half width, height) and its bottom, as top left, top right, bottom right, bottom left. */
export const section = (a: number, wt: number, yt: number, wb: number, yb: number): Vec3[] => [
  P(-wt, yt, a),
  P(wt, yt, a),
  P(wb, yb, a),
  P(-wb, yb, a),
];

/** A unit tube along -z, open at both ends, white: stretched between two points by segment(). */
const pipe = (sides: number) =>
  dress(
    smooth(
      [
        [1, 0],
        [1, 1],
      ],
      sides,
    ),
    [1, 1, 1],
  );
/** A thin tube has three sides, a thick one four near by. */
export const LINK = pipe(3);
export const TUBE = pipe(4);

/** A tube from a to b, r thick. */
export const rod = (o: Out, tube: number[], a: Vec3, b: Vec3, r: number, rgb: number[]) => {
  const d = sub(b, a);
  segment(o, tube, a, b, Math.abs(d[1]) > Math.abs(d[0]) ? [1, 0, 0] : [0, 1, 0], 1, r, rgb);
};
