/** Fixtures shared by the tests of the gun's pieces. */
import { button, gun } from '../gun';
import { STRIDE } from '../mesh';
import type { Vec3 } from '../mesh';
import type { Quat } from '../rig';

export interface Vertex {
  p: Vec3;
  n: Vec3;
  c: number[];
  layer: number;
}
export const verts = (v: number[]): Vertex[] =>
  Array.from({ length: v.length / STRIDE }, (_, i) => {
    const r = v.slice(i * STRIDE, (i + 1) * STRIDE);
    return {
      p: r.slice(0, 3) as Vec3,
      n: r.slice(3, 6) as Vec3,
      c: [r[6], r[7], r[9]],
      layer: r[8],
    };
  });
export const near = verts(gun(1));
export const IDENT: Quat = [0, 0, 0, 1];

/** Weapon `kind`'s button alone, out and lit. */
export const knob = (kind: number) => {
  const out: number[] = [];
  button(out, kind, 0, 1, [1, 1, 1]);
  return out;
};
