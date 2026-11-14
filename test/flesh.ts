// The vertex shader's skin and armour (render.ts's VERT, modes 1 and 2) in JavaScript, for the tests:
// what the GPU draws of a Draw with flesh, from the same texels.
import { GLOSS } from '../src/client/mesh';
import { SCRATCHED } from '../src/client/armor';
import { PLATE, VERT } from '../src/client/flesh';
import { UNLIT } from '../src/client/skin';
import { data } from '../src/client/store';
import type { Draw } from '../src/client/store';

type V3 = [number, number, number];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
const len = (a: number[]) => Math.sqrt(dot(a, a));
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const texel = (i: number) => Array.from(data.subarray(i * 4, i * 4 + 4));

/** k(): the skin's vertex i posed, and its shade. */
const posed = (d: Draw, i: number): [V3, V3, number] => {
  const f = d.f!;
  const b = f.at[0] + i * VERT;
  const [a, e, g] = [texel(b), texel(b + 1), texel(b + 2)];
  let x: V3 = [a[0], a[1], a[2]];
  let y: V3 = [e[0], e[1], e[2]];
  let z = false;
  for (let j = 0; j < g[3]; j++) {
    const q = f.at[0] + g[2] + j * 2;
    const h = texel(q);
    const w = f.face[h[3]];
    if (w) {
      const n = texel(q + 1);
      x = add(x, [h[0], h[1], h[2]], w);
      y = add(y, [n[0], n[1], n[2]], w);
      z = true;
    }
  }
  if (z) {
    y = mul(y, 1 / len(y));
  }
  const [u, v, l] = [g[0] * 8, g[1] * 8, a[3]];
  const Q = (o: number) => Array.from(f.d.subarray(o, o + 4));
  const s = dot(Q(u), Q(v)) < 0 ? -l : l;
  const E = Q(u).map((c, k) => (1 - l) * c + s * Q(v)[k]);
  const F = Q(u + 4).map((c, k) => (1 - l) * c + s * Q(v + 4)[k]);
  const L = len(E);
  const [ex, ew, fx, fw] = [
    mul(E.slice(0, 3) as V3, 1 / L),
    E[3] / L,
    mul(F.slice(0, 3) as V3, 1 / L),
    F[3] / L,
  ];
  const turn = (p: V3, m: V3 | 0) => {
    const t = cross(ex, p);
    const r = add(mul(t, ew), cross(ex, t));
    return add(p, m ? add(r, m) : r, 2);
  };
  const M = add(add(mul(fx, ew), mul(ex, -fw)), cross(fx, ex), -1);
  return [turn(x, M), turn(y, 0), e[3]];
};

/** Appends to `out` the vertices the shader draws of `d`, a Draw with flesh. */
export const pose = (out: number[], d: Draw) => {
  const f = d.f!;
  for (let id = 0; id < d.m.count; id++) {
    if (f.kind == 1) {
      const h = texel(f.at[1] + id);
      const [P, N, sh] = posed(d, h[0]);
      const pal = (c: number) => Array.from(f.pal.subarray(c * 3, c * 3 + 3));
      let l = pal(h[1]);
      l = l.map((c, k) => c + (pal(h[2])[k] - c) * h[3]);
      out.push(...P, ...N, l[0] * sh, l[1] * sh, UNLIT.includes(h[1]) ? -2 : -1, l[2] * sh);
      continue;
    }
    const b = f.at[1] + id * PLATE;
    const [h, G4, R4] = [texel(b), texel(b + 4), texel(b + 5)];
    const [j, K, t] = [h[1], h[2], h[0] * 3];
    const XZ = [0, 1, 2].map(i => posed(d, texel(f.at[2] + t + i)[0]));
    const W3: V3[] = [];
    const M3: V3[] = [];
    for (let i = 0; i < 3; i++) {
      const w = texel(b + 1 + i);
      const m = [w[0] * (K & 2 ? -1 : 1), w[1] * (K & 4 ? -1 : 1), w[2] * (K & 8 ? -1 : 1)];
      let q: V3 = [
        dot([XZ[0][1][0], XZ[1][1][0], XZ[2][1][0]], m),
        dot(
          [XZ[0][1][1], XZ[1][1][1], XZ[2][1][1]],
          m.map(x => Math.max(x, 0)),
        ),
        dot([XZ[0][1][2], XZ[1][1][2], XZ[2][1][2]], m),
      ];
      q = mul(q, 1 / (len(q) || 1));
      const x = [0, 1, 2].map(c =>
        dot([XZ[0][0][c], XZ[1][0][c], XZ[2][0][c]], w.slice(0, 3)),
      ) as V3;
      W3.push(add(x, q, w[3]));
      M3.push(q);
    }
    let q = M3[j];
    if (K & 1) {
      const fl = cross(add(W3[1], W3[0], -1), add(W3[2], W3[0], -1));
      // A wall of no area: drawn, it shows nothing; armor() leaves it out.
      if (len(fl) < 1e-12) {
        continue;
      }
      q = mul(fl, 1 / len(fl));
    } else if (G4[0] || G4[1] || G4[2]) {
      const o = mul(R4.slice(0, 3) as V3, 1 / (len(R4.slice(0, 3)) || 1));
      const e = cross(o, q);
      let s: V3 = [G4[0], G4[1], G4[2]];
      const sn = len(e);
      if (sn > 1e-6) {
        const cs = dot(o, q);
        const u = mul(e, 1 / sn);
        s = add(add(mul(s, cs), cross(u, s), sn), u, dot(u, s) * (1 - cs));
      }
      q = add(q, s, -1);
      q = mul(q, 1 / (len(q) || 1));
    }
    let l = texel(b + 6).slice(0, 3);
    const pl = !!f.plate;
    if (l[0] < 0) {
      l = f.accent!;
    } else if (pl && Math.abs(h[3] - GLOSS) < 0.01) {
      l = f.plate!;
    } else if (pl && K & 1) {
      l = f.plate!.map(c => c * 0.75);
    } else if (pl && G4[3] > 0) {
      l = SCRATCHED[+(l[0] > 0.55)];
    }
    out.push(...W3[j], ...q, l[0], l[1], h[3], l[2]);
  }
  return out;
};
