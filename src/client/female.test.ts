// The woman (BODY.FEMALE): her skeleton and skin against the man's, her armour and her hair in
// every stance, her hands on the weapons, her face on the HUD.
import { describe, expect, it } from 'vitest';
import { PLAYER_H, PLAYER_R } from '../shared/constants';
import { STILL, eyeHeight } from '../shared/physics';
import { MODE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import type { Vec3 } from './mesh';
import { BUILD, JOINT as J, RESTS, rest, solve } from './rig';
import { BUST, bindOf, body } from './skin';
import { createRunner, femme, stance } from './soldier';
import { HEAD_SCALE } from './hair';
import { CH, lookOf } from './features';
import { FRAMES, PALETTE, sprite } from './face';
import { createBody } from './body';

const F = BUILD.FEMALE;
const who = (o: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
  x: 5,
  y: 1,
  z: -3,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
  ...o,
});
const dist = (a: ArrayLike<number>, b: ArrayLike<number>) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** The extent of the rest skin's vertices that hang on the joints `js` for more than half, along axis `d`. */
const span = (build: number, js: number[], d: number) => {
  const s = body(3, build);
  let [lo, hi] = [Infinity, -Infinity];
  for (let i = 0; i < s.w.length; i++) {
    if (js.includes(s.w[i] > 0.5 ? s.j[2 * i + 1] : s.j[2 * i])) {
      lo = Math.min(lo, s.v[i * 6 + d]);
      hi = Math.max(hi, s.v[i * 6 + d]);
    }
  }
  return hi - lo;
};
/** The widest the trunk's rest skin is across within `dy` of height y. */
const width = (build: number, y: number, dy = 0.02) => {
  const s = body(3, build);
  let w = 0;
  for (let i = 0; i < s.w.length; i++) {
    if (s.j[2 * i] <= J.CHEST && s.j[2 * i + 1] <= J.CHEST && Math.abs(s.v[i * 6 + 1] - y) < dy) {
      w = Math.max(w, Math.abs(s.v[i * 6]));
    }
  }
  return 2 * w;
};

describe('her skeleton', () => {
  const [m, f] = [0, F].map(b => bindOf(b));
  it('has narrower shoulders on hips no narrower: a ratio well under his', () => {
    const ratio = (b: Vec3[]) =>
      (b[J.ARM_R][0] - b[J.ARM_L][0]) / (b[J.THIGH_R][0] - b[J.THIGH_L][0]);
    expect(f[J.ARM_R][0]).toBeLessThan(m[J.ARM_R][0] * 0.92);
    expect(f[J.THIGH_R][0]).toBeGreaterThanOrEqual(m[J.THIGH_R][0]);
    expect(ratio(f)).toBeLessThan(ratio(m) * 0.9);
  });
  it('has his legs under a shorter trunk: longer legs for her height, a few centimetres shorter', () => {
    for (const j of [J.PELVIS, J.THIGH_R, J.SHIN_R, J.FOOT_R]) {
      expect(f[j][1]).toBeCloseTo(m[j][1], 9);
    }
    const down = m[J.HEAD][1] - f[J.HEAD][1];
    expect(down).toBeGreaterThan(0.02);
    expect(down).toBeLessThan(0.05);
    expect(f[J.PELVIS][1] / f[J.HEAD][1]).toBeGreaterThan(m[J.PELVIS][1] / m[J.HEAD][1]);
  });
  it('has shorter arms whose hands hang where his do', () => {
    expect(dist(f[J.ARM_R], f[J.HAND_R])).toBeLessThan(dist(m[J.ARM_R], m[J.HAND_R]) * 0.97);
    expect(f[J.HAND_R][1]).toBeCloseTo(m[J.HAND_R][1], 2);
  });
  it('is the pose of a build, and the man is the pose without one', () => {
    expect(rest().rest).toBeUndefined();
    expect(rest([0, 0, 0], 0, F).rest).toBe(RESTS[F]);
    expect(solve(rest()).pos).toEqual(bindOf(0).slice(0, 21));
  });
});

describe('her skin', () => {
  it('is his vertex for vertex: the same triangles, weights and budgets at every level', () => {
    for (const lod of [0, 1, 2, 3]) {
      const [a, b] = [body(lod), body(lod, F)];
      expect(b.t).toEqual(a.t);
      expect(b.j).toEqual(a.j);
      expect(b.w.length).toBe(a.w.length);
      expect(b.v).not.toEqual(a.v);
      // The man's proportions under hers, for the armour's regions: her own face on them.
      expect(b.u!.length).toBe(a.v.length);
      expect(b.b).toBe(F);
    }
    expect(body(0)).toBe(body(0, 0));
    expect(body(1, F)).toBe(body(1, F));
  });
  it('has a waist drawn in over hips as wide as his, under narrower shoulders', () => {
    // Heights on each body: the hips, the waist, the shoulders' ring.
    const [hm, wm] = [width(0, 0.95), width(0, 1.12, 0.03)];
    const [hf, wf] = [width(F, 0.95), width(F, 1.115, 0.03)];
    expect(hf).toBeGreaterThan(hm);
    expect(wf / hf).toBeLessThan(0.78);
    expect(wf / hf).toBeLessThan((wm / hm) * 0.88);
    expect(span(F, [J.ARM_L, J.ARM_R, body(3).j.reduce((a, b) => Math.max(a, b))], 0)).toBeLessThan(
      span(0, [J.ARM_L, J.ARM_R, body(3).j.reduce((a, b) => Math.max(a, b))], 0) * 0.92,
    );
  });
  it('has a bust shaped under the chest plate, no more than BUST out of his chest line', () => {
    const [a, b] = [body(3), body(3, F)];
    let out = 0;
    for (let i = 0; i < a.w.length; i++) {
      if (a.j[2 * i] <= J.CHEST && a.j[2 * i + 1] <= J.CHEST && a.v[i * 6 + 2] < 0) {
        // Her front against his, his scaled to her ribs' depth.
        out = Math.max(out, -b.v[i * 6 + 2] - -a.v[i * 6 + 2] * 0.9);
      }
    }
    expect(out).toBeGreaterThan(0.012);
    expect(out).toBeLessThanOrEqual(BUST);
  });
  it('has smaller hands and feet, slimmer arms, and a smaller head on a slimmer neck', () => {
    expect(span(F, [J.HAND_R], 1)).toBeLessThan(span(0, [J.HAND_R], 1) * 0.95);
    expect(span(F, [J.FOOT_R, J.TOE_R], 2)).toBeLessThan(span(0, [J.FOOT_R, J.TOE_R], 2) * 0.97);
    expect(span(F, [J.FOREARM_R], 2)).toBeLessThan(span(0, [J.FOREARM_R], 2) * 0.9);
    expect(span(F, [J.HEAD], 0)).toBeLessThan(span(0, [J.HEAD], 0) * 0.98);
    expect(span(F, [J.HEAD], 1) / span(0, [J.HEAD], 1)).toBeCloseTo(HEAD_SCALE, 1);
  });
  it('stands on the floor as he does, and no taller', () => {
    const [a, b] = [body(3), body(3, F)];
    const ys = (s: typeof a) => Array.from({ length: s.w.length }, (_, i) => s.v[i * 6 + 1]);
    expect(Math.min(...ys(b))).toBeCloseTo(Math.min(...ys(a)), 6);
    expect(Math.max(...ys(a)) - Math.max(...ys(b))).toBeGreaterThan(0.025);
    expect(Math.max(...ys(b))).toBeLessThan(PLAYER_H + 0.02);
  });
  it('has unit normals and a softer face: a narrower jaw than his', () => {
    const b = body(3, F);
    for (let i = 0; i < b.w.length; i += 7) {
      expect(Math.hypot(b.v[i * 6 + 3], b.v[i * 6 + 4], b.v[i * 6 + 5])).toBeCloseTo(1, 3);
    }
    /** The head's width in the band of the jaw, on his rest mesh's heights. */
    const jaw = (s: ReturnType<typeof body>) => {
      const u = s.u ?? s.v;
      let w = 0;
      for (let i = 0; i < s.w.length; i++) {
        if (s.g[i] == 1 && u[i * 6 + 1] > 1.6 && u[i * 6 + 1] < 1.625 && u[i * 6 + 2] < 0) {
          w = Math.max(w, Math.abs(s.v[i * 6]));
        }
      }
      return w;
    };
    expect(jaw(b)).toBeLessThan(jaw(body(3)) * 0.9);
  });
});

describe('her hands on the weapons', () => {
  it.each([
    ['rail gun', { railed: true, rail: 3 }],
    ['rifle', { rifled: true, rifle: 20 }],
    ['katana', { blade: true, wield: true }],
  ] as [string, Partial<PlayerState>][])('are on the grips of the %s as his are', (_, o) => {
    const [m, f] = [0, F].map(b => stance(createRunner(who(o), undefined, b)).s);
    // The weapon is drawn from the right hand: the left is as far from it on the same grip.
    expect(dist(f.pos[J.HAND_L], f.pos[J.HAND_R])).toBeCloseTo(
      dist(m.pos[J.HAND_L], m.pos[J.HAND_R]),
      1,
    );
    expect(dist(f.pos[J.HAND_L], f.pos[J.HAND_R])).toBeLessThan(0.6);
  });
  it('keeps the eye and the hit cylinder: the game does not know her body', () => {
    expect(Object.keys(who())).not.toContain('body');
    expect(eyeHeight(who())).toBe(eyeHeight({ mode: MODE.GROUND }));
    expect([PLAYER_H, PLAYER_R]).toEqual([1.8, 0.4]);
  });
  it('gives the own body her arms: slimmer, on a gait of her skeleton', () => {
    const shot = (build: number) => {
      const b = createBody();
      b.wear(build);
      b.update(who({ ammo: 5 }), 0.1);
      const out: number[] = [];
      b.draw(out, [5, 1 + eyeHeight(who()), -3], 0, 0);
      return out;
    };
    const [m, f] = [shot(0), shot(F)];
    expect(f.length).toBe(m.length);
    expect(f.length).toBeGreaterThan(0);
    expect(f).not.toEqual(m);
  });
});

describe('her face', () => {
  it('never has the heavy brow or the wide jaw of the draw, and has fuller lips', () => {
    for (let id = 0; id < 60; id++) {
      const w = lookOf(id);
      femme(w);
      expect(w[CH.RIDGE]).toBeLessThan(0);
      expect(w[CH.JOWL]).toBeLessThan(0);
      expect(w[CH.LIPS]).toBeGreaterThan(0.2);
    }
  });
  it('blinks and looks as his does: the same channels on her head', () => {
    const [a, b] = [body(3), body(3, F)];
    expect(b.m.length).toBe(a.m.length);
    b.m.forEach((c, ch) => {
      // A channel that moves nothing on his (FLUSH, a colour) moves nothing on hers.
      expect(a.m[ch].i.length ? c.i.length / a.m[ch].i.length : 1 - c.i.length).toBeGreaterThan(
        0.6,
      );
      // Her head is smaller: so are its shifts.
      const sum = (d: Float32Array) => d.reduce((s, v, i) => s + (i % 6 < 3 ? Math.abs(v) : 0), 0);
      if (sum(a.m[ch].d) > 0) {
        expect(sum(c.d) / sum(a.m[ch].d)).toBeGreaterThan(0.4);
        expect(sum(c.d) / sum(a.m[ch].d)).toBeLessThan(1.3);
      }
    });
  });
  it('has a portrait of her own for every frame of his', () => {
    for (let n = 0; n < FRAMES; n++) {
      const [m, f] = [sprite(n), sprite(n, 1)];
      expect(f.length).toBe(m.length);
      expect(Math.max(...f)).toBeLessThan(PALETTE.length);
      expect(f).not.toEqual(m);
      // Her hair: none of his pixels are in its colour.
      expect(f.filter(c => c == 17).length).toBeGreaterThan(40);
      expect(m.filter(c => c >= 17).length).toBe(0);
    }
    expect(sprite(3, 1)).toBe(sprite(3, 1));
    expect(sprite(0, 1).filter(c => c == 19).length).toBeGreaterThan(4);
  });
});
