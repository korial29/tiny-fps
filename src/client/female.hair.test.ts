// The woman (BODY.FEMALE): her skeleton and skin against the man's, her armour and her hair in
// every stance, her hands on the weapons, her face on the HUD.
import { describe, expect, it } from 'vitest';
import { STILL } from '../shared/physics';
import { MODE, SIDE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { GLOSS, STRIDE } from './mesh';
import { BUILD, JOINT as J, rest, solve } from './rig';
import { helm } from './helm';
import { helmet } from './helmet';
import { hose } from './pack';
import { body, tressOf } from './skin';
import { createRunner, soldier } from './soldier';
import { LOWEST, STYLE, STYLES, hair, styleOf, tress } from './hair';
import { armor } from './armor';
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
