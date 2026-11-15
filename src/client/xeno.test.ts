import { describe, expect, it } from 'vitest';
import { ROLE } from '../shared/kit';
import { STILL } from '../shared/physics';
import { MODE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { MOVE, MOVES, createGait } from './gait';
import { JOINT as J, JOINTS, solve } from './rig';
import { KIND } from './features';
import { beast, body } from './skin';
import { animate, stance } from './soldier';
import { eyes, spines, tail } from './xeno';
import type { Vec3 } from './mesh';
import type { Quat } from './rig';

const ID: Quat = [0, 0, 0, 1];
const O: Vec3 = [0, 0, 0];
const at = (over: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
  x: 0,
  y: 0,
  z: 0,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
  ...over,
});
/** The vertices (x, y, z) of a list of STRIDE floats. */
const points = (v: number[]) =>
  Array.from({ length: v.length / 10 }, (_, i) => v.slice(i * 10, i * 10 + 3));

describe('the xenomorph’s skin', () => {
  it('is built at every level on the rig’s joints, with no human head, and fewer vertices than the man close up', () => {
    for (const lod of [0, 1, 2, 3]) {
      const s = beast(lod);
      expect(s.v.every(Number.isFinite)).toBe(true);
      expect(Math.max(...s.j)).toBeLessThan(JOINTS + 2);
      expect([...s.g].includes(KIND.HEAD)).toBe(false);
      expect(s.m).toEqual([]);
      expect(s.t.length % 3).toBe(0);
    }
    expect(beast(3).v.length).toBeLessThan(body(3).v.length / 2);
  });

  it('carries a long skull past the back of the head, and none on the own first-person body', () => {
    const zs = (lod: number) => {
      const s = beast(lod);
      return Array.from({ length: s.v.length / 6 }, (_, i) => s.v.slice(i * 6, i * 6 + 3));
    };
    const head = zs(3).filter(([, y]) => y > 1.58);
    expect(Math.max(...head.map(p => p[2]))).toBeGreaterThan(0.3);
    expect(Math.min(...head.map(p => p[2]))).toBeLessThan(-0.18);
    expect(Math.max(...zs(2).map(p => p[1]))).toBeLessThan(1.5);
  });
});

describe('its pieces', () => {
  it('draws a tail behind it at rest, which the sting arches up and forward past the head', () => {
    const tipOf = (sting: number) => {
      const v: number[] = [];
      tail(v, [0, 1, 0], ID, 0, 0, sting, [1, 0, 0], 2);
      expect(v.length).toBeGreaterThan(0);
      expect(v.every(Number.isFinite)).toBe(true);
      // The stinger's point is the last vertex.
      return v.slice(v.length - 10, v.length - 7);
    };
    const [rest, strike] = [tipOf(0), tipOf(1)];
    expect(rest[2]).toBeGreaterThan(1);
    expect(strike[2]).toBeLessThan(0);
    expect(strike[1]).toBeGreaterThan(1.6);
  });

  it('puts spines on the back and glowing eyes on the head', () => {
    const out = (f: (o: number[]) => void) => {
      const v: number[] = [];
      f(v);
      return points(v);
    };
    expect(out(o => spines(o, O, ID, 1)).every(([, , z]) => z > 0)).toBe(true);
    const lit: number[] = [];
    eyes(lit, O, ID, [1, 0, 0]);
    expect(lit.filter((_, i) => i % 10 == 8).every(l => l == -2)).toBe(true);
  });
});

describe('its pose', () => {
  it('crouches on a floor with its heels up: the knee ahead, the ankle high behind it, the toes ahead on the floor', () => {
    const run = (role: number) => {
      const book = new Map();
      const p = at();
      for (let k = 0; k < 60; k++) {
        animate(
          book,
          [p],
          1 / 60,
          undefined,
          undefined,
          undefined,
          undefined,
          new Map([[1, { role }]]),
        );
      }
      return stance(book.get(1)).s.pos;
    };
    const [x, m] = [run(ROLE.XENO), run(ROLE.MARINE)];
    // Forward is -z.
    expect(x[J.SHIN_R][2]).toBeLessThan(x[J.FOOT_R][2]);
    expect(x[J.TOE_R][2]).toBeLessThan(x[J.FOOT_R][2]);
    expect(x[J.FOOT_R][1]).toBeGreaterThan(m[J.FOOT_R][1] + 0.05);
    expect(x[J.TOE_R][1]).toBeLessThan(0.06);
    expect(x[J.PELVIS][1]).toBeLessThan(m[J.PELVIS][1] - 0.05);
  });

  it('faces the wall it clings to, the hands up on it and the feet under them', () => {
    expect(MOVES[MOVE.CLING]).toHaveLength(MOVES[MOVE.HANG].length);
    const g = createGait(0);
    // Looking away along x, on a wall toward -z (SIDE 4).
    const p = at({ yaw: Math.PI / 2, mode: MODE.CLING, wall: 4, vy: 2, ground: false });
    for (let k = 0; k < 90; k++) {
      g.update(p, 1 / 60);
    }
    const pose = g.pose();
    expect(Math.abs(Math.sin(pose.yaw))).toBeLessThan(0.1);
    const s = solve(pose);
    for (const h of [J.HAND_L, J.HAND_R]) {
      expect(s.pos[h][1]).toBeGreaterThan(s.pos[J.CHEST][1]);
      expect(s.pos[h][2]).toBeLessThan(-0.2);
    }
    for (const f of [J.FOOT_L, J.FOOT_R]) {
      expect(s.pos[f][1]).toBeLessThan(s.pos[J.PELVIS][1] - 0.3);
    }
  });
});

describe('its blows on the arms', () => {
  it('swipes the left claws with the left arm and the right with the right, the sting with neither', async () => {
    const { BLOW } = await import('../shared/constants');
    const { SIDE } = await import('./gait');
    expect([SIDE[BLOW.CLAW_L], SIDE[BLOW.CLAW_R], SIDE[BLOW.TAIL]]).toEqual([-1, 1, 0]);
  });
});

describe('its claws', () => {
  it('ends each finger and the thumb in a claw reaching past the bare hand’s fingertips', async () => {
    const { hand } = await import('./body');
    const draw = (claws: boolean) => {
      const v: number[] = [];
      // At the origin, fingers along -y, half open.
      hand(
        v,
        [0, 0, 0],
        [0, -1, 0],
        [1, 0, 0],
        [0, 0, -1],
        0.35,
        [0, 0, 0],
        0,
        0,
        undefined,
        [0, 0, 0],
        0,
        false,
        false,
        claws,
      );
      return points(v);
    };
    const [plain, clawed] = [draw(false), draw(true)];
    expect(clawed.length).toBeGreaterThan(plain.length);
    // Hooked toward the palm from the fingertips: past the bare hand on its palm's side (-x here).
    const reach = (ps: number[][]) => Math.min(...ps.map(p => p[0]));
    expect(reach(clawed)).toBeLessThan(reach(plain) - 0.01);
  });
});

describe('its face on the HUD', () => {
  it('has a head of its own in every frame, its eyes glowing but dead, and acid for its worst wounds', async () => {
    const { DEAD, FRAMES, LOOK, PALETTE, frame, sprite } = await import('./face');
    const has = (n: number, c: number) => sprite(n, LOOK.XENO).includes(PALETTE.indexOf(c));
    const [EYE, ACID] = [0xff3246ff, 0xff28e696];
    for (let n = 0; n < FRAMES; n++) {
      expect(sprite(n, LOOK.XENO)).not.toEqual(sprite(n, LOOK.MAN));
    }
    expect(has(frame(0, 0), EYE)).toBe(true);
    expect(has(DEAD, EYE)).toBe(false);
    expect(has(frame(0, 0), ACID)).toBe(false);
    expect(has(frame(4, 0), ACID)).toBe(true);
  });
});
