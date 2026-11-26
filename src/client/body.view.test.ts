import { describe, expect, it } from 'vitest';
import { DASH_COOLDOWN, EYE, LOW_EYE } from '../shared/constants';
import { STILL } from '../shared/physics';
import { MODE, SIDE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { createBody } from './body';
import type { Body } from './body';
import { STRIDE, basis } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J } from './rig';
import { palette } from './skin';

const DT = 1 / 60;
const TEAM = [0.1, 0.8, 0.2];
const [JACKET, , PANTS, , , UPPER, SOLE] = palette(TEAM);
/** The vertical half of the field of view (70 degrees) and a wide screen. */
const [TAN, ASPECT, NEAR] = [Math.tan((35 * Math.PI) / 180), 16 / 9, 0.1];

const man = (o: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
  x: 0,
  y: 0,
  z: 0,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
  ...o,
});
const eyeOf = (p: PlayerState): Vec3 => [
  p.x,
  p.y + (p.mode == MODE.SLIDE || p.mode == MODE.CROUCH ? LOW_EYE : EYE),
  p.z,
];
const hang = man({
  mode: MODE.HANG,
  ground: false,
  y: 0.4,
  z: 5.43,
  wall: SIDE.NORTH,
  edge: 2.4,
});
const slide = man({ mode: MODE.SLIDE, vz: -8 });
const dash = man({ mode: MODE.AIR, ground: false, y: 0.3, vz: -16, dash: DASH_COOLDOWN - 2 });
const wall = man({ mode: MODE.WALLRUN, ground: false, y: 1.2, vz: -8, wall: SIDE.EAST });

/** A body that has watched `n` frames of `p`. */
const watch = (p: PlayerState, n: number, body = createBody()) => {
  for (let i = 0; i < n; i++) {
    body.update(p, DT);
  }
  return body;
};
const pose = (body: Body, p: PlayerState, pitch = 0) => body.pose(eyeOf(p), p.yaw, pitch)!;
/** A world point in the camera's right, up, forward. */
const local = (p: PlayerState, w: Vec3, pitch = 0): Vec3 => {
  const e = eyeOf(p);
  const d = [w[0] - e[0], w[1] - e[1], w[2] - e[2]];
  return basis(p.yaw, pitch).map(a => a[0] * d[0] + a[1] * d[1] + a[2] * d[2]) as Vec3;
};
/** Whether a point in camera space is on a wide screen, and how far from the camera it must be to be drawn. */
const inside = ([x, y, z]: Vec3) =>
  z > 0 && Math.abs(x) < z * TAN * ASPECT && Math.abs(y) < z * TAN;
const seen = (l: Vec3) => inside(l) && l[2] > NEAR;

interface Vert {
  at: Vec3;
  n: Vec3;
  c: number[];
}
/** The vertices drawn for a camera at the player's eye. */
const draw = (body: Body, p: PlayerState, pitch = 0, color = TEAM): Vert[] => {
  const out: number[] = [];
  body.draw(out, eyeOf(p), p.yaw, pitch, 0, color);
  expect(out.length % (3 * STRIDE)).toBe(0);
  return Array.from({ length: out.length / STRIDE }, (_, i) => {
    const v = out.slice(i * STRIDE, (i + 1) * STRIDE);
    return { at: [v[0], v[1], v[2]], n: [v[3], v[4], v[5]], c: [v[6], v[7], v[9]] };
  });
};
const colored = (v: Vert[], c: number[]) => v.filter(q => c.every((n, i) => q.c[i] == n));
const away = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('body', () => {
  it('keeps its geometry bounded: whole triangles, finite unit normals, the budget of the near skin', () => {
    for (const p of [
      man(),
      slide,
      hang,
      dash,
      wall,
      man({ stun: 40 }),
      man({ mode: MODE.CROUCH }),
    ]) {
      for (const pitch of [0, -1.2, 1]) {
        const v = draw(watch(p, 40), p, pitch);
        // The near runner minus its head, neck and fists, its arms close, plus two hands of under 8700 vertices each.
        expect(v.length).toBeGreaterThan(3500);
        // The pouch on the hip adds about 200 (the user, 2026-11-09).
        // 26000 until the hands took 1722 vertices more each (the user, 2026-11-26: a more real hand).
        expect(v.length).toBeLessThanOrEqual(30000);
        for (const { at, n } of v) {
          expect(at.every(Number.isFinite)).toBe(true);
          expect(Math.hypot(...n)).toBeCloseTo(1);
        }
      }
    }
  }, 30_000);

  describe('the view', () => {
    /** Every state the body takes. */
    const states = [
      man(),
      man({ mode: MODE.CROUCH }),
      slide,
      hang,
      { ...hang, mode: MODE.CLIMB, y: 1.8 },
      dash,
      wall,
      man({ stun: 40 }),
    ];

    // 1.4 s on a desk, five times that on a shared CI runner since the body grew (#86).
    it('never has a vertex in front of the near plane or inside the head', () => {
      for (const p of states) {
        const body = watch(p, 60);
        for (const pitch of [-1.4, -0.7, 0, 0.7, 1.4]) {
          for (const { at } of draw(body, p, pitch)) {
            // A sphere around the eye: the head that is not drawn.
            expect(away(at, eyeOf(p))).toBeGreaterThan(0.1);
            const l = local(p, at, pitch);
            expect(inside(l) && l[2] < NEAR).toBe(false);
          }
        }
      }
      // 5 s alone, 14 to 22 s in CI under coverage: a slow runner must not fail it.
    }, 60_000);

    it('puts the head where the camera is', () => {
      for (const p of states) {
        const head = pose(watch(p, 60), p).pos[J.HEAD];
        // Behind it and a little lower, more so on a ledge.
        expect(away(head, eyeOf(p))).toBeLessThan(p.mode == MODE.HANG ? 0.3 : 0.15);
      }
    });

    it('keeps the feet where they stand, however low the camera is', () => {
      for (const p of [man(), man({ mode: MODE.CROUCH })]) {
        const s = pose(watch(p, 60), p);
        for (const j of [J.FOOT_L, J.FOOT_R]) {
          expect(s.pos[j][1] - p.y).toBeGreaterThan(0.03);
          expect(s.pos[j][1] - p.y).toBeLessThan(0.12);
          expect(Math.hypot(s.pos[j][0] - p.x, s.pos[j][2] - p.z)).toBeLessThan(0.3);
        }
      }
    });

    it('shows the legs when looking down, and not looking ahead', () => {
      const p = man();
      const body = watch(p, 60);
      const shown = (pitch: number, c: number[]) =>
        colored(draw(body, p, pitch), c).filter(q => seen(local(p, q.at, pitch))).length;
      for (const c of [PANTS, UPPER, SOLE]) {
        expect(shown(0, c)).toBe(0);
        expect(shown(-1.2, c)).toBeGreaterThan(30);
      }
      // The chest too, looking steeply down.
      // Between the webbing's straps.
      expect(shown(-1.5, JACKET)).toBeGreaterThan(50);
    });

    it('leans the trunk with the look', () => {
      const p = man();
      const body = watch(p, 60);
      const chest = (pitch: number) => local(p, pose(body, p, pitch).pos[J.CHEST], 0)[2];
      // Looking down folds the chest back from the head, looking up arches it forward.
      expect(chest(-1.2)).toBeLessThan(chest(0));
      expect(chest(1.2)).toBeGreaterThan(chest(0));
    });
  });
});
