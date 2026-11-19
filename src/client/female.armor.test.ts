// The woman (BODY.FEMALE): her skeleton and skin against the man's, her armour and her hair in
// every stance, her hands on the weapons, her face on the HUD.
import { cigar } from './cigar';
import { describe, expect, it } from 'vitest';
import { STILL } from '../shared/physics';
import { MODE, SIDE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { GLOSS, STRIDE } from './mesh';
import { BUILD, JOINT as J, rest, solve } from './rig';
import { BELL, pads } from './pads';
import { bindOf, body, tressOf } from './skin';
import { createRunner, soldier } from './soldier';
import { hair, styleOf, sway } from './hair';
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

describe('her armour', () => {
  const draw = (build: number, lod = 3) => {
    const out: number[] = [];
    const s = body(lod, build);
    skin(out, s, solve(rest([0, 0, 0], 0, build)), palette([1, 0, 0]));
    const n = out.length;
    armor(out, 0, s, lod > 2);
    return { out, n };
  };
  it('is his suit, plate for plate, cut on her body; a bell on each shoulder, hers slimmer (the user, 2026-11-13)', () => {
    // The ninja's vest aside: a chest piece for each (armor.test.ts). The bells are no plate cut
    // out of the skin (pads.ts).
    const fem = REGIONS.filter(g => g.fem && !g.alone);
    const man = REGIONS.filter(g => g.man && !g.alone);
    expect([fem.length, man.length]).toEqual([0, 0]);
    for (const lod of [0, 1, 3]) {
      const [a, b] = [draw(0, lod), draw(F, lod)];
      expect(a.out.length - a.n).toBeGreaterThan(0);
      expect(b.out.length - b.n).toBeGreaterThan(0);
    }
  });
  it('wears a bell over each shoulder as he does, slimmer: four fifths of his', () => {
    const size = (build: number) => {
      const v: number[] = [];
      pads(v, solve(rest([0, 0, 0], 0, build)), build, [1, 1, 1], true);
      let [lo, hi] = [Infinity, -Infinity];
      for (let i = 0; i < v.length; i += STRIDE) {
        [lo, hi] = [Math.min(lo, v[i + 1]), Math.max(hi, v[i + 1])];
      }
      return hi - lo;
    };
    expect(size(F)).toBeCloseTo(size(0) * BELL.fem, 4);
    expect(BELL.fem).toBeLessThan(0.85);
  });
  it('differs from him by her armour for his, her bells for his, and her hair', () => {
    const count = (build: number) => {
      const out: number[] = [];
      soldier(out, createRunner(who(), undefined, build), [1, 0, 0], 1, false, true);
      return out.length;
    };
    const [a, b] = [draw(0, 1), draw(F, 1)];
    const hairs: number[] = [];
    hair(hairs, [0, 0, 0], [0, 0, 0, 1], styleOf(1), tressOf(1), 1, sway(0, 0, 0));
    // The bells are as many vertices on both; his cigar is not hers.
    const smoke: number[] = [];
    cigar(smoke, [0, 0, 0], [0, 0, 0, 1], false);
    expect(count(F)).toBe(
      count(0) + (b.out.length - b.n) - (a.out.length - a.n) + hairs.length - smoke.length,
    );
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
    // Every plate vertex is by the skin it was cut from: within 6 cm of a skin vertex, or of the
    // middle of a skin triangle or of one of its edges: on her fuller thighs and hips (2026-11-17)
    // two rings are up to 12 cm apart, and a plate 1 cm off the middle of such a triangle was 7 cm
    // from its corners.
    const skinV: number[][] = [];
    const plates: number[][] = [];
    for (let i = 0; i < out.length; i += 3 * STRIDE) {
      const t = [0, 1, 2].map(c => [0, 1, 2].map(j => out[i + c * STRIDE + j]));
      if (out[i + 8] == GLOSS) {
        plates.push(...t);
      } else {
        const mid = (...ps: number[][]) =>
          ps[0].map((_, j) => ps.reduce((sum, p) => sum + p[j], 0) / ps.length);
        skinV.push(...t, mid(t[0], t[1]), mid(t[1], t[2]), mid(t[2], t[0]), mid(...t));
      }
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
