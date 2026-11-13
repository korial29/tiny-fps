// The woman (BODY.FEMALE): her skeleton and skin against the man's, her armour and her hair in
// every stance, her hands on the weapons, her face on the HUD.
import { describe, expect, it } from 'vitest';
import { PLAYER_H, PLAYER_R } from '../shared/constants';
import { STILL, eyeHeight } from '../shared/physics';
import { LIMB, MODE, SIDE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { GLOSS, STRIDE } from './mesh';
import type { Vec3 } from './mesh';
import { BUILD, JOINT as J, RESTS, rest, solve } from './rig';
import { helm } from './helm';
import { helmet } from './helmet';
import { hose } from './pack';
import { BUST, bindOf, body, tressOf } from './skin';
import { createRunner, femme, soldier, stance } from './soldier';
import { HEAD_SCALE, LOWEST, STYLE, STYLES, hair, styleOf, sway, tress } from './hair';
import { CH, lookOf } from './features';
import { FRAMES, PALETTE, sprite } from './face';
import { createBody } from './body';
import { REGIONS, armor } from './armor';
import { palette, skin } from './skin';

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
const HANGS = { mode: MODE.HANG, ground: false, wall: SIDE.NORTH, edge: 3 };
/** Every stance a runner is drawn in. */
const STANCES: [string, Partial<PlayerState>][] = [
  ['stand', {}],
  ['run', { vz: -6 }],
  ['sprint', { vz: -9 }],
  ['crouch', { mode: MODE.CROUCH }],
  ['slide', { mode: MODE.SLIDE, vz: -8 }],
  ['air', { mode: MODE.AIR, ground: false, vy: 2 }],
  ['hang', HANGS],
  ['climb', { ...HANGS, mode: MODE.CLIMB, t: 10 }],
  ['wall-run', { mode: MODE.WALLRUN, ground: false, wall: SIDE.EAST, vz: -7 }],
  ['rail gun', { railed: true, rail: 3 }],
  ['rifle', { rifled: true, rifle: 20 }],
  ['pistol', { ammo: 5 }],
  ['katana', { blade: true, wield: true }],
  ['seated', { mode: MODE.RIDE }],
];
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

describe('her armour', () => {
  const draw = (build: number, lod = 3) => {
    const out: number[] = [];
    const s = body(lod, build);
    skin(out, s, solve(rest([0, 0, 0], 0, build)), palette([1, 0, 0]));
    const n = out.length;
    armor(out, 0, s, lod > 2);
    return { out, n };
  };
  it('is his suit, plate for plate, cut on her body, but for the shoulders: her caps, his pieces', () => {
    const fem = REGIONS.filter(g => g.fem);
    const man = REGIONS.filter(g => g.man);
    expect([fem.length, man.length]).toEqual([2, 2]);
    for (const lod of [0, 1, 3]) {
      const [a, b] = [draw(0, lod), draw(F, lod)];
      expect(a.out.length - a.n).toBeGreaterThan(0);
      expect(b.out.length - b.n).toBeGreaterThan(0);
    }
  });
  it('wears one round cap on each shoulder, wholly on the trunk over the arm: no seam in steps', () => {
    const caps = REGIONS.filter(g => g.fem);
    expect(caps).toHaveLength(2);
    const s = body(3, F);
    const v = s.u ?? s.v;
    let arm = 0;
    s.l!.forEach((l, t) => {
      if (l == LIMB.ARM_L || l == LIMB.ARM_R) {
        for (let c = 0; c < 3; c++) {
          arm = Math.max(arm, v[s.t[t * 3 + c] * 6 + 1]);
        }
      }
    });
    for (const g of caps) {
      expect(g.round).toBeDefined();
      expect(g.y[0]).toBeGreaterThan(arm);
    }
  });
  it('has no plate standing over her shoulders, nor he over his', () => {
    const count = (build: number) => {
      const out: number[] = [];
      soldier(out, createRunner(who(), undefined, build), [1, 0, 0], 1, false, true);
      return out.length;
    };
    const [a, b] = [draw(0, 1), draw(F, 1)];
    const hairs: number[] = [];
    hair(hairs, [0, 0, 0], [0, 0, 0, 1], styleOf(1), tressOf(1), 1, sway(0, 0, 0));
    // Her vertices: his, with her armour for his, plus her hair.
    expect(count(F)).toBe(count(0) + (b.out.length - b.n) - (a.out.length - a.n) + hairs.length);
  });
  it.each(STANCES)('sits on her body in the stance: %s', (_, o) => {
    const r = createRunner(who(o), undefined, F);
    const out: number[] = [];
    const s = soldier(out, r, [1, 0, 0], 3, false, true)!;
    // Her own skeleton all the way: no copy of the pose fell back on his.
    const f = bindOf(F);
    for (const [a, b] of [
      [J.ARM_R, J.FOREARM_R],
      [J.FOREARM_L, J.HAND_L],
      [J.CHEST, J.NECK],
      [J.ARM_L, J.CLAVICLE_L],
    ]) {
      expect(dist(s.pos[a], s.pos[b])).toBeCloseTo(dist(f[a], f[b]), 5);
    }
    // Every plate vertex is by the skin it was cut from: within 6 cm of a skin vertex.
    const skinV: number[][] = [];
    const plates: number[][] = [];
    for (let i = 0; i < out.length; i += STRIDE) {
      (out[i + 8] == GLOSS ? plates : skinV).push([out[i], out[i + 1], out[i + 2]]);
    }
    expect(plates.length).toBeGreaterThan(1000);
    for (let i = 0; i < plates.length; i += 17) {
      const p = plates[i];
      expect(p.every(Number.isFinite)).toBe(true);
      let near = Infinity;
      for (let k = 0; k < skinV.length && near > 0.03; k += 2) {
        near = Math.min(near, dist(p, skinV[k]));
      }
      expect(near).toBeLessThan(0.06);
    }
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

describe('her hair', () => {
  const ids = Array.from({ length: 200 }, (_, i) => i);
  it('is one of five styles by her id, the same every time, each one someone’s', () => {
    expect(new Set(ids.map(id => styleOf(id))).size).toBe(STYLES);
    expect(ids.map(id => styleOf(id))).toEqual(ids.map(id => styleOf(id)));
    expect(ids.every(id => tressOf(id) == tressOf(id) && tressOf(id)[0] != 0.47)).toBe(true);
  });
  it.each(Object.entries(STYLE))(
    '%s stays on the head: over the chin, within its bounds',
    (_, k) => {
      for (const fine of [false, true]) {
        const m = tress(k, fine);
        expect(m.length % 24).toBe(0);
        // Far a few hundred triangles at most, close under two thousand.
        expect(m.length / 24).toBeLessThan(fine ? 1500 : 320);
        for (let i = 0; i < m.length; i += 8) {
          expect(m[i + 1]).toBeGreaterThan(LOWEST);
          expect(m[i + 1]).toBeLessThan(1.84);
          expect(Math.abs(m[i])).toBeLessThan(0.12);
          expect(m[i + 2]).toBeGreaterThan(-0.13);
          expect(m[i + 2]).toBeLessThan(0.19);
          expect(Math.hypot(m[i + 3], m[i + 4], m[i + 5])).toBeCloseTo(1, 3);
        }
      }
      expect(tress(k, true)).toBe(tress(k, true));
    },
  );
  it('differs from one style to another', () => {
    const sizes = Object.values(STYLE).map(k => tress(k, true).length);
    expect(new Set(sizes).size).toBeGreaterThan(2);
  });
  it.each(STANCES)('is clear of the trunk’s plates in the stance: %s', (_, o) => {
    for (const id of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(
      (id, _i, all) => all.findIndex(q => styleOf(q) == styleOf(id)) == all.indexOf(id),
    )) {
      const r = createRunner(who({ ...o, id }), undefined, F);
      const out: number[] = [];
      const s = soldier(out, r, [1, 0, 0], 1, false, true)!;
      const plates: number[][] = [];
      for (let i = 0; i < out.length; i += STRIDE) {
        // Not the forearms' plates: in a guard the fists are up by the face, as his are.
        const q = [out[i], out[i + 1], out[i + 2]];
        const arm = [J.FOREARM_L, J.FOREARM_R].some(j =>
          [0, 0.5, 1].some(
            t =>
              dist(
                q,
                s.pos[j].map((v, d) => v + (s.pos[j + 1][d] - v) * t),
              ) < 0.1,
          ),
        );
        if (out[i + 8] == GLOSS && !arm) {
          plates.push(q);
        }
      }
      const h: number[] = [];
      hair(h, s.pos[J.HEAD], s.rot[J.HEAD], styleOf(id), [1, 1, 1], 1);
      let near = Infinity;
      for (let i = 0; i < h.length; i += STRIDE * 3) {
        for (let k = 0; k < plates.length; k += 2) {
          near = Math.min(near, dist([h[i], h[i + 1], h[i + 2]], plates[k]));
        }
      }
      expect(near).toBeGreaterThan(0.01);
    }
  });
  it('is drawn on her and not on him, and tucked in under the helmet', () => {
    const count = (build: number, helmets: boolean) => {
      const out: number[] = [];
      soldier(out, createRunner(who(), undefined, build), [1, 0, 0], 1, helmets, true);
      return out.length;
    };
    expect(count(F, false)).toBeGreaterThan(count(0, false));
    // Under her helmet, no hair: she differs from him by the helmet alone, hers with no hose.
    const size = (draw: (out: number[]) => void) => {
      const out: number[] = [];
      draw(out);
      return out.length;
    };
    const at: [number, number, number] = [0, 0, 0];
    const his =
      size(o => helmet(o, at, [0, 0, 0, 1], [1, 0, 0], 1)) +
      size(o => hose(o, [0, 1.62, 0], [0, 0, 0, 1], [0, 1.4, 0], [0, 0, 0, 1], 1));
    const hers = size(o => helm(o, at, [0, 0, 0, 1], [1, 0, 0], 1));
    const plates = (build: number) => {
      const s = body(1, build);
      const out: number[] = [];
      skin(out, s, solve(rest([0, 0, 0], 0, build)), palette([1, 0, 0]));
      const n = out.length;
      armor(out, 0, s, false);
      return out.length - n;
    };
    // And by her armour for his.
    expect(count(F, true)).toBe(count(0, true) - his + hers + plates(F) - plates(0));
  });
  it('gives the same look for the same id and choice', () => {
    const look = () => {
      const out: number[] = [];
      soldier(out, createRunner(who({ id: 12 }), undefined, F), [1, 0, 0], 1, false, true);
      return out;
    };
    expect(look()).toEqual(look());
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
      expect(c.i.length / (a.m[ch].i.length || 1)).toBeGreaterThan(0.6);
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
