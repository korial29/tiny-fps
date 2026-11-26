import { GLOSS, STRIDE, WEAVE } from '../mesh';
import type { Skin } from '../skin';
import { room } from '../verts';
import type { Out } from '../verts';
import { CORNER, TRI, TURN } from './types';
import type { Recipe, Shared } from './types';
import { REGIONS } from './regions';
import { SCRATCHED } from './clip';
import { cooking } from './cooking';
import { ASTRO, MARINE, OWN } from './details';

const recipes = [new WeakMap<Skin, Recipe>(), new WeakMap<Skin, Recipe>()];

/** The triangles of the recipe's `t` (their first number's index) that a wearer has: armor()'s rules. */
const wearing = (t: number[], ninja: boolean, astro: boolean, bare: boolean) => {
  const keep: number[] = [];
  for (let i = 0; i < t.length; i += TRI) {
    // The ninja's own armour alone, without scratches, and none of it on another.
    // With `bare`, his belt alone: a map with no armour.
    if (
      ninja != !!REGIONS[t[i + 5]]?.alone ||
      (t[i + 4] & ASTRO && !astro) ||
      (t[i + 4] & MARINE && (astro || ninja)) ||
      (bare && !REGIONS[t[i + 5]]?.belt)
    ) {
      continue;
    }
    keep.push(i);
  }
  return Int32Array.from(keep);
};

/** The recipes under way (preparing()), by skin, not `fine` then `fine`. */
const cooks = [
  new WeakMap<Skin, Generator<undefined, Recipe, undefined>>(),
  new WeakMap<Skin, Generator<undefined, Recipe, undefined>>(),
];

/**
 * Takes the recipe of the armour on `s` a slice further (cooking()): true while there is more to
 * do. A step of the renderer's warm-up (render.ts warmSteps()), a task each.
 */
export const preparing = (s: Skin, fine: boolean): boolean => {
  if (recipes[+fine].has(s)) {
    return false;
  }
  let g = cooks[+fine].get(s);
  if (!g) {
    cooks[+fine].set(s, (g = cooking(s, fine)));
  }
  const n = g.next();
  if (n.done) {
    recipes[+fine].set(s, n.value);
    cooks[+fine].delete(s);
  }
  return !n.done;
};

/** The armour's recipe on the skin `s`, `fine` or not (armor()), made now if it is not yet (the rest of it, if preparing() began it): the close one takes a third of a second. */
export const prepare = (s: Skin, fine: boolean): Recipe => {
  while (preparing(s, fine)) {}
  return recipes[+fine].get(s)!;
};

/**
 * Appends the armour cut out of the skin `s` drawn into `out` from the float `from` on (skin()
 * writes three vertices per triangle of s.t, in order). Not `fine` (a runner not close by), curved
 * outlines follow the skin's own triangles, unrefined, and there are no scratches. `plate` is the
 * plates' colour (their walls a shade darker): white when absent, the astronaut's, who has his own
 * details in his team's colour `accent` too. The `ninja` wears his own armour.
 */
/** The recipe on the skin `s` (`fine` or not) and the triangles of it a wearer has (armor()'s rules): its first numbers' indices. */
export const wornOf = (
  s: Skin,
  fine: boolean,
  ninja: boolean,
  astro: boolean,
  bare: boolean,
): [Recipe, Int32Array] => {
  const r = prepare(s, fine);
  const wearer = +ninja | (+astro << 1) | (+bare << 2);
  return [r, ((r.k ??= [])[wearer] ??= wearing(r.t, ninja, astro, bare))];
};

/** The distinct corners of the triangles `list` of a recipe (Shared). */
const shared = (c: number[], t: number[], list: Int32Array): Shared => {
  const seen = new Map<string, number>();
  const u: number[] = [];
  const x = new Int32Array(list.length * 3);
  for (let n = 0; n < list.length; n++) {
    const i = list[n];
    const turn = t[i + 4] & (TURN * 7);
    for (let j = 0, ci = (i / TRI) * 3 * CORNER; j < 3; j++, ci += CORNER) {
      const key = `${turn} ${c.slice(ci, ci + CORNER)}`;
      let k = seen.get(key);
      if (k === undefined) {
        seen.set(key, (k = u.length / 2));
        u.push(ci, turn);
      }
      x[n * 3 + j] = k;
    }
  }
  const rest = new Float64Array((u.length / 2) * 3);
  for (let k = 0; k < u.length; k += 2) {
    const ci = u[k];
    if (c[ci + 5] || c[ci + 6] || c[ci + 7]) {
      const l = Math.sqrt(c[ci + 8] ** 2 + c[ci + 9] ** 2 + c[ci + 10] ** 2) || 1;
      const o = (k / 2) * 3;
      rest[o] = c[ci + 8] / l;
      rest[o + 1] = c[ci + 9] / l;
      rest[o + 2] = c[ci + 10] / l;
    }
  }
  return { u: Int32Array.from(u), x, rest };
};

/** Each distinct corner's place and normal, six numbers, from frame to frame. */
export let Q = new Float64Array(0);

export const armor = (
  out: Out,
  from: number,
  s: Skin,
  fine = true,
  plate?: number[],
  ninja = false,
  accent = [0.8, 0.8, 0.82],
  bare = false,
) => {
  const astro = !plate && !ninja;
  const [r, list] = wornOf(s, fine, ninja, astro, bare);
  const { c, t } = r;
  const { u, x, rest } = ((r.s ??= [])[+ninja | (+astro << 1) | (+bare << 2)] ??= shared(
    c,
    t,
    list,
  ));
  if (Q.length < u.length * 3) {
    Q = new Float64Array(u.length * 3);
  }
  const P = new Float64Array(9);
  const N = new Float64Array(9);
  let w = out.length;
  const a = room(out, list.length * 3 * STRIDE);
  // Each corner once, though most are the corner of two or three triangles.
  for (let k = 0, q = 0; k < u.length; k += 2, q += 6) {
    const ci = u[k];
    // A weight is the other way for a corner whose normal is turned (cooking()): the place is not.
    const kind = u[k + 1];
    const o = from + c[ci] * 3 * STRIDE;
    const b0 = c[ci + 1];
    const b1 = c[ci + 2];
    const b2 = c[ci + 3];
    const m0 = kind & TURN ? -b0 : b0;
    const m1 = kind & (TURN << 1) ? -b1 : b1;
    const m2 = kind & (TURN << 2) ? -b2 : b2;
    const o1 = o + STRIDE;
    const o2 = o1 + STRIDE;
    const x0 = a[o] * b0 + a[o1] * b1 + a[o2] * b2;
    const y = a[o + 1] * b0 + a[o1 + 1] * b1 + a[o2 + 1] * b2;
    const z = a[o + 2] * b0 + a[o1 + 2] * b1 + a[o2 + 2] * b2;
    let nx = a[o + 3] * m0 + a[o1 + 3] * m1 + a[o2 + 3] * m2;
    // A turned normal is level too (the world's level: a runner mostly stands).
    let ny =
      a[o + 4] * (m0 > 0 ? m0 : 0) + a[o1 + 4] * (m1 > 0 ? m1 : 0) + a[o2 + 4] * (m2 > 0 ? m2 : 0);
    let nz = a[o + 5] * m0 + a[o1 + 5] * m1 + a[o2 + 5] * m2;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const d = c[ci + 4];
    Q[q] = x0 + nx * d;
    Q[q + 1] = y + ny * d;
    Q[q + 2] = z + nz * d;
    let gx = c[ci + 5];
    let gy = c[ci + 6];
    let gz = c[ci + 7];
    if (gx || gy || gz) {
      // The swell's slope, turned as the normal turned from rest to drawn (Rodrigues), tilts it.
      const rx = rest[(k / 2) * 3];
      const ry = rest[(k / 2) * 3 + 1];
      const rz = rest[(k / 2) * 3 + 2];
      const kx = ry * nz - rz * ny;
      const ky = rz * nx - rx * nz;
      const kz = rx * ny - ry * nx;
      const sn = Math.sqrt(kx * kx + ky * ky + kz * kz);
      if (sn > 1e-6) {
        const cs = rx * nx + ry * ny + rz * nz;
        const ux = kx / sn;
        const uy = ky / sn;
        const uz = kz / sn;
        const ug = (ux * gx + uy * gy + uz * gz) * (1 - cs);
        const wx = uy * gz - uz * gy;
        const wy = uz * gx - ux * gz;
        const wz = ux * gy - uy * gx;
        gx = gx * cs + wx * sn + ux * ug;
        gy = gy * cs + wy * sn + uy * ug;
        gz = gz * cs + wz * sn + uz * ug;
      }
      nx -= gx;
      ny -= gy;
      nz -= gz;
      const ml = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= ml;
      ny /= ml;
      nz /= ml;
    }
    Q[q + 3] = nx;
    Q[q + 4] = ny;
    Q[q + 5] = nz;
  }
  for (let n = 0; n < list.length; n++) {
    const i = list[n];
    const kind = t[i + 4];
    for (let j = 0; j < 9; j += 3) {
      const q = x[n * 3 + j / 3] * 6;
      P[j] = Q[q];
      P[j + 1] = Q[q + 1];
      P[j + 2] = Q[q + 2];
      N[j] = Q[q + 3];
      N[j + 1] = Q[q + 4];
      N[j + 2] = Q[q + 5];
    }
    if (kind & 1) {
      // A wall: its own flat normal, as wound.
      const ax = P[3] - P[0];
      const ay = P[4] - P[1];
      const az = P[5] - P[2];
      const bx = P[6] - P[0];
      const by = P[7] - P[1];
      const bz = P[8] - P[2];
      const fx = ay * bz - az * by;
      const fy = az * bx - ax * bz;
      const fz = ax * by - ay * bx;
      const fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
      if (fl < 1e-12) {
        continue;
      }
      for (let j = 0; j < 9; j += 3) {
        N[j] = fx / fl;
        N[j + 1] = fy / fl;
        N[j + 2] = fz / fl;
      }
    }
    // The plates and their walls in `plate` when given; the scratches in their own.
    let cr = t[i];
    let cg = t[i + 1];
    let cb = t[i + 2];
    // Plain numbers, no array a triangle (as below).
    // The marine's details keep their own colours.
    const tone =
      kind & OWN
        ? undefined
        : cr < 0
          ? accent
          : plate && t[i + 3] == GLOSS
            ? plate
            : plate && !(kind & 1) && t[i + 5] < 0
              ? // On coloured plates the scratches are white (the user, 2026-11-10); on white ones, grey.
                SCRATCHED[+(cr > 0.55)]
              : undefined;
    if (tone) {
      cr = tone[0];
      cg = tone[1];
      cb = tone[2];
    } else if (plate && kind & 1 && !(kind & OWN)) {
      cr = plate[0] * 0.75;
      cg = plate[1] * 0.75;
      cb = plate[2] * 0.75;
    }
    // Written by index rather than pushed: the close armour is some 20 000 vertices.
    for (let j = 0; j < 9; j += 3, w += STRIDE) {
      a[w] = P[j];
      a[w + 1] = P[j + 1];
      a[w + 2] = P[j + 2];
      a[w + 3] = N[j];
      a[w + 4] = N[j + 1];
      a[w + 5] = N[j + 2];
      a[w + 6] = cr;
      a[w + 7] = cg;
      // The sash's weave is the shader's on a rest place: the CPU's vertices have none, so plain.
      a[w + 8] = t[i + 3] == WEAVE ? -1 : t[i + 3];
      a[w + 9] = cb;
    }
  }
  out.length = w;
};
