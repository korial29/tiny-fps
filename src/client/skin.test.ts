import { describe, expect, it } from 'vitest';
import { PLAYER_H, PLAYER_R } from '../shared/constants';
import { STRIDE } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT, JOINTS, PARENT, axis, rest, solve, turn } from './rig';
import type { Pose, Quat } from './rig';
import { body, cut, hairOf, palette, skin } from './skin';
import { LIMB } from '../shared/types';

const JACKET = [0.1, 0.8, 0.2];
const [, TRIM, PANTS, FLESH, HAIR, UPPER, SOLE, GLOVE] = palette(JACKET);
const same = (a: ArrayLike<number>, b: number[]) => b.every((v, i) => a[i] === v);
const KNEE = Math.PI / 2;

/** The skin drawn at a pose: the vertices, and the same triangles' vertices in the rest pose. */
const draw = (lod: number, pose: Pose = rest(), colors = palette(JACKET)) => {
  const out: number[] = [];
  skin(out, body(lod), solve(pose), colors);
  return out;
};
const at = (v: number[], i: number): Vec3 => [v[i * STRIDE], v[i * STRIDE + 1], v[i * STRIDE + 2]];
const bend = (j: number, q: Quat, p = rest()) => {
  p.rot[j] = q;
  return p;
};
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const edges = (v: number[]) => {
  const e: number[] = [];
  for (let t = 0; t < v.length / STRIDE; t += 3) {
    e.push(
      dist(at(v, t), at(v, t + 1)),
      dist(at(v, t + 1), at(v, t + 2)),
      dist(at(v, t + 2), at(v, t)),
    );
  }
  return e;
};

/** Whether vertex k is on the base of an eye, open and buried in the socket. */
const eyeBase = (v: Float32Array, k: number) =>
  Math.abs(Math.abs(v[k * 6]) - 0.032) < 0.014 &&
  Math.abs(v[k * 6 + 1] - 1.69) < 0.007 &&
  v[k * 6 + 2] < -0.065;

describe('skin', () => {
  it('stays within the budgets: far under 1800 vertices drawn, near (the face carved) under 7600, close (within CLOSE) under 22000', () => {
    const [far, near, close] = [0, 1, 3].map(lod => draw(lod).length / STRIDE);
    expect(far).toBeLessThan(1800);
    expect(near).toBeLessThanOrEqual(7600);
    expect(close).toBeLessThanOrEqual(22000);
    expect(far).toBeLessThan(near * 0.3);
    expect(near).toBeLessThan(close * 0.4);
    expect(body(1).w.length).toBeLessThan(1300);
    // The eye's own body stays as it was: no head, and the near rings.
    expect(draw(2).length / STRIDE).toBeLessThan(2700);
  });

  it('is a 1.8 m runner on the floor, narrower than the player cylinder', () => {
    for (const lod of [0, 1, 3]) {
      const v = draw(lod);
      const [xs, ys, zs] = [0, 1, 2].map(k => v.filter((_, i) => i % STRIDE == k));
      expect(Math.min(...ys)).toBeGreaterThan(-0.01);
      expect(Math.min(...ys)).toBeLessThan(0.01);
      expect(Math.max(...ys)).toBeCloseTo(PLAYER_H, 2);
      expect(Math.max(...xs.map(Math.abs))).toBeLessThan(PLAYER_R * 0.8);
      expect(Math.max(...zs.map(Math.abs))).toBeLessThan(PLAYER_R * 0.8);
      // Shoulders wider than the hips, the toes ahead (-z) of the heels.
      expect(Math.max(...xs)).toBeGreaterThan(0.2);
      expect(Math.min(...zs)).toBeLessThan(-0.2);
    }
  });

  it('weights each vertex to one joint or two that touch, on its own side, summing to one', () => {
    for (const lod of [0, 1, 3]) {
      const s = body(lod);
      const mean = new Array(JOINTS).fill(0);
      const count = new Array(JOINTS).fill(0);
      for (let i = 0; i < s.w.length; i++) {
        // The skin's own joints after the rig's are the upper arms without their twist.
        const real = (k: number) => (k == JOINTS ? JOINT.ARM_R : k == JOINTS + 1 ? JOINT.ARM_L : k);
        const [a, b, w] = [real(s.j[i * 2]), real(s.j[i * 2 + 1]), s.w[i]];
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
        // The shoulder's side hangs on the chest and the arm, across the clavicle.
        expect(
          a == b ||
            PARENT[a] == b ||
            PARENT[b] == a ||
            (a == JOINT.CHEST && PARENT[PARENT[b]] == a) ||
            (b == JOINT.CHEST && PARENT[PARENT[a]] == b),
        ).toBe(true);
        for (const j of [a, b]) {
          mean[j] += s.v[i * 6];
          count[j]++;
        }
      }
      for (const j of [JOINT.ARM_L, JOINT.FOREARM_L, JOINT.THIGH_L, JOINT.SHIN_L, JOINT.FOOT_L]) {
        expect(mean[j] / count[j]).toBeLessThan(-0.05);
        expect(mean[j + 4] / count[j + 4]).toBeGreaterThan(0.05);
      }
      // Every joint that bends has skin on it.
      for (const j of [
        JOINT.PELVIS,
        JOINT.SPINE,
        JOINT.CHEST,
        JOINT.NECK,
        JOINT.HEAD,
        JOINT.TOE_L,
      ]) {
        expect(count[j]).toBeGreaterThan(0);
      }
    }
  });

  it('is the rest mesh in the rest pose, with unit normals, and walks with the pose', () => {
    const s = body(1);
    const v = draw(1);
    for (let i = 0; i < s.t.length; i++) {
      const k = s.t[i] * 6;
      for (let r = 0; r < 6; r++) {
        expect(v[i * STRIDE + r]).toBeCloseTo(s.v[k + r], 5);
      }
      expect(Math.hypot(v[i * STRIDE + 3], v[i * STRIDE + 4], v[i * STRIDE + 5])).toBeCloseTo(1, 4);
    }
    // Moved to a place and turned: every vertex goes with the feet origin, a quarter turn about y.
    const [x, y, z] = [3, 2, -5];
    const w = draw(1, rest([x, y, z], Math.PI / 2));
    for (let i = 0; i < s.t.length; i += 97) {
      const k = s.t[i] * 6;
      expect(w[i * STRIDE]).toBeCloseTo(x + s.v[k + 2], 4);
      expect(w[i * STRIDE + 1]).toBeCloseTo(y + s.v[k + 1], 4);
      expect(w[i * STRIDE + 2]).toBeCloseTo(z - s.v[k], 4);
    }
  });

  it('has no head for the eye: the trunk ends in a closed cap on the shoulders', () => {
    const v = draw(2);
    const colors = new Set<string>();
    for (let i = 0; i < v.length; i += STRIDE) {
      colors.add([v[i + 6], v[i + 7], v[i + 9]].join());
    }
    for (const c of [FLESH, HAIR]) {
      expect(colors.has(c.join())).toBe(false);
    }
    expect(Math.max(...v.filter((_, i) => i % STRIDE == 1))).toBeLessThan(1.52);
    expect(v.length).toBeLessThan(draw(1).length);
    const s = body(2);
    const seen = new Map<string, number>();
    for (let i = 0; i < s.t.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const [a, b] = [s.t[i + k], s.t[i + ((k + 1) % 3)]];
        const key = a < b ? `${a} ${b}` : `${b} ${a}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
    expect([...seen.values()].every(n => n == 2)).toBe(true);
  });

  it('is one closed surface: every edge joins two triangles wound the same way round', () => {
    for (const lod of [0, 1, 2, 3]) {
      const s = body(lod);
      const dir = new Set<string>();
      for (let i = 0; i < s.t.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          const key = `${s.t[i + k]} ${s.t[i + ((k + 1) % 3)]}`;
          // The same direction twice would be a fold or a second surface on top.
          expect(dir.has(key)).toBe(false);
          dir.add(key);
        }
      }
      for (const key of dir) {
        const [a, b] = key.split(' ');
        if (!dir.has(`${b} ${a}`)) {
          // Only the eyes' bases, buried in the face.
          for (const k of [a, b]) {
            expect(eyeBase(s.v, +k)).toBe(true);
          }
        }
      }
      // Each vertex is its own: the limbs share the trunk's at the hips and the armpits.
      const places = new Set(
        Array.from({ length: s.w.length }, (_, i) =>
          [...s.v.slice(i * 6, i * 6 + 3)].map(v => v.toFixed(4)).join(),
        ),
      );
      expect(places.size).toBe(s.w.length);
    }
  });

  it('is a runner and not a heap of tubes: its volume is that of a person', () => {
    // The divergence theorem on the closed mesh: an overlap would count twice.
    const s = body(2);
    let volume = 0;
    for (let i = 0; i < s.t.length; i += 3) {
      const [a, b, c] = [0, 1, 2].map(k => [...s.v.slice(s.t[i + k] * 6, s.t[i + k] * 6 + 3)]);
      volume +=
        (a[0] * (b[1] * c[2] - b[2] * c[1]) -
          a[1] * (b[0] * c[2] - b[2] * c[0]) +
          a[2] * (b[0] * c[1] - b[1] * c[0])) /
        6;
    }
    // A trunk, arms and legs of those widths: about 0.068 m3 with no head.
    expect(volume).toBeGreaterThan(0.05);
    expect(volume).toBeLessThan(0.08);
  });

  it('shades the joins as one surface: the shoulders and the hips turn no more than the rest', () => {
    const s = body(1);
    const seen = new Set<string>();
    const turned = { join: 0, loft: 0 };
    for (let i = 0; i < s.t.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const [a, b] = [s.t[i + k], s.t[i + ((k + 1) % 3)]];
        const key = a < b ? `${a} ${b}` : `${b} ${a}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const angle =
          (Math.acos(
            Math.min(
              1,
              s.v[a * 6 + 3] * s.v[b * 6 + 3] +
                s.v[a * 6 + 4] * s.v[b * 6 + 4] +
                s.v[a * 6 + 5] * s.v[b * 6 + 5],
            ),
          ) *
            180) /
          Math.PI;
        // The rings where the limbs hang: the top of the sleeves (outside the armpit) and the
        // pelvis' sides. The crotch and the armpit are creases on purpose.
        const at = (v: number, y: number, x: number) =>
          Math.abs(s.v[v * 6 + 1] - y) < 1e-4 && Math.abs(s.v[v * 6]) > x;
        const join = [a, b].some(v => at(v, 1.31, 0.2) || at(v, 0.93, 0.1));
        turned[join ? 'join' : 'loft'] = Math.max(turned[join ? 'join' : 'loft'], angle);
      }
    }
    expect(turned.join).toBeLessThan(turned.loft);
    expect(turned.join).toBeLessThan(60);
  });

  it('keeps the surface continuous when a joint bends 90 degrees, and creases the inside', () => {
    const base = draw(1);
    const rest0 = edges(base);
    const x = (a: number) => axis([1, 0, 0], a);
    for (const [j, q] of [
      [JOINT.SHIN_R, x(-KNEE)],
      [JOINT.THIGH_R, x(KNEE)],
      [JOINT.FOREARM_L, x(KNEE)],
      [JOINT.ARM_R, x(KNEE)],
      [JOINT.SPINE, x(-KNEE / 2)],
    ] as [number, Quat][]) {
      const v = draw(1, bend(j, q));
      const e = edges(v);
      // A neighbour stays a neighbour: no edge grows past twice its length and a few centimetres.
      // (the armpit's skin stretches more, as the arm leaves it)
      e.forEach((l, i) => expect(l).toBeLessThan(rest0[i] * (j == JOINT.ARM_R ? 4 : 2) + 0.03));
      for (let i = 0; i < v.length; i += STRIDE) {
        expect(v.slice(i, i + STRIDE).every(Number.isFinite)).toBe(true);
        expect(Math.hypot(v[i + 3], v[i + 4], v[i + 5])).toBeCloseTo(1, 4);
        expect(Math.hypot(...at(v, i / STRIDE))).toBeLessThan(2.2);
      }
    }
    // The knee: the calf swings back, so the backs of the thigh and the calf come together and
    // the fronts part.
    const s = body(1);
    const between = (v: number[], back: boolean) => {
      const pick = (lo: number, hi: number) =>
        Array.from(s.t, (_, i) => i).filter(i => {
          const [x, y, z] = [s.v[s.t[i] * 6], s.v[s.t[i] * 6 + 1], s.v[s.t[i] * 6 + 2]];
          return x > 0.05 && y > lo && y < hi && (back ? z > 0.04 : z < -0.04);
        });
      const [thigh, calf] = [pick(0.55, 0.8), pick(0.25, 0.42)];
      return Math.min(...thigh.flatMap(i => calf.map(k => dist(at(v, i), at(v, k)))));
    };
    const bent = draw(1, bend(JOINT.SHIN_R, x(-KNEE)));
    expect(between(bent, true)).toBeLessThan(between(base, true) * 0.5);
    expect(between(bent, false)).toBeGreaterThan(between(base, false) * 0.9);
  });

  it('keeps the thickness of a bent elbow and knee, where linear blending pinches them', () => {
    const s = body(1);
    const bind = solve(rest()).pos;
    const bound = (y: number) =>
      Array.from({ length: s.w.length }, (_, i) => i).filter(
        i => Math.abs(s.v[i * 6 + 1] - y) < 1e-4 && s.v[i * 6] > 0.02,
      );
    /** The ring of the right limb at the joint, in order round it. */
    const rings = [
      [1.18, JOINT.FOREARM_R, 1],
      [0.49, JOINT.SHIN_R, -1],
    ].map(([y, j, d]) => {
      const ids = bound(y);
      const mid = [0, 2].map(r => ids.reduce((m, i) => m + s.v[i * 6 + r], 0) / ids.length);
      ids.sort(
        (a, b) =>
          Math.atan2(s.v[a * 6 + 2] - mid[1], s.v[a * 6] - mid[0]) -
          Math.atan2(s.v[b * 6 + 2] - mid[1], s.v[b * 6] - mid[0]),
      );
      return { ids, j, d };
    });
    /** The area of the ring's polygon, whatever plane it lies in. */
    const area = (p: Vec3[]) => {
      const c = [0, 1, 2].map(r => p.reduce((m, q) => m + q[r], 0) / p.length);
      const n = [0, 0, 0];
      p.forEach((q, i) => {
        const [a, b] = [q, p[(i + 1) % p.length]].map(r => r.map((v, k) => v - c[k]));
        n[0] += a[1] * b[2] - a[2] * b[1];
        n[1] += a[2] * b[0] - a[0] * b[2];
        n[2] += a[0] * b[1] - a[1] * b[0];
      });
      return Math.hypot(...n) / 2;
    };
    for (const { ids, j, d } of rings) {
      const straight = area(ids.map(i => Array.from(s.v.slice(i * 6, i * 6 + 3)) as Vec3));
      for (const deg of [90, 140]) {
        const pose = bend(j, axis([1, 0, 0], (d * deg * Math.PI) / 180));
        const solved = solve(pose);
        const v = draw(1, pose);
        // Where each vertex goes: with the skin, and with plain linear blending.
        const dual = new Map<number, Vec3>();
        s.t.forEach((k, h) => dual.set(k, at(v, h)));
        const linear = (i: number): Vec3 => {
          // The skin's own joints after the rig's are the upper arms without their twist.
          const real = (k: number) =>
            k == JOINTS ? JOINT.ARM_R : k == JOINTS + 1 ? JOINT.ARM_L : k;
          const [a, b, w] = [real(s.j[i * 2]), real(s.j[i * 2 + 1]), s.w[i]];
          const p = Array.from(s.v.slice(i * 6, i * 6 + 3)) as Vec3;
          const to = (k: number) =>
            turn(solved.rot[k], p.map((c, r) => c - bind[k][r]) as Vec3).map(
              (c, r) => c + solved.pos[k][r],
            );
          const [pa, pb] = [to(a), to(b)];
          return pa.map((c, r) => c * (1 - w) + pb[r] * w) as Vec3;
        };
        const [kept, pinched] = [area(ids.map(i => dual.get(i)!)), area(ids.map(linear))];
        expect(kept / straight).toBeGreaterThan(0.85);
        expect(kept / straight).toBeLessThan(1.15);
        expect(pinched / straight).toBeLessThan(0.85);
      }
    }
  });

  it('dresses the runner in regions: jacket in the team colour, dark trim, trousers, skin, hair, shoes, gloves', () => {
    const v = draw(1);
    const rows = Array.from({ length: v.length / STRIDE }, (_, i) => ({
      y: v[i * STRIDE + 1],
      x: v[i * STRIDE],
      layer: v[i * STRIDE + 8],
      c: [v[i * STRIDE + 6], v[i * STRIDE + 7], v[i * STRIDE + 9]],
    }));
    const of = (c: number[]) => rows.filter(r => same(r.c, c));
    expect(rows.every(r => r.layer == -1)).toBe(true);
    const jacket = of(JACKET);
    expect(jacket.length).toBeGreaterThan(700);
    expect(Math.min(...jacket.map(r => r.y))).toBeGreaterThan(0.9);
    expect(Math.max(...jacket.map(r => r.y))).toBeLessThan(1.55);
    expect(JACKET.map(c => c * 0.5)).toEqual(TRIM);
    const trim = of(TRIM);
    expect(trim.length).toBeGreaterThan(50);
    expect(trim.every(r => r.y > 0.9 && r.y < 1.56)).toBe(true);
    const pants = of(PANTS);
    expect(pants.length).toBeGreaterThan(600);
    expect(Math.max(...pants.map(r => r.y))).toBeLessThan(1.02);
    const skin = of(FLESH);
    expect(skin.length).toBeGreaterThan(100);
    expect(Math.min(...skin.map(r => r.y))).toBeGreaterThan(1.5);
    expect(Math.min(...of(HAIR).map(r => r.y))).toBeGreaterThan(1.62);
    expect(of(HAIR).length).toBeGreaterThan(30);
    expect(Math.max(...of(UPPER).map(r => r.y))).toBeLessThan(0.12);
    expect(Math.max(...of(SOLE).map(r => r.y))).toBeLessThan(0.07);
    const gloves = of(GLOVE);
    expect(gloves.length).toBeGreaterThan(60);
    expect(gloves.every(r => Math.abs(r.x) > 0.15 && r.y < 0.96 && r.y > 0.7)).toBe(true);
  });

  it('gives the runner two eyes, whites with a dark iris at the front of each, and no shades', () => {
    const [WHITE, IRIS] = palette(JACKET).slice(8, 10);
    const v = draw(1);
    const rows = Array.from({ length: v.length / STRIDE }, (_, i) => at(v, i));
    const colour = (i: number) => [v[i * STRIDE + 6], v[i * STRIDE + 7], v[i * STRIDE + 9]];
    const of = (c: number[]) => rows.filter((_, i) => same(colour(i), c));
    for (const c of [WHITE, IRIS]) {
      const p = of(c);
      // Both sides of the nose, at the eyes' height, on the front of the face (-z).
      expect(p.some(q => q[0] > 0.015)).toBe(true);
      expect(p.some(q => q[0] < -0.015)).toBe(true);
      expect(p.every(q => q[1] > 1.67 && q[1] < 1.71 && q[2] < -0.06)).toBe(true);
    }
    // The iris is in front of the white, and dark.
    expect(Math.min(...of(IRIS).map(q => q[2]))).toBeLessThan(
      Math.min(...of(WHITE).map(q => q[2])),
    );
    expect(IRIS.reduce((a, b) => a + b)).toBeLessThan(0.4);
    // Nothing dark across the eyes but the irises: the shades are gone.
    expect(
      rows.filter((q, i) => q[1] > 1.66 && q[1] < 1.7 && colour(i).reduce((a, b) => a + b) < 0.1),
    ).toHaveLength(0);
    // The eye's own body, headless, has no eyes.
    const own = draw(2);
    expect(
      Array.from({ length: own.length / STRIDE }, (_, i) => i).some(i =>
        same([own[i * STRIDE + 6], own[i * STRIDE + 7], own[i * STRIDE + 9]], WHITE),
      ),
    ).toBe(false);
  });

  it('carves a face into the close head: a nose, lids over the irises, lips, a jaw over the neck, ears', () => {
    const { v, t, c } = body(3);
    const [FLESH_, IRIS_, LIP] = [3, 9, 10];
    const corners = (col: number) =>
      [...t].filter((_, i) => c[i] == col).map(k => [v[k * 6], v[k * 6 + 1], v[k * 6 + 2]]);
    const flesh = corners(FLESH_);
    // The nose's tip is the front of the face, 2.5 cm out of the lips and the brow.
    const tip = flesh.reduce((a, b) => (b[2] < a[2] ? b : a));
    expect(Math.abs(tip[0])).toBeLessThan(0.002);
    expect(tip[1]).toBeGreaterThan(1.645);
    expect(tip[1]).toBeLessThan(1.66);
    const front = (y: number) =>
      Math.min(
        ...flesh.filter(p => Math.abs(p[0]) < 0.002 && Math.abs(p[1] - y) < 0.003).map(p => p[2]),
      );
    expect(front(1.62) - tip[2]).toBeGreaterThan(0.018);
    expect(front(1.708) - tip[2]).toBeGreaterThan(0.02);
    // The chin stands 2.5 cm over the throat under it.
    expect(front(1.575) - front(1.594)).toBeGreaterThan(0.02);
    // The upper lid comes down in front of the top of the iris.
    const irisFront = Math.min(...corners(IRIS_).map(p => p[2]));
    expect(
      flesh.some(
        p => Math.abs(p[0] - 0.032) < 0.004 && p[1] > 1.6935 && p[1] < 1.697 && p[2] < irisFront,
      ),
    ).toBe(true);
    // Lips under the nose, ears out of the sides.
    const lips = corners(LIP);
    expect(lips.length).toBeGreaterThan(30);
    expect(lips.every(p => Math.abs(p[0]) < 0.025 && p[1] > 1.605 && p[1] < 1.63)).toBe(true);
    for (const side of [1, -1]) {
      expect(flesh.some(p => p[0] * side > 0.083 && p[1] > 1.66 && p[1] < 1.7)).toBe(true);
    }
    // Far, none of it: the far head is a plain one.
    expect([...body(0).c].includes(LIP)).toBe(false);
  });

  it('bends an arm like one: a straight forearm under a folded elbow, a deltoid that does not spin', () => {
    for (const lod of [1, 3]) {
      const s = body(lod);
      /** Per drawn corner of the part (the right arm's by default) its rest place and where it is drawn. */
      const corners = (v: number[], pick: (p: number[]) => boolean, part: number = LIMB.ARM_R) =>
        Array.from(s.t, (k, h) => ({ p: [...s.v.slice(k * 6, k * 6 + 3)], q: at(v, h), h }))
          .filter(({ p, h }) => s.l![Math.floor(h / 3)] == part && pick(p))
          .map(({ p, q }) => [p, q] as [number[], Vec3]);
      // The elbow folded 130 degrees: the forearm's sleeve, from just under the elbow to the cuff,
      // stays as far from the forearm's bone as it is at rest, all along it.
      const p = bend(JOINT.FOREARM_R, axis([1, 0, 0], 2.3));
      const { pos } = solve(p);
      const [e, w] = [pos[JOINT.FOREARM_R], pos[JOINT.HAND_R]];
      const d = [w[0] - e[0], w[1] - e[1], w[2] - e[2]];
      const n = Math.hypot(...d);
      const off = (q: Vec3) => {
        const r = [q[0] - e[0], q[1] - e[1], q[2] - e[2]];
        const k = (r[0] * d[0] + r[1] * d[1] + r[2] * d[2]) / (n * n);
        return Math.hypot(r[0] - k * d[0], r[1] - k * d[1], r[2] - k * d[2]);
      };
      for (const [, q] of corners(draw(lod, p), ([x, y]) => x > 0.15 && y > 0.98 && y < 1.14)) {
        expect(off(q)).toBeGreaterThan(0.02);
        expect(off(q)).toBeLessThan(0.065);
      }
      // The upper arm turned a radian about itself: the sleeve turns, the shoulder's cap and the
      // torso under it hardly move.
      const t = bend(JOINT.ARM_R, axis([0.103, -0.995, 0], 1));
      const [rest0, turned] = [draw(lod), draw(lod, t)];
      const moved = (pick: (p: number[]) => boolean, part?: number) => {
        const before = corners(rest0, pick, part);
        return Math.max(...corners(turned, pick, part).map(([, q], i) => dist(q, before[i][1])));
      };
      expect(moved(([x, y]) => x > 0.15 && y > 1.36 && y < 1.55, LIMB.NONE)).toBeLessThan(0.01);
      expect(moved(([x, y]) => x > 0.15 && y > 1.15 && y < 1.25)).toBeGreaterThan(0.03);
    }
  });

  it('sets the arms off the chest: the armpits and the insides of the sleeves are in shadow', () => {
    for (const lod of [0, 1, 3]) {
      const { v, o } = body(lod);
      /** The mean light of the vertices whose position and normal pass `pick`. */
      const light = (pick: (p: number[], n: number[]) => boolean) => {
        const g = Array.from(o).filter((_, i) =>
          pick([...v.slice(i * 6, i * 6 + 3)], [...v.slice(i * 6 + 3, i * 6 + 6)]),
        );
        expect(g.length).toBeGreaterThan(0);
        return g.reduce((a, b) => a + b, 0) / g.length;
      };
      const chest = light(([x, y], n) => Math.abs(x) < 0.08 && y > 1.15 && y < 1.4 && n[2] < -0.8);
      const side = light(
        ([x, y], n) => y > 1.15 && y < 1.37 && Math.abs(x) < 0.175 && x * n[0] > 0.8 * Math.abs(x),
      );
      const inner = light(
        ([x, y], n) => y > 1.1 && y < 1.3 && Math.abs(x) > 0.17 && x * n[0] < -0.8 * Math.abs(x),
      );
      const outer = light(
        ([x, y], n) => y > 1.1 && y < 1.3 && Math.abs(x) > 0.2 && x * n[0] > 0.8 * Math.abs(x),
      );
      expect(chest).toBeGreaterThan(0.95);
      expect(outer).toBeGreaterThan(0.95);
      expect(side).toBeLessThan(0.75);
      expect(inner).toBeLessThan(0.75);
    }
    // In the open, it is the palette's own colour; the cut's middle too.
    expect(Math.max(...body(1).o)).toBe(1);
    expect(cut(1, LIMB.ARM_R)[0].o.at(-1)).toBe(1);
  });

  it('hangs the arms from armpits 10 cm under the shoulder joints, not from the chest', () => {
    const shoulder = solve(rest()).pos[JOINT.ARM_R][1];
    const { v, t, l } = body(1);
    // The trunk's triangles (not an arm's, a leg's or the head's) out at the shoulders' width: the
    // shoulder's side, which the sleeve hangs from. Its lowest point is the armpit.
    const low = Math.min(
      ...Array.from(t, (k, i) => [k, l![Math.floor(i / 3)]])
        .filter(([k, part]) => part === LIMB.NONE && Math.abs(v[k * 6]) > 0.2)
        .map(([k]) => v[k * 6 + 1]),
    );
    expect(shoulder - low).toBeGreaterThan(0.08);
    expect(shoulder - low).toBeLessThan(0.12);
  });

  it('picks a hair colour per runner at random, the same for every viewer', () => {
    const ids = Array.from({ length: 16 }, (_, i) => i + 1);
    const hair = ids.map(hairOf);
    expect(ids.map(hairOf)).toEqual(hair);
    expect(new Set(hair.map(String)).size).toBeGreaterThanOrEqual(5);
    // Into the palette's hair region; the default is the old dark brown.
    expect(palette(JACKET, hair[3])[4]).toBe(hair[3]);
    expect(palette(JACKET)[4]).toEqual([0.09, 0.07, 0.06]);
  });

  it('skins a runner near in under a millisecond, close in a few', () => {
    const p = bend(JOINT.THIGH_R, axis([1, 0, 0], 1));
    const out: number[] = [];
    skin(out, body(1), solve(p), palette(JACKET));
    const t = performance.now();
    for (let i = 0; i < 200; i++) {
      out.length = 0;
      skin(out, body(1), solve(p), palette(JACKET));
    }
    // A shared CI runner is some five times slower than a desk: 0.4 ms near, 1.5 ms close there.
    expect((performance.now() - t) / 200).toBeLessThan(4);
    const u = performance.now();
    for (let i = 0; i < 50; i++) {
      out.length = 0;
      skin(out, body(3), solve(p), palette(JACKET));
    }
    expect((performance.now() - u) / 50).toBeLessThan(12);
  });

  describe('cut', () => {
    const LIMBS = [LIMB.HEAD, LIMB.ARM_L, LIMB.ARM_R, LIMB.LEG_L, LIMB.LEG_R];
    const CAP = palette(JACKET).length - 1;
    const tris = (s: { t: Uint16Array }, n = s.t.length / 3) =>
      Array.from({ length: n }, (_, i) => [...s.t.slice(i * 3, i * 3 + 3)].join());

    it('splits the skin into the body and the limb: every triangle once, plus the cut faces', () => {
      for (const lod of [0, 1, 3]) {
        const whole = body(lod);
        for (const limb of LIMBS) {
          const [rest, piece] = cut(lod, limb);
          const caps = [rest, piece].map(s => [...s.c].filter(c => c == CAP).length / 3);
          expect(caps[0]).toBeGreaterThanOrEqual(4);
          expect(caps[1]).toBe(caps[0]);
          // The caps come last, so the rest is whole's triangles, each once.
          const kept = [
            ...tris(rest, rest.c.length / 3 - caps[0]),
            ...tris(piece, piece.c.length / 3 - caps[1]),
          ];
          expect(kept.sort()).toEqual(tris(whole).sort());
          expect(rest.w.length).toBe(whole.w.length + 1);
          // Both faces fan from the one new vertex, the same edge each way round.
          const fan = (s: { t: Uint16Array }, k: number) => s.t[s.t.length - 3 * k + 2];
          expect(fan(rest, 1)).toBe(whole.w.length);
          expect(fan(piece, 1)).toBe(whole.w.length);
        }
      }
    });

    it('cuts where the limb meets the trunk: the head at the neck, an arm at the shoulder, a leg at the hip', () => {
      const ys = (limb: number) => {
        const [, piece] = cut(1, limb);
        return [...piece.t].map(i => piece.v[i * 6 + 1]);
      };
      const xs = (limb: number) => {
        const [, piece] = cut(1, limb);
        return [...piece.t].map(i => piece.v[i * 6]);
      };
      expect(Math.min(...ys(LIMB.HEAD))).toBeGreaterThan(1.54);
      expect(Math.max(...ys(LIMB.HEAD))).toBeCloseTo(1.8, 2);
      expect(Math.min(...ys(LIMB.ARM_R))).toBeCloseTo(0.772, 2);
      expect(Math.max(...ys(LIMB.ARM_R))).toBeLessThan(1.4);
      expect(Math.min(...xs(LIMB.ARM_R))).toBeGreaterThan(0.1);
      expect(Math.max(...xs(LIMB.ARM_L))).toBeLessThan(-0.1);
      expect(Math.max(...ys(LIMB.LEG_L))).toBeLessThan(0.95);
      expect(Math.min(...ys(LIMB.LEG_L))).toBeCloseTo(0, 2);
      expect(Math.max(...xs(LIMB.LEG_L))).toBeLessThan(0.01);
      expect(Math.min(...xs(LIMB.LEG_R))).toBeGreaterThan(-0.01);
    });

    it('closes both pieces: every edge has a twin, but the buried bases of the eyes', () => {
      for (const limb of LIMBS) {
        for (const s of cut(1, limb)) {
          const dir = new Set<string>();
          for (let i = 0; i < s.t.length; i += 3) {
            for (let k = 0; k < 3; k++) {
              dir.add(`${s.t[i + k]} ${s.t[i + ((k + 1) % 3)]}`);
            }
          }
          for (const key of dir) {
            const [a, b] = key.split(' ');
            if (!dir.has(`${b} ${a}`)) {
              expect(eyeBase(s.v, +a)).toBe(true);
            }
          }
        }
      }
    });

    it('draws the cut faces glowing red-orange, unlit, and the rest of the skin lit', () => {
      const out: number[] = [];
      skin(out, cut(1, LIMB.ARM_R)[0], solve(rest()), palette(JACKET));
      const rows = (v: number[]) =>
        Array.from({ length: v.length / STRIDE }, (_, i) => v.slice(i * STRIDE, (i + 1) * STRIDE));
      const [glowing, lit] = [-2, -1].map(l => rows(out).filter(r => r[8] == l));
      expect(glowing.length).toBeGreaterThan(15);
      expect(lit.length + glowing.length).toBe(out.length / STRIDE);
      for (const r of glowing) {
        expect(r[6]).toBeGreaterThan(1);
        expect(r[6]).toBeGreaterThan(r[7] * 2);
        expect(r[7]).toBeGreaterThan(r[9]);
      }
      const plain: number[] = [];
      skin(plain, body(1), solve(rest()), palette(JACKET));
      expect(rows(plain).every(r => r[8] == -1)).toBe(true);
    });
  });
});
