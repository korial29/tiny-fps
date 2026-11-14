// A runner's skin and armour posed by the vertex shader (docs/PERFORMANCE.md, step 3): their data
// goes to the GPU once (store.ts's `data`), and a frame sends only the joints, the palette and the
// face's weights. The same sums as skin() and armor(), which stay the CPU's way (the tests, the own
// body, a runner coming apart).
import { CHANNELS, TRAITS } from './features';
import { CORNER, TRI, wornOf } from './armor';
import { COLOURS, duals, mouthed, skin } from './skin';
import { dress, dressedOf } from './mask';
import { JOINT as J, rest, solve } from './rig';
import { STRIDE } from './mesh';
import { Verts } from './verts';
import type { Skin } from './skin';
import { ORIGIN, ID, texels } from './store';
import type { Pieces } from './store';
import type { Quat } from './rig';
import type { Vec3 } from './mesh';

/** Texels a skin vertex takes (then its face's records, two each), a corner, an armour vertex. */
export const [VERT, CORN, PLATE] = [4, 1, 7];

/** Where a skin's corners are in `data`, and its vertices: plain, and hooded by the traits of a face (a ninja's). */
const corners = new WeakMap<Skin, number>();
const skins = new WeakMap<Skin, Map<string, number>>();

/**
 * The vertices of the skin `s` in `data`: at rest at `v` (place and normal, six numbers each). A
 * vertex: its place and its weight, its normal and its shade, its two joints and where its face's
 * records start and how many (each: a channel's shift of its place and of its normal), and the hood's
 * bare share over it (-1: no hood) and whether it is on the head or the neck. `keep` says which of
 * its face's channels it takes.
 */
const pack = (
  s: Skin,
  v: ArrayLike<number>,
  keep: (k: number, ch: number) => boolean,
  bare?: Float64Array,
) => {
  const n = s.w.length;
  const recs: number[][] = Array.from({ length: n }, () => []);
  s.m.forEach(({ i }, ch) => i.forEach((k, r) => keep(k, ch) && recs[k].push(ch, r)));
  const out = new Float32Array(n * VERT * 4 + recs.reduce((a, r) => a + r.length * 4, 0));
  let w = n * VERT * 4;
  for (let k = 0; k < n; k++) {
    const [o, q, a, b] = [k * VERT * 4, k * 6, s.j[k * 2], s.j[k * 2 + 1]];
    out.set([v[q], v[q + 1], v[q + 2], s.w[k], v[q + 3], v[q + 4], v[q + 5], s.o[k]], o);
    out.set(
      [
        a,
        b,
        w / 4,
        recs[k].length / 2,
        bare?.[k] ?? -1,
        +[a, b].some(j => j == J.HEAD || j == J.NECK),
      ],
      o + 8,
    );
    for (let e = 0; e < recs[k].length; e += 2) {
      const [ch, r] = [recs[k][e], recs[k][e + 1] * 6];
      const d = s.m[ch].d;
      out.set([d[r], d[r + 1], d[r + 2], ch, d[r + 3], d[r + 4], d[r + 5], 0], w);
      w += 8;
    }
  }
  return texels(out);
};

/**
 * Where the skin `s` is in `data`, made once: its vertices and its corners (a corner: its vertex, its
 * colour, the colour it fades to and how far). With `hood`, the ninja's (build and face): dress() at
 * rest on the skin his face's traits have shaped, its pressed places taken as the rest's, and only
 * the face's expressions left for the shader, none under the guard (hidden there, and the jaw would
 * push the face through it).
 */
export const skinOf = (s: Skin, hood?: [number, ArrayLike<number>]): [number, number] => {
  let cs = corners.get(s);
  if (cs === undefined) {
    const c = new Float32Array(s.t.length * 4);
    for (let h = 0; h < s.t.length; h++) {
      c.set([s.t[h], s.c[h], s.c2[h], s.cm[h]], h * 4);
    }
    corners.set(s, (cs = texels(c)));
  }
  const traits = hood ? Array.from(hood[1]).slice(TRAITS, CHANNELS) : [];
  const key = hood ? `${hood[0]} ${traits}` : '';
  const book = skins.get(s) ?? new Map<string, number>();
  skins.set(s, book);
  let vs = book.get(key);
  if (vs === undefined) {
    if (hood) {
      const n = s.w.length;
      const face = new Float32Array(CHANNELS);
      face.set(traits, TRAITS);
      const at = solve(rest([0, 0, 0], 0, hood[0]));
      // Into a Verts, as in a frame: a plain array through skin() would slow it for good (V8).
      const v = new Verts();
      skin(
        v,
        s,
        at,
        Array.from({ length: COLOURS }, () => [1, 1, 1]),
        face,
      );
      dress(v, 0, s, at.pos[J.HEAD], at.rot[J.HEAD], hood[0]);
      const [bare, press] = dressedOf(n);
      const rested = Float32Array.from(s.v);
      for (let h = s.t.length - 1; h >= 0; h--) {
        rested.set(v.a.subarray(h * STRIDE, h * STRIDE + 6), s.t[h] * 6);
      }
      vs = pack(s, rested, (k, ch) => ch < TRAITS && press[k * 3] !== press[k * 3], bare);
    } else {
      vs = pack(s, s.v, () => true);
    }
    book.set(key, vs);
  }
  return [vs, cs];
};

/** Where an armour is in `data` and its vertices, by skin, fineness and wearer. */
const worn = new WeakMap<Skin, Map<string, [number, number]>>();

/**
 * The armour armor() cuts out of the skin `s`, made once into `data`, its vertices of PLATE texels:
 * [its skin triangle, its corner in its triangle, the triangle's kind, its layer], each corner's
 * [weights, distance off the skin], its own swell slope and whether it is a scratch, its normal at
 * rest, its colour. Each vertex carries its triangle's corners: a wall's normal is the triangle's.
 */
export const armourOf = (
  s: Skin,
  fine: boolean,
  ninja: boolean,
  astro: boolean,
  bare: boolean,
): [number, number] => {
  const key = `${+fine} ${+ninja} ${+astro} ${+bare}`;
  const book = worn.get(s) ?? new Map<string, [number, number]>();
  worn.set(s, book);
  let at = book.get(key);
  if (!at) {
    const [{ c, t }, list] = wornOf(s, fine, ninja, astro, bare);
    const v = new Float32Array(list.length * 3 * PLATE * 4);
    list.forEach((i, n) => {
      const ci = (i / TRI) * 3 * CORNER;
      for (let j = 0; j < 3; j++) {
        const o = (n * 3 + j) * PLATE * 4;
        const cj = ci + j * CORNER;
        v.set([c[ci], j, t[i + 4], t[i + 3]], o);
        for (let e = 0; e < 3; e++) {
          v.set(c.slice(ci + e * CORNER + 1, ci + e * CORNER + 5), o + 4 + e * 4);
        }
        v.set([c[cj + 5], c[cj + 6], c[cj + 7], +(t[i + 5] < 0)], o + 16);
        v.set([c[cj + 8], c[cj + 9], c[cj + 10], 0], o + 20);
        v.set([t[i], t[i + 1], t[i + 2], 0], o + 24);
      }
    });
    book.set(key, (at = [texels(v), list.length * 3]));
  }
  return at;
};

/**
 * Draws the skin `s` in the pose `pose` and, with `armour`, the armour cut out of it, posed by the
 * shader: into `list`, as skin(), dress() (`hood`: the ninja's build) and armor() would into the
 * frame's vertices.
 */
export const flesh = (
  list: Pieces,
  s: Skin,
  pose: { pos: Vec3[]; rot: Quat[] },
  colors: number[][],
  face: ArrayLike<number> | undefined,
  armour?: { fine: boolean; plate?: number[]; accent: number[]; ninja?: boolean; bare?: boolean },
  hood?: number,
) => {
  const [vs, cs] = skinOf(s, hood !== undefined && face ? [hood, face] : undefined);
  const d = Float32Array.from(duals(s, pose));
  const pal = Float32Array.from(mouthed(colors, face).flat());
  const w = new Float32Array(Math.ceil(CHANNELS / 4) * 4);
  w.set(face && s.m.length ? Array.from(face).slice(0, CHANNELS) : []);
  const go = (kind: number, at: number, count: number, a?: typeof armour) =>
    list.push({
      m: { first: 0, count },
      q: ID,
      t: ORIGIN,
      k: 1,
      f: { kind, at: [vs, at, cs], d, pal, face: w, plate: a?.plate, accent: a?.accent },
    });
  go(1, cs, s.t.length);
  if (armour) {
    const { fine, plate, ninja = false, bare = false } = armour;
    const [at, n] = armourOf(s, fine, ninja, !plate && !ninja, bare);
    go(2, at, n, armour);
  }
};
