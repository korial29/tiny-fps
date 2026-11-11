import { describe, expect, it } from 'vitest';
import { STILL } from '../shared/physics';
import { LIMB } from '../shared/types';
import { CUP, CUP_Y, bust } from './armor';
import { CREST, DOME, EAR, FACETS, TEE, dome, glazed, helm, onDome, relief, slit } from './helm';
import { helmet } from './helmet';
import { GLOSS, SHINE, STRIDE } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, rest, solve } from './rig';
import type { Quat } from './rig';
import { BUST_Y, body } from './skin';
import { createRunner, soldier } from './soldier';

const HEAD = solve(rest()).pos[J.HEAD];
const IDENT: Quat = [0, 0, 0, 1];
const TEAM = [0.9, 0.2, 0.1];
const make = (lod: number, at: Vec3 = [0, 0, 0], q: Quat = IDENT) => {
  const out: number[] = [];
  helm(out, at, q, TEAM, lod);
  return out;
};
type V = { p: Vec3; n: Vec3; c: Vec3; layer: number };
const verts = (v: number[]): V[] =>
  Array.from({ length: v.length / STRIDE }, (_, i) => {
    const o = i * STRIDE;
    return {
      p: [v[o], v[o + 1], v[o + 2]],
      n: [v[o + 3], v[o + 4], v[o + 5]],
      c: [v[o + 6], v[o + 7], v[o + 9]],
      layer: v[o + 8],
    };
  });
const glass = (list: V[]) => list.filter(v => v.layer == SHINE);
const team = (list: V[]) => list.filter(v => v.c.every((x, k) => Math.abs(x - TEAM[k]) < 1e-6));

describe("helm, the woman's helmet on the moon", () => {
  for (const lod of [0, 1, 3]) {
    it(`is whole triangles of finite numbers with unit normals at level ${lod}`, () => {
      const v = make(lod);
      expect(v.length % (3 * STRIDE)).toBe(0);
      expect(v.length).toBeGreaterThan(0);
      expect(v.every(Number.isFinite)).toBe(true);
      for (const { n } of verts(v)) {
        expect(Math.hypot(...n)).toBeCloseTo(1, 3);
      }
    });
  }

  it('has more of it close than near, and near than far', () => {
    expect(make(3).length).toBeGreaterThan(make(1).length);
    expect(make(1).length).toBeGreaterThan(make(0).length);
    // Built once per level: the same again.
    expect(make(3)).toEqual(make(3));
  });

  it('is a little smaller than the first one', () => {
    expect(DOME.r[0]).toBeLessThan(0.106);
    expect(DOME.r[1]).toBeLessThan(0.142);
  });

  it('has cheeks shaped as a skull: the cheekbone out, a hollow V from by the eye down to the lip, the jaw out', () => {
    const { tip, foot, boneV, jawV, deepV } = FACETS;
    const at = (v: number) => tip[0] + ((foot[0] - tip[0]) * (tip[1] - v)) / tip[1];
    // Out on the cheekbone and the jaw, in on the crease.
    expect(relief(0.5, boneV)).toBeGreaterThan(0.004);
    expect(relief(0.85, jawV)).toBeGreaterThan(0.002);
    expect(relief(at(deepV), deepV)).toBeCloseTo(-FACETS.depth, 3);
    expect(relief(at(0.05), 0.05)).toBeLessThan(0);
    // The V's tip by the eye: near the slot, high; nothing over it.
    expect(tip[0]).toBeLessThan(0.3);
    expect(tip[1]).toBeGreaterThan(0.6);
    expect(relief(tip[0], tip[1] + 0.05)).toBeGreaterThan(0);
    // Drawn: under the slit on both sides, the hollow under the dome.
    const v = verts(make(3)).filter(
      w => w.layer == GLOSS && w.p[1] < TEE.y - slit(0) && w.p[2] < 0,
    );
    const sunk = (sx: number) =>
      v.some(w => {
        if (w.p[0] * sx <= 0) {
          return false;
        }
        const d = dome(Math.atan2(w.p[0] - DOME.c[0], DOME.c[2] - w.p[2]), w.p[1]);
        return Math.hypot(w.p[0], w.p[2] - DOME.c[2]) < Math.hypot(d[0], d[2] - DOME.c[2]) - 0.008;
      });
    expect(sunk(1) && sunk(-1)).toBe(true);
  });

  it('holds the head of her skin, from the jaw up, with room', () => {
    const s = body(3, 1);
    const seen = new Set<number>();
    s.l!.forEach((l, t) => {
      if (l == LIMB.HEAD) {
        for (let k = 0; k < 3; k++) {
          seen.add(s.t[t * 3 + k]);
        }
      }
    });
    let checked = 0;
    for (const i of seen) {
      const [x, y, z] = [0, 1, 2].map(k => s.v[i * 6 + k] - HEAD[k]);
      if (y < DOME.rim + 0.01) {
        continue;
      }
      checked++;
      const a = Math.atan2(x - DOME.c[0], DOME.c[2] - z);
      const shell = dome(a, Math.min(y, DOME.c[1] + DOME.r[1] - 1e-3));
      const [r, R] = [
        Math.hypot(x - DOME.c[0], z - DOME.c[2]),
        Math.hypot(shell[0] - DOME.c[0], shell[2] - DOME.c[2]),
      ];
      expect(r).toBeLessThan(R);
      expect(y).toBeLessThan(DOME.c[1] + DOME.r[1]);
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('has a dark T for a visor: a slit across the eyes, wider than tall, and a slot down to the lip', () => {
    const g = glass(verts(make(3)));
    expect(g.length).toBeGreaterThan(0);
    // All of it on the front, dark.
    expect(g.every(v => v.p[2] < 0 && Math.max(...v.c) < 0.1)).toBe(true);
    const bar = g.filter(v => v.p[1] > TEE.y - slit(0) - 1e-3);
    const slot = g.filter(v => v.p[1] < TEE.y - slit(0) - 0.01);
    const span = (list: V[], k: number) =>
      Math.max(...list.map(v => v.p[k])) - Math.min(...list.map(v => v.p[k]));
    expect(span(bar, 0)).toBeGreaterThan(0.15);
    expect(span(bar, 1)).toBeLessThan(0.045);
    // The eyes of the skin are 7 cm over the head joint: behind the slit.
    expect(Math.abs(TEE.y - 0.07)).toBeLessThan(slit(0));
    // The slot: narrow, in the middle, from under the slit down to the lip.
    expect(slot.every(v => Math.abs(v.p[0]) <= TEE.slot + 0.004)).toBe(true);
    expect(Math.min(...slot.map(v => v.p[1]))).toBeLessThan(DOME.rim + 0.01);
    // Nothing dark on the cheeks.
    expect(glazed(0.6, TEE.y - 0.06)).toBe(false);
    expect(glazed(0.6, TEE.y)).toBe(true);
    expect(glazed(0, DOME.rim + 0.02)).toBe(true);
    expect(glazed(Math.PI, TEE.y - 0.05)).toBe(false);
  });

  it('frames the T in the team’s colour and wears a crest of it over the top, at every level', () => {
    for (const lod of [0, 1, 3]) {
      const t = team(verts(make(lod)));
      expect(t.length).toBeGreaterThan(0);
      // The frame shows round the glass: wider than it by TEE.frame, and under it.
      const low = t.filter(v => v.p[1] < TEE.y + 0.03);
      expect(Math.max(...low.map(v => Math.abs(v.p[0])))).toBeGreaterThan(0.08);
      // The crest: narrow, from the brow over the top to the back.
      const top = t.filter(v => v.p[1] > CREST.from + 0.005);
      expect(top.every(v => Math.abs(v.p[0]) <= CREST.w + 0.004)).toBe(true);
      expect(Math.min(...top.map(v => v.p[2]))).toBeLessThan(-0.05);
      expect(Math.max(...top.map(v => v.p[2]))).toBeGreaterThan(0.08);
    }
    // Another team, another colour, and nothing else changes.
    const [a, b] = [make(1), [] as number[]];
    helm(b, [0, 0, 0], IDENT, [0.1, 0.3, 0.9], 1);
    expect(b.length).toBe(a.length);
    expect(verts(b).some(v => v.c[2] > 0.85 && v.c[0] < 0.15)).toBe(true);
  });

  it('has a cap on each ear and a stalk with a sight on the right one, up past the dome; none far', () => {
    const near = verts(make(1));
    const top = DOME.c[1] + DOME.r[1];
    const high = near.filter(v => v.p[1] > top + 0.005);
    expect(high.length).toBeGreaterThan(0);
    expect(high.every(v => v.p[0] > DOME.r[0] * 0.9)).toBe(true);
    expect(Math.max(...high.map(v => v.p[1]))).toBeCloseTo(EAR.y + EAR.stalk + 0.006, 3);
    for (const sx of [1, -1]) {
      expect(Math.max(...near.map(v => v.p[0] * sx))).toBeGreaterThan(DOME.r[0] + EAR.t * 0.8);
    }
    const far = verts(make(0));
    expect(far.every(v => v.p[1] <= top + 1e-6 && Math.abs(v.p[0]) < DOME.r[0] * 1.1)).toBe(true);
  });

  it('faces outward all over the dome', () => {
    for (const a of [0, 1, 2, 3, 4, 5]) {
      for (const y of [DOME.rim, -0.02, 0.05, 0.12, 0.18]) {
        const [p, n] = onDome(a, y);
        const out = [p[0] - DOME.c[0], Math.max(p[1] - DOME.c[1], 0), p[2] - DOME.c[2]];
        expect(n[0] * out[0] + n[1] * out[1] + n[2] * out[2]).toBeGreaterThan(0);
      }
    }
  });

  it('follows the head: placed at the joint and turned with it', () => {
    const a = verts(make(1));
    const b = verts(make(1, [1, 2, 3], [0, 1, 0, 0]));
    // Half a turn about y: x and z change sign.
    b.forEach((v, i) => {
      expect(v.p[0]).toBeCloseTo(1 - a[i].p[0], 5);
      expect(v.p[1]).toBeCloseTo(2 + a[i].p[1], 5);
      expect(v.p[2]).toBeCloseTo(3 - a[i].p[2], 5);
    });
  });

  it('is what the woman wears where helmets are worn, the man keeping his and its hose', () => {
    const draw = (build: number) => {
      const out: number[] = [];
      soldier(
        out,
        createRunner(
          { id: 3, x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0, ground: true, ...STILL },
          undefined,
          build,
        ),
        TEAM,
        1,
        true,
        true,
      );
      return verts(out);
    };
    const [his, hers] = [draw(0), draw(1)];
    const alone = (fn: typeof helm) => {
      const out: number[] = [];
      fn(out, [0, 0, 0], IDENT, TEAM, 1);
      return verts(out);
    };
    // His visor is green glass; hers is the dark T, and as much of it as her helmet has.
    const green = (list: V[]) => list.filter(v => v.layer == SHINE && v.c[1] > 0.08);
    expect(green(his).length).toBe(green(alone(helmet)).length);
    expect(green(hers)).toHaveLength(0);
    const dark = (list: V[]) => glass(list).filter(v => Math.max(...v.c) < 0.04);
    expect(dark(hers).length).toBe(dark(alone(helm)).length);
    expect(dark(his)).toHaveLength(0);
  });
});

describe("the woman's chest plate", () => {
  it('has a cup each side, fullest low on the chest, and a hollow at the sternum', () => {
    expect(bust(0.068, CUP_Y)).toBeCloseTo(CUP, 6);
    expect(bust(-0.068, CUP_Y)).toBeCloseTo(CUP, 6);
    expect(bust(0, CUP_Y)).toBeLessThan(CUP * 0.1);
    // Over the skin's bust, a little higher than before (1.342).
    expect(CUP_Y).toBeCloseTo(BUST_Y - 0.003, 6);
    // A firm line under it, a slope above.
    expect(bust(0.068, 1.3)).toBeLessThan(bust(0.068, 1.39));
    expect(bust(0.068, 1.25)).toBeLessThan(CUP * 0.01);
    expect(bust(0.068, 1.48)).toBeLessThan(CUP * 0.1);
    expect(CUP).toBeGreaterThanOrEqual(0.012);
    expect(GLOSS).toBeLessThan(0);
  });
});
