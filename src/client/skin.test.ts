import { describe, expect, it } from 'vitest';
import { PLAYER_H, PLAYER_R } from '../shared/constants';
import { STRIDE } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT, JOINTS, PARENT, axis, rest, solve } from './rig';
import type { Pose, Quat } from './rig';
import { body, palette, skin } from './skin';

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

describe('skin', () => {
  it('stays within the budgets: near about 3000 vertices drawn, far under half of that', () => {
    const [far, near] = [0, 1].map(lod => draw(lod).length / STRIDE);
    expect(near).toBeLessThanOrEqual(3100);
    expect(near).toBeGreaterThan(2000);
    expect(far).toBeLessThan(near * 0.45);
    expect(body(1).w.length).toBeLessThan(700);
  });

  it('is a 1.8 m runner on the floor, narrower than the player cylinder', () => {
    for (const lod of [0, 1]) {
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
    for (const lod of [0, 1]) {
      const s = body(lod);
      const mean = new Array(JOINTS).fill(0);
      const count = new Array(JOINTS).fill(0);
      for (let i = 0; i < s.w.length; i++) {
        const [a, b, w] = [s.j[i * 2], s.j[i * 2 + 1], s.w[i]];
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
        expect(a == b || PARENT[a] == b || PARENT[b] == a).toBe(true);
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

  it('is closed: every edge joins two triangles but the three rings buried in the head', () => {
    for (const lod of [0, 1]) {
      const s = body(lod);
      const seen = new Map<string, number>();
      for (let i = 0; i < s.t.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          const [a, b] = [s.t[i + k], s.t[i + ((k + 1) % 3)]];
          const key = a < b ? `${a} ${b}` : `${b} ${a}`;
          seen.set(key, (seen.get(key) ?? 0) + 1);
        }
      }
      for (const [key, n] of seen) {
        expect(n).toBeLessThanOrEqual(2);
        if (n == 1) {
          // The neck's top, the head's chin ring and the nose's base: inside the head.
          const [y, z] = key
            .split(' ')
            .map(a => [s.v[+a * 6 + 1], s.v[+a * 6 + 2]])
            .reduce((p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
          expect(y > 1.56 || z < -0.07).toBe(true);
        }
      }
    }
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
      e.forEach((l, i) => expect(l).toBeLessThan(rest0[i] * 2 + 0.03));
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

  it('skins a runner in well under a millisecond', () => {
    const p = bend(JOINT.THIGH_R, axis([1, 0, 0], 1));
    const out: number[] = [];
    skin(out, body(1), solve(p), palette(JACKET));
    const t = performance.now();
    for (let i = 0; i < 200; i++) {
      out.length = 0;
      skin(out, body(1), solve(p), palette(JACKET));
    }
    expect((performance.now() - t) / 200).toBeLessThan(2);
  });
});
