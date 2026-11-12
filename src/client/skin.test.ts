import { describe, expect, it } from 'vitest';
import { PLAYER_H, PLAYER_R } from '../shared/constants';
import { STRIDE } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT, JOINTS, PARENT, axis, rest, solve, turn } from './rig';
import type { Pose, Quat } from './rig';
import { beardOf, body, cut, eyesOf, hairOf, palette, shaved, skin } from './skin';
import {
  CH,
  CHANNELS,
  EYE,
  IRIS_R,
  KIND,
  PUPIL_R,
  TONES,
  ball,
  lidEdge,
  lookIn,
  lookOf,
  toneOf,
} from './features';
import { POSE, expression } from './expression';
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

/** Whether vertex k is of a piece of the face laid on the head (an eye, a lid, a far mark): those are open sheets. */
const piece = (s: { g: Uint8Array }, k: number) => s.g[k] > KIND.HEAD && s.g[k] != KIND.EAR;
/** Each corner of the skin `s` as [x, y, z] of its rest vertex, for those whose colour is mostly one of `col`. */
const corners = (s: ReturnType<typeof body>, ...col: number[]) =>
  [...s.t]
    .filter((_, i) => col.includes(s.cm[i] > 0.5 ? s.c2[i] : s.c[i]))
    .map(k => [s.v[k * 6], s.v[k * 6 + 1], s.v[k * 6 + 2]]);
/** The palette's regions the face's tests name. */
const [FLESH_, WHITE_, IRIS_, LIP_, BROW_, STUBBLE_, CAP_, PUPIL_, LASH_] = [
  3, 8, 9, 10, 12, 13, 20, 21, 22,
];

describe('skin', () => {
  it('stays within the budgets: far under 1900 vertices drawn, near (the face carved) under 12000 (rings measured on the soldier), close (within CLOSE, the face finest) under 36000', () => {
    const [far, near, close] = [0, 1, 3].map(lod => draw(lod).length / STRIDE);
    // 1800 until the far head got its marks and its nose (31 vertices, 28 triangles).
    expect(far).toBeLessThan(1900);
    expect(near).toBeLessThanOrEqual(12000);
    // 26000 until the close head took 2.5 times the neck's sides and finer rows (the user, 2026-11-08).
    // 34000 until the close arms took 24 sides (the user, 2026-11-09).
    expect(close).toBeLessThanOrEqual(36000);
    expect(far).toBeLessThan(near * 0.3);
    // Near carries the measured rings too, so it is less far below close than it was.
    expect(near).toBeLessThan(close * 0.45);
    // The vertices skinned each frame, per level: 296, 1674 and 5292 before the eyes' balls, the
    // irises, the lids and the far marks; 327, 1826 and 5768 with them.
    expect(body(0).w.length).toBeLessThan(340);
    expect(body(1).w.length).toBeLessThan(2000);
    expect(body(3).w.length).toBeLessThan(6000);
    // The eye's own body: no head; the close sides (a round chest looking down), its arms' rings
    // doubled, and a thin wrist (the user, 2026-11-09: fewer angles, whatever the budget).
    expect(draw(2).length / STRIDE).toBeLessThan(12000);
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
    // Close sides like the close runner's (the user, 2026-11-09: a round chest looking down), its trunk's rings not doubled.
    expect(v.length).toBeLessThan(draw(3).length);
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
          // Only the edges of the face's pieces: sheets laid on the head, their rims in it.
          for (const k of [a, b]) {
            expect(piece(s, +k)).toBe(true);
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
    // A trunk, arms and legs of those widths, a soldier's build: about 0.095 m3 with no head.
    expect(volume).toBeGreaterThan(0.05);
    expect(volume).toBeLessThan(0.1);
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
    // 62 degrees at the back of the armpit since the shoulders came in (the user, 2026-11-08).
    expect(turned.join).toBeLessThan(65);
  });

  it('relaxes the eye’s own shoulders once posed, and only its: no pole, unit normals', () => {
    const r = body(2).r!;
    expect(r.k.length).toBeGreaterThan(200);
    expect([0, 1, 3].every(lod => body(lod).r === undefined)).toBe(true);
    // The arms up before the eye, as a katana holds them: the shoulders bend hard.
    const p = bend(JOINT.ARM_R, axis([1, 0, 0], -1.4));
    const v = draw(2, p);
    for (let i = 0; i < v.length; i += STRIDE) {
      expect(Math.hypot(v[i + 3], v[i + 4], v[i + 5])).toBeCloseTo(1, 4);
    }
  });

  it('relaxes the close armpits into a fold: nothing in front of them turned back, no row crossed', () => {
    const s = body(3);
    const P = (k: number) => [0, 1, 2].map(d => s.v[k * 6 + d]);
    let n = 0;
    for (let i = 0; i < s.t.length; i += 3) {
      const t = [s.t[i], s.t[i + 1], s.t[i + 2]].map(P);
      const c = [0, 1, 2].map(d => (t[0][d] + t[1][d] + t[2][d]) / 3);
      if (
        Math.abs(c[0]) > 0.05 &&
        Math.abs(c[0]) < 0.13 &&
        c[1] > 1.38 &&
        c[1] < 1.44 &&
        c[2] < -0.08
      ) {
        const [u, v] = [1, 2].map(j => [0, 1, 2].map(d => t[j][d] - t[0][d]));
        const z = u[0] * v[1] - u[1] * v[0];
        const l = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], z);
        // The front of the chest faces forward (-z), wound outward.
        expect(z / l).toBeLessThan(-0.3);
        n++;
      }
    }
    expect(n).toBeGreaterThan(20);
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
    // Unlit only the light caught in the eyes.
    expect(rows.every(r => r.layer == -1 || same(r.c, [1.3, 1.3, 1.3]))).toBe(true);
    const jacket = of(JACKET);
    // Less of it since the webbing (UPPER, like the boots) covers the chest and the waist.
    expect(jacket.length).toBeGreaterThan(500);
    expect(Math.min(...jacket.map(r => r.y))).toBeGreaterThan(0.9);
    expect(Math.max(...jacket.map(r => r.y))).toBeLessThan(1.55);
    expect(JACKET.map(c => c * 0.5)).toEqual(TRIM);
    const trim = of(TRIM);
    expect(trim.length).toBeGreaterThan(50);
    expect(trim.every(r => r.y > 0.9 && r.y < 1.56)).toBe(true);
    const pants = of(PANTS);
    // To mid-calf, where the boots start.
    expect(pants.length).toBeGreaterThan(500);
    expect(Math.max(...pants.map(r => r.y))).toBeLessThan(1.02);
    const skin = of(FLESH);
    expect(skin.length).toBeGreaterThan(100);
    expect(Math.min(...skin.map(r => r.y))).toBeGreaterThan(1.5);
    expect(Math.min(...of(HAIR).map(r => r.y))).toBeGreaterThan(1.62);
    expect(of(HAIR).length).toBeGreaterThan(30);
    // Boots to mid-calf; nothing on the trunk (the user, 2026-11-09: no webbing).
    const [boots, webbing] = [of(UPPER).filter(r => r.y < 0.9), of(UPPER).filter(r => r.y > 0.9)];
    expect(Math.max(...boots.map(r => r.y))).toBeLessThan(0.43);
    expect(boots.length).toBeGreaterThan(100);
    expect(webbing).toHaveLength(0);
    expect(Math.max(...of(SOLE).map(r => r.y))).toBeLessThan(0.07);
    const gloves = of(GLOVE);
    expect(gloves.length).toBeGreaterThan(60);
    expect(gloves.every(r => Math.abs(r.x) > 0.15 && r.y < 0.99 && r.y > 0.7)).toBe(true);
  });

  it('gives the runner two eyes: a white ball in each socket, an iris on its front, a darker pupil in its middle', () => {
    for (const lod of [1, 3]) {
      const s = body(lod);
      const [white, iris, pupil] = [WHITE_, IRIS_, PUPIL_].map(c => corners(s, c));
      for (const p of [white, iris, pupil]) {
        // Both sides of the nose, at the eyes' height, on the front of the face (-z).
        expect(p.some(q => q[0] > 0.015)).toBe(true);
        expect(p.some(q => q[0] < -0.015)).toBe(true);
        expect(p.every(q => q[1] > 1.67 && q[1] < 1.71 && q[2] < -0.06)).toBe(true);
      }
      // The iris is on the ball, just in front of it; the pupil within its radius of the eye's middle.
      for (const q of iris) {
        const d = ball(Math.abs(q[0]), q[1]) - q[2];
        expect(d).toBeGreaterThan(0);
        expect(d).toBeLessThan(0.001);
        expect(Math.hypot(Math.abs(q[0]) - EYE[0], q[1] - EYE[1])).toBeLessThan(IRIS_R + 1e-6);
      }
      for (const q of pupil) {
        expect(Math.hypot(Math.abs(q[0]) - EYE[0], q[1] - EYE[1])).toBeLessThan(PUPIL_R + 1e-4);
      }
      // The ball is round: its middle stands 5 mm out of its rim.
      const front = Math.min(...white.map(q => q[2]));
      const rim = white.filter(q => Math.abs(q[1] - EYE[1]) > 0.0085 && q[2] < -0.07);
      expect(Math.min(...rim.map(q => q[2])) - front).toBeGreaterThan(0.003);
    }
    const colors = palette(JACKET);
    expect(colors[PUPIL_].reduce((a, b) => a + b)).toBeLessThan(0.1);
    expect(colors[IRIS_].reduce((a, b) => a + b)).toBeLessThan(0.4);
    // The eye's own body, headless, has no eyes.
    expect([...body(2).c].includes(WHITE_)).toBe(false);
    expect(body(2).m).toHaveLength(0);
  });

  it('carves a face into the close head: a nose, lids of their own over the top and the bottom of the irises, lips, a jaw over the neck, ears', () => {
    const s = body(3);
    // The skin, shaved or not.
    const flesh = corners(s, FLESH_, STUBBLE_, 23);
    // The nose's tip is the front of the face, about 2 cm out of the lips and the brow.
    const tip = flesh.reduce((a, b) => (b[2] < a[2] ? b : a));
    expect(Math.abs(tip[0])).toBeLessThan(0.002);
    expect(tip[1]).toBeGreaterThan(1.645);
    expect(tip[1]).toBeLessThan(1.66);
    const front = (y: number) =>
      Math.min(
        ...flesh.filter(p => Math.abs(p[0]) < 0.002 && Math.abs(p[1] - y) < 0.003).map(p => p[2]),
      );
    expect(front(1.608) - tip[2]).toBeGreaterThan(0.015);
    expect(front(1.708) - tip[2]).toBeGreaterThan(0.018);
    // The chin stands 2.5 cm over the throat under it.
    expect(front(1.575) - front(1.594)).toBeGreaterThan(0.02);
    // The lids: the upper one's edge under the top of the iris, the lower one's over its bottom,
    // both in front of the ball; a line of lashes along the upper one's.
    const of = (k: number) =>
      Array.from({ length: s.w.length }, (_, i) => i)
        .filter(i => s.g[i] == k && s.v[i * 6] > 0)
        .map(i => [...s.v.slice(i * 6, i * 6 + 3)]);
    const [up, low] = [of(KIND.LID_U), of(KIND.LID_L)];
    const mid = (l: number[][]) => l.filter(p => Math.abs(p[0] - EYE[0]) < 0.002);
    const upEdge = Math.min(...mid(up).map(p => p[1]));
    const lowEdge = Math.max(...mid(low).map(p => p[1]));
    expect(upEdge).toBeLessThan(EYE[1] + IRIS_R);
    expect(upEdge).toBeGreaterThan(EYE[1] + PUPIL_R);
    expect(lowEdge).toBeGreaterThan(EYE[1] - IRIS_R);
    expect(lowEdge).toBeLessThan(EYE[1] - PUPIL_R);
    for (const p of [...up, ...low]) {
      expect(p[2]).toBeLessThan(ball(p[0], p[1]) - 0.0005);
    }
    const lash = corners(s, LASH_);
    expect(lash.length).toBeGreaterThan(20);
    expect(lash.every(p => Math.abs(Math.abs(p[0]) - EYE[0]) < 0.016)).toBe(true);
    // Lips under the nose, ears out of the sides.
    const lips = corners(s, LIP_);
    expect(lips.length).toBeGreaterThan(30);
    expect(lips.every(p => Math.abs(p[0]) < 0.025 && p[1] > 1.605 && p[1] < 1.63)).toBe(true);
    for (const side of [1, -1]) {
      expect(flesh.some(p => p[0] * side > 0.083 && p[1] > 1.66 && p[1] < 1.7)).toBe(true);
    }
  });

  it('paints the brows along the arch of the brow ridge, level at rest, and a shaved beard under the cheekbones, their edges soft', () => {
    const s = body(3);
    const brows = corners(s, BROW_);
    for (const side of [1, -1]) {
      const b = brows.filter(p => p[0] * side > 0);
      expect(b.length).toBeGreaterThan(30);
      expect(b.every(p => Math.abs(p[0]) > 0.005 && Math.abs(p[0]) < 0.06 && p[2] < -0.07)).toBe(
        true,
      );
      // Over the eyes (1.69), the inner end no more than a millimetre or two under the arch.
      const at = (x: number) => {
        const ys = b.filter(p => Math.abs(Math.abs(p[0]) - x) < 0.004).map(p => p[1]);
        return (Math.max(...ys) + Math.min(...ys)) / 2;
      };
      expect(at(0.03)).toBeGreaterThan(1.706);
      expect(at(0.03)).toBeLessThan(1.72);
      expect(Math.abs(at(0.03) - at(0.014))).toBeLessThan(0.004);
    }
    // The beard: under the nose, around the mouth, along the jaw.
    const beard = corners(s, STUBBLE_);
    expect(beard.length).toBeGreaterThan(150);
    expect(beard.every(p => p[1] < 1.672 && p[1] > 1.57)).toBe(true);
    expect(beard.some(p => p[0] > 0.04) && beard.some(p => p[0] < -0.04)).toBe(true);
    // Soft edges: the hairline, the brows and the beard are blends of two colours, so they do
    // not step with the head's grid.
    for (const col of [4, BROW_, STUBBLE_]) {
      const soft = [...s.cm].filter((m, i) => s.c2[i] == col && m > 0.05 && m < 0.95);
      expect(soft.length).toBeGreaterThan(40);
    }
    // How dark the beard is is the runner's: none to full.
    const none = palette(JACKET, undefined, undefined, false, TONES[1], 0);
    expect(none[STUBBLE_]).toEqual(none[FLESH_]);
    expect(palette(JACKET)[STUBBLE_][0]).toBeLessThan(none[FLESH_][0] * 0.8);
    expect(new Set(Array.from({ length: 40 }, (_, i) => beardOf(i))).size).toBe(4);
  });

  it('gives the far head, too coarse to carve, a mark for each eye, each brow and the mouth, and a nose: 31 vertices', () => {
    const s = body(0);
    const marks = Array.from({ length: s.w.length }, (_, i) => i).filter(i => s.g[i] == KIND.MARK);
    expect(marks).toHaveLength(31);
    const at = marks.map(i => [...s.v.slice(i * 6, i * 6 + 3)]);
    // On the front of the face, the nose's tip 2 cm out of it.
    expect(at.every(p => p[2] < -0.07 && p[1] > 1.6 && p[1] < 1.72)).toBe(true);
    expect(Math.min(...at.map(p => p[2]))).toBeLessThan(-0.11);
    const dark = corners(s, LASH_);
    expect(dark.some(p => p[0] > 0.02) && dark.some(p => p[0] < -0.02)).toBe(true);
    expect(dark.every(p => Math.abs(p[1] - EYE[1]) < 0.01)).toBe(true);
    // No lids, no balls, no channels: nothing of it moves.
    expect([...s.g].some(k => k == KIND.LID_U || k == KIND.WHITE || k == KIND.IRIS)).toBe(false);
    expect(s.m).toHaveLength(0);
    // The carved levels have no marks.
    expect([...body(1).g, ...body(3).g].includes(KIND.MARK)).toBe(false);
  });

  describe('the face', () => {
    const colors = palette(JACKET);
    /** The close skin's vertices drawn with the face `w`, by rest vertex: [x, y, z, nx, ny, nz, r, g, layer, b]. */
    const drawn = (w?: ArrayLike<number>, lod = 3) => {
      const out: number[] = [];
      const s = body(lod);
      skin(out, s, solve(rest()), colors, w);
      const by: number[][] = [];
      s.t.forEach((k, i) => (by[k] = out.slice(i * STRIDE, (i + 1) * STRIDE)));
      return by;
    };
    const s = body(3);
    const ids = Array.from({ length: s.w.length }, (_, i) => i);
    const kind = (k: number, right = true) =>
      ids.filter(i => s.g[i] == k && s.v[i * 6] > 0 == right);
    /** The head's vertices near (x, y) on the front of the face, both sides when x is not 0. */
    const near = (x: number, y: number, r = 0.004) =>
      ids.filter(
        i =>
          s.g[i] == KIND.HEAD &&
          s.v[i * 6 + 2] < -0.05 &&
          Math.hypot(Math.abs(s.v[i * 6]) - x, s.v[i * 6 + 1] - y) < r,
      );
    const moved = (a: number[][], b: number[][], list: number[], axis: number) =>
      list.reduce((m, i) => m + b[i][axis] - a[i][axis], 0) / list.length;
    const still = drawn();
    const one = (ch: number, k = 1) => {
      const w = new Float32Array(CHANNELS);
      w[ch] = k;
      return w;
    };

    it('draws the rest mesh with no face, and with a face at rest: the channels add nothing at 0', () => {
      expect(drawn(new Float32Array(CHANNELS))).toEqual(still);
      expect(s.m).toHaveLength(CHANNELS);
      // The body under the neck is in no channel.
      for (const { i } of s.m) {
        expect([...i].every(k => s.v[k * 6 + 1] > 1.55)).toBe(true);
      }
    });

    it('blinks: the upper lids come down onto the lower ones, over the irises, on the ball all the way, and go back', () => {
      const edge = (d: number[][]) => {
        const lid = kind(KIND.LID_U).filter(i => Math.abs(s.v[i * 6] - EYE[0]) < 0.002);
        return lid.map(i => d[i]).reduce((a, b) => (b[1] < a[1] ? b : a));
      };
      const [open, shut] = [edge(still), edge(drawn(one(CH.BLINK)))];
      expect(open[1]).toBeGreaterThan(EYE[1] + 0.003);
      // Shut: at the lower lid's edge, 9 mm down, under the whole pupil and nearly all the iris.
      expect(shut[1]).toBeLessThan(lidEdge(false, 0) + 0.0005);
      expect(open[1] - shut[1]).toBeGreaterThan(0.008);
      expect(shut[1]).toBeLessThan(EYE[1] - PUPIL_R);
      // Half way the lid is on the ball, in front of it; on the straight line from open to shut
      // (BLINK alone) its edge would be in the ball.
      const half = one(CH.BLINK, 0.5);
      const chord = edge(drawn(half));
      half[CH.BLINK_MID] = 1;
      const on = edge(drawn(half));
      expect(on[2]).toBeLessThan(ball(on[0], on[1]) - 0.0005);
      expect(on[2]).toBeLessThan(chord[2]);
      // Shut too, at every vertex of the lid.
      const all = drawn(one(CH.BLINK));
      for (const i of kind(KIND.LID_U)) {
        expect(all[i][2]).toBeLessThan(ball(all[i][0], all[i][1]) - 0.0003);
      }
      // Nothing but the lids moves, and they reopen where they were.
      for (const i of ids.filter(i => s.g[i] != KIND.LID_U)) {
        expect(all[i].slice(0, 3)).toEqual(still[i].slice(0, 3));
      }
      expect(drawn(one(CH.BLINK, 0))).toEqual(still);
    });

    it('turns the gaze: the irises slide on the balls, both to the same side, and stay within the whites', () => {
      const middle = (d: number[][], right: boolean) => {
        const p = kind(KIND.IRIS, right).map(i => d[i]);
        return [0, 1, 2].map(e => p.reduce((m, q) => m + q[e], 0) / p.length);
      };
      for (const right of [true, false]) {
        const [at, to, up] = [still, drawn(one(CH.LOOK_X)), drawn(one(CH.LOOK_Y))].map(d =>
          middle(d, right),
        );
        // To the runner's right (+x) in both eyes, 4 to 5 mm; up 3 mm.
        expect(to[0] - at[0]).toBeGreaterThan(0.004);
        expect(to[0] - at[0]).toBeLessThan(0.0055);
        expect(up[1] - at[1]).toBeGreaterThan(0.0025);
        expect(Math.abs(to[1] - at[1])).toBeLessThan(1e-5);
      }
      // At the end of its travel every point of the iris is still on the ball, inside its rim.
      for (const [gx, gy] of [
        [1, 0],
        [-1, 0],
        [0.7, 0.7],
        [-0.7, -0.7],
      ]) {
        const w = one(CH.LOOK_X, gx);
        w[CH.LOOK_Y] = gy;
        w[CH.LOOK_IN] = lookIn(gx, gy);
        const d = drawn(w);
        for (const i of [...kind(KIND.IRIS), ...kind(KIND.IRIS, false)]) {
          const [x, y, z] = d[i];
          expect(((Math.abs(x) - EYE[0]) / 0.0138) ** 2 + ((y - EYE[1]) / 0.009) ** 2).toBeLessThan(
            1,
          );
          // Just off the ball, whichever way: LOOK_IN takes it back along the ball's curve.
          const off = ball(Math.abs(x), y) - z;
          expect(off).toBeGreaterThan(0.0001);
          expect(off).toBeLessThan(0.001);
        }
      }
      // Only the irises move.
      const d = drawn(one(CH.LOOK_X));
      expect(ids.filter(i => s.g[i] != KIND.IRIS).every(i => d[i][0] == still[i][0])).toBe(true);
    });

    it('moves the right features with each channel: the brows, the jaw, the corners of the mouth, the lower lids', () => {
      const [brow, inner, chin, corner, cheek] = [
        near(0.03, 1.713),
        near(0.012, 1.711),
        near(0, 1.59, 0.006),
        near(0.0245, 1.6216),
        near(0.04, 1.65, 0.006),
      ];
      for (const l of [brow, inner, chin, corner, cheek]) {
        expect(l.length).toBeGreaterThan(1);
      }
      const d = (ch: number) => drawn(one(ch));
      // The brows up 3 to 5 mm; nothing at the mouth.
      const up = d(CH.BROW_UP);
      expect(moved(still, up, brow, 1)).toBeGreaterThan(0.003);
      expect(moved(still, up, brow, 1)).toBeLessThan(0.0055);
      expect(Math.abs(moved(still, up, corner, 1))).toBeLessThan(1e-4);
      // A frown: their inner ends down, more than the arch; pain: the inner ends up.
      const down = d(CH.BROW_DOWN);
      expect(moved(still, down, inner, 1)).toBeLessThan(-0.003);
      expect(moved(still, down, inner, 1)).toBeLessThan(moved(still, down, brow, 1) - 0.001);
      expect(moved(still, d(CH.BROW_PAIN), inner, 1)).toBeGreaterThan(0.002);
      // The jaw: the chin 1.5 to 2.5 cm down, nothing above the upper lip, the mouth dark between.
      const jaw = d(CH.JAW);
      expect(-moved(still, jaw, chin, 1)).toBeGreaterThan(0.015);
      expect(-moved(still, jaw, chin, 1)).toBeLessThan(0.025);
      expect(ids.filter(i => s.v[i * 6 + 1] > 1.63).every(i => jaw[i][1] == still[i][1])).toBe(
        true,
      );
      const dark = (r: number[]) => r[6] < 0.1 && r[6] > 0.08 && r[9] < 0.04;
      expect(jaw.some(dark)).toBe(true);
      expect(still.some(dark)).toBe(false);
      // A smile: the corners up and out, the cheeks up; a frown of the mouth: the corners down.
      const smile = d(CH.SMILE);
      expect(moved(still, smile, corner, 1)).toBeGreaterThan(0.003);
      expect(moved(still, smile, cheek, 1)).toBeGreaterThan(0.001);
      const out = corner.reduce((m, i) => m + Math.abs(smile[i][0]) - Math.abs(still[i][0]), 0);
      expect(out / corner.length).toBeGreaterThan(0.002);
      expect(Math.abs(moved(still, smile, brow, 1))).toBeLessThan(1e-4);
      expect(moved(still, d(CH.FROWN), corner, 1)).toBeLessThan(-0.002);
      // The lips off the teeth: the line between them is the teeth's colour.
      const teeth = colors[24];
      const bared = d(CH.GRIT).filter(r => Math.abs(r[6] - teeth[0] * 1) < 0.02 && r[9] > 0.6);
      expect(bared.length).toBeGreaterThan(4);
      // A squint: the lower lids' edges up.
      const lower = kind(KIND.LID_L).filter(i => Math.abs(s.v[i * 6] - EYE[0]) < 0.002);
      const top = (x: number[][]) => Math.max(...lower.map(i => x[i][1]));
      expect(top(d(CH.SQUINT)) - top(still)).toBeGreaterThan(0.002);
      // Unit normals whatever the face.
      for (const w of [expression(POSE.SHOUT, 4), expression(POSE.WINCE, 9), lookOf(11)]) {
        for (const r of drawn(w)) {
          expect(Math.hypot(r[3], r[4], r[5])).toBeCloseTo(1, 4);
        }
      }
    });

    it('wears each expression on the features it is made of, and is back at rest with it gone', () => {
      const [brow, chin, corner] = [near(0.012, 1.711), near(0, 1.59, 0.006), near(0.0245, 1.6216)];
      const lidGap = (d: number[][]) => {
        const at = (k: number) =>
          kind(k)
            .filter(i => Math.abs(s.v[i * 6] - EYE[0]) < 0.002)
            .map(i => d[i][1]);
        return Math.min(...at(KIND.LID_U)) - Math.max(...at(KIND.LID_L));
      };
      const open = lidGap(still);
      expect(open).toBeGreaterThan(0.008);
      const of = (pose: number[][]) => drawn(expression(pose));
      // Effort and focus: the brows down, the eyes narrowed; in effort the mouth open to breathe.
      for (const pose of [POSE.EFFORT, POSE.FOCUS]) {
        const d = of(pose);
        expect(moved(still, d, brow, 1)).toBeLessThan(-0.0015);
        expect(lidGap(d)).toBeLessThan(open - 0.001);
        expect(lidGap(d)).toBeGreaterThan(open * 0.5);
      }
      expect(-moved(still, of(POSE.EFFORT), chin, 1)).toBeGreaterThan(0.004);
      expect(-moved(still, of(POSE.FOCUS), chin, 1)).toBeLessThan(0.001);
      // A wince and the face of one down: the eyes shut or nearly, the mouth's corners down.
      for (const pose of [POSE.WINCE, POSE.DOWN]) {
        const d = of(pose);
        expect(lidGap(d)).toBeLessThan(open * 0.2);
        expect(moved(still, d, corner, 1)).toBeLessThan(-0.001);
      }
      // A shout: the jaw wide, the brows hard down, the eyes open.
      const shout = of(POSE.SHOUT);
      expect(-moved(still, shout, chin, 1)).toBeGreaterThan(0.015);
      expect(moved(still, shout, brow, 1)).toBeLessThan(-0.003);
      expect(lidGap(shout)).toBeGreaterThan(open * 0.5);
      // A grin: the corners up, the jaw nearly shut, the eyes open.
      const grin = of(POSE.GRIN);
      expect(moved(still, grin, corner, 1)).toBeGreaterThan(0.003);
      expect(-moved(still, grin, chin, 1)).toBeLessThan(0.004);
      expect(lidGap(grin)).toBeGreaterThan(open * 0.5);
      // Gone, the face is the rest one again: no channel leaves anything behind.
      expect(drawn(expression([]))).toEqual(still);
    });

    it('gives two players two faces and one player one face: the shape, the skin, the hair, the eyes, the beard', () => {
      const [a, b] = [drawn(lookOf(1)), drawn(lookOf(2))];
      expect(drawn(lookOf(1))).toEqual(a);
      const head = ids.filter(i => s.v[i * 6 + 1] > 1.6);
      const apart = Math.max(
        ...head.map(i => dist(a[i].slice(0, 3) as Vec3, b[i].slice(0, 3) as Vec3)),
      );
      // Millimetres, not centimetres: two people, not two species.
      expect(apart).toBeGreaterThan(0.002);
      expect(apart).toBeLessThan(0.02);
      // The body under the neck is the same.
      for (const i of ids.filter(i => s.v[i * 6 + 1] < 1.55)) {
        expect(a[i]).toEqual(b[i]);
      }
      // Each trait within its range, the expressions' channels left at 0; no two of 30 players alike.
      const looks = Array.from({ length: 30 }, (_, i) => lookOf(i));
      for (const w of looks) {
        expect(w).toHaveLength(CHANNELS);
        expect([...w.slice(0, CH.WIDTH)].every(v => v == 0)).toBe(true);
        expect([...w.slice(CH.WIDTH)].every(v => Math.abs(v) <= 1.25)).toBe(true);
        expect(w[CH.HAIR]).toBeGreaterThanOrEqual(0);
      }
      expect(new Set(looks.map(w => w.join())).size).toBe(30);
      // A face is not the same on both sides.
      const lop = drawn(one(CH.ASYM));
      const [r, l] = [true, false].map(right =>
        ids.filter(
          i => s.g[i] == KIND.HEAD && s.v[i * 6] > 0.02 == right && Math.abs(s.v[i * 6]) > 0.02,
        ),
      );
      const lift = (list: number[]) => Math.max(...list.map(i => lop[i][1] - still[i][1]));
      expect(lift(r)).toBeGreaterThan(lift(l) + 0.001);
      // The skin: six tones, the same for every viewer, in the palette with its lips and its shades.
      const people = Array.from({ length: 200 }, (_, i) => i);
      expect(new Set(people.map(i => String(toneOf(i)))).size).toBe(TONES.length);
      expect(toneOf(5)).toBe(toneOf(5));
      const dark = palette(JACKET, undefined, undefined, false, TONES[5]);
      expect(dark[FLESH_]).toBe(TONES[5]);
      expect(dark[LIP_][0]).toBeLessThan(TONES[5][0]);
      expect(palette(JACKET)[FLESH_]).toBe(TONES[1]);
      // On the two darkest the hair is dark or shaved, the eyes brown.
      for (const i of people.filter(i => TONES.indexOf(toneOf(i)) > 3)) {
        expect(shaved(i) || hairOf(i)[0] < 0.25).toBe(true);
        expect(eyesOf(i)[2]).toBeLessThan(0.1);
      }
    });
  });

  it('gives each runner his own look, the same for everyone: one of nine hair colours, a shaved head among them, one of five irises', () => {
    const ids = Array.from({ length: 200 }, (_, i) => i);
    expect(new Set(ids.map(i => String(hairOf(i)))).size).toBe(9);
    expect(new Set(ids.map(i => String(eyesOf(i)))).size).toBe(5);
    expect(hairOf(7)).toBe(hairOf(7));
    // A shaved head is the skin's colour in its shadow: reddish, darker than the skin.
    const shaved = ids
      .map(id => hairOf(id))
      .find(h => h[0] > 0.4 && h[0] < 0.55 && h[0] > h[2] * 1.5)!;
    expect(shaved[0]).toBeLessThan(FLESH[0]);
    // The irises run from dark brown to a pale blue.
    const blue = ids.map(id => eyesOf(id)).filter(e => e[2] > e[0]);
    expect(blue.length).toBeGreaterThan(40);
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
        // A soldier's forearm, thick by the elbow.
        expect(off(q)).toBeLessThan(0.09);
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
        ([x, y], n) => y > 1.1 && y < 1.3 && Math.abs(x) > 0.14 && x * n[0] < -0.8 * Math.abs(x),
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

  it('hangs the arms from armpits 6 cm under the shoulder joints, not from the chest', () => {
    const shoulder = solve(rest()).pos[JOINT.ARM_R][1];
    const { v, t, l } = body(1);
    // The trunk's triangles (not an arm's, a leg's or the head's) out at the shoulders' width: the
    // shoulder's side, which the sleeve hangs from. Its lowest point is the armpit.
    const low = Math.min(
      ...Array.from(t, (k, i) => [k, l![Math.floor(i / 3)]])
        .filter(([k, part]) => part === LIMB.NONE && Math.abs(v[k * 6]) > 0.2)
        .map(([k]) => v[k * 6 + 1]),
    );
    // 10 cm until the user raised them (2026-11-09).
    expect(shoulder - low).toBeGreaterThan(0.05);
    expect(shoulder - low).toBeLessThan(0.08);
  });

  it('picks a hair colour per runner at random, the same for every viewer', () => {
    const ids = Array.from({ length: 16 }, (_, i) => i + 1);
    const hair = ids.map(id => hairOf(id));
    expect(ids.map(id => hairOf(id))).toEqual(hair);
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
    // A shared CI runner is some five times slower than a desk, and the body grew (#86): 0.8 ms
    // near on a desk, up to 5.3 on a runner.
    expect((performance.now() - t) / 200).toBeLessThan(8);
    const u = performance.now();
    for (let i = 0; i < 50; i++) {
      out.length = 0;
      skin(out, body(3), solve(p), palette(JACKET));
    }
    // Close, 2.6 ms on a desk with the hard face (#116); runners took 12.6 against 12, then 16.2
    // against 15 under coverage: the bound only catches a many-fold slowdown.
    expect((performance.now() - u) / 50).toBeLessThan(25);
    // With a face in a full expression, its channels added before the pose: the same bound.
    const w = expression(POSE.WINCE, 3);
    const f = performance.now();
    for (let i = 0; i < 50; i++) {
      out.length = 0;
      skin(out, body(3), solve(p), palette(JACKET), w);
    }
    expect((performance.now() - f) / 50).toBeLessThan(25);
  });

  describe('cut', () => {
    const LIMBS = [LIMB.HEAD, LIMB.ARM_L, LIMB.ARM_R, LIMB.LEG_L, LIMB.LEG_R];
    const CAP = CAP_;
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
      expect(Math.max(...ys(LIMB.ARM_R))).toBeLessThan(1.45);
      expect(Math.min(...xs(LIMB.ARM_R))).toBeGreaterThan(0.1);
      expect(Math.max(...xs(LIMB.ARM_L))).toBeLessThan(-0.1);
      expect(Math.max(...ys(LIMB.LEG_L))).toBeLessThan(0.95);
      expect(Math.min(...ys(LIMB.LEG_L))).toBeCloseTo(0, 2);
      expect(Math.max(...xs(LIMB.LEG_L))).toBeLessThan(0.01);
      expect(Math.min(...xs(LIMB.LEG_R))).toBeGreaterThan(-0.01);
    });

    it('closes both pieces: every edge has a twin, but the rims of the pieces of the face', () => {
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
              expect(piece(s, +a)).toBe(true);
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
      // The eyes' specks glow too, white.
      const speck = (r: number[]) => r[6] == 1.3 && r[9] == 1.3;
      const [glowing, lit] = [-2, -1].map(l => rows(out).filter(r => r[8] == l && !speck(r)));
      expect(glowing.length).toBeGreaterThan(15);
      expect(lit.length + glowing.length).toBe(rows(out).filter(r => !speck(r)).length);
      for (const r of glowing) {
        expect(r[6]).toBeGreaterThan(1);
        expect(r[6]).toBeGreaterThan(r[7] * 2);
        expect(r[7]).toBeGreaterThan(r[9]);
      }
      const plain: number[] = [];
      skin(plain, body(1), solve(rest()), palette(JACKET));
      expect(rows(plain).every(r => r[8] == -1 || speck(r))).toBe(true);
    });
  });
});
