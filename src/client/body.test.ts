import { describe, expect, it } from 'vitest';
import { CUTS, DASH_COOLDOWN, EYE, GRAB_GAP, LOW_EYE, PLAYER_R } from '../shared/constants';
import { STILL } from '../shared/physics';
import { CUT, MODE, SIDE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { createBody, finger, hand, phalanges } from './body';
import type { Body } from './body';
import { MUZZLE, REAR, grip, gun, readout } from './gun';
import { BEHIND, axes, ends } from './katana';
import { STRIDE, add, basis, dot, sub } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, rest, solve, turn } from './rig';
import { CUFF, CUFF_SIDES, body as skinOf, palette } from './skin';

const DT = 1 / 60;
const TEAM = [0.1, 0.8, 0.2];
const [JACKET, , PANTS, FLESH, HAIR, UPPER, SOLE, GLOVE, SHADES] = palette(TEAM);
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
/** A body that has run `n` frames along -z at speed v, a step of v / 60 a frame. */
const run = (v: number, n: number, body = createBody()) => {
  const p = man({ vz: -v });
  for (let i = 0; i < n; i++) {
    p.z -= v * DT;
    body.update(p, DT);
  }
  return { body, p };
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
/** The hands, wrists in the camera's space. */
const hands = (p: PlayerState, body: Body, pitch = 0) => {
  const s = pose(body, p, pitch);
  return [J.HAND_L, J.HAND_R].map(j => local(p, s.pos[j], pitch));
};

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
/** Vertices of the palm, of a finger or the thumb, and of a hand: a tube of the cuff's sides and 5 rings, one of 6 sides and 6. */
const [PALM, FINGER] = [21 * CUFF_SIDES, 162];
const HAND = PALM + 5 * FINGER;
const away = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('body', () => {
  it('shows nothing before it knows the player, or when it is gone, and knows its id', () => {
    const body = createBody();
    const out: number[] = [];
    expect(body.id).toBe(-1);
    expect(body.pose([0, EYE, 0], 0, 0)).toBeUndefined();
    body.draw(out, [0, EYE, 0], 0, 0);
    expect(out).toEqual([]);
    watch(man({ id: 4 }), 3, body);
    expect(body.pose([0, EYE, 0], 0, 0)).toBeDefined();
    expect(body.id).toBe(4);
    body.update(undefined, DT);
    body.draw(out, [0, EYE, 0], 0, 0);
    expect(out).toEqual([]);
    expect(body.id).toBe(-1);
  });

  it('draws nothing while the camera is away from the body', () => {
    const body = watch(man(), 30);
    const out: number[] = [];
    body.draw(out, [0, EYE + 3, 0], 0, 0);
    body.draw(out, [4, EYE, 0], 0, 0);
    expect(out).toEqual([]);
    // The bob and a respawn's eased half step are well within it.
    body.draw(out, [0.03, EYE + 0.04, 0], 0, 0);
    expect(out.length).toBeGreaterThan(0);
  });

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
        // The near runner minus its head, neck and fists, plus two hands of under a thousand vertices each.
        expect(v.length).toBeGreaterThan(3500);
        expect(v.length).toBeLessThanOrEqual(5000);
        for (const { at, n } of v) {
          expect(at.every(Number.isFinite)).toBe(true);
          expect(Math.hypot(...n)).toBeCloseTo(1);
        }
      }
    }
  });

  it('wears the colours of the team: jacket, gloves, trousers and shoes, with no head', () => {
    const p = man();
    const body = watch(p, 40);
    const v = draw(body, p, -1.2);
    for (const c of [JACKET, GLOVE, PANTS, UPPER, SOLE]) {
      expect(colored(v, c).length).toBeGreaterThan(30);
    }
    for (const c of [FLESH, HAIR, SHADES]) {
      expect(colored(v, c)).toHaveLength(0);
    }
    // Another team, another jacket, nothing else changes.
    const other = draw(body, p, -1.2, [0.9, 0.1, 0.1]);
    expect(other).toHaveLength(v.length);
    expect(colored(other, [0.9, 0.1, 0.1]).length).toBe(colored(v, JACKET).length);
    expect(colored(other, GLOVE).length).toBe(colored(v, GLOVE).length);
  });

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
    });

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
      expect(shown(-1.5, JACKET)).toBeGreaterThan(100);
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

  describe('arms', () => {
    it('hang along the body when idle, either side, out of the view', () => {
      const p = man();
      const [l, r] = hands(p, watch(p, 60));
      expect(l[0]).toBeLessThan(-0.15);
      expect(r[0]).toBeGreaterThan(0.15);
      for (const h of [l, r]) {
        expect(h[1]).toBeLessThan(-0.55);
        expect(seen(h)).toBe(false);
      }
      // No glove on the screen at all.
      expect(colored(draw(watch(p, 60), p), GLOVE).filter(g => seen(local(p, g.at)))).toHaveLength(
        0,
      );
    });

    it('swing like a pendulum with the stride: up into the lower view ahead, out of it behind, against each other', () => {
      for (const v of [6, 10]) {
        const body = createBody();
        const q = man({ vz: -v });
        const [gap, up, shown] = [[], [], []] as number[][];
        for (let i = 0; i < 150; i++) {
          q.z -= v * DT;
          body.update(q, DT);
          const [l, r] = hands(q, body);
          if (i > 60) {
            gap.push(l[2] - r[2]);
            up.push(r[1]);
            shown.push(
              colored(draw(body, q), GLOVE).filter(
                g => seen(local(q, g.at)) && local(q, g.at)[0] > 0,
              ).length,
            );
          }
        }
        // When one hand is forward the other is back, and then the other way round.
        expect(Math.max(...gap)).toBeGreaterThan(0.06);
        expect(Math.min(...gap)).toBeLessThan(-0.06);
        // It rises into the lower view, and drops below it again: in sight on some frames, out of it on others.
        expect(Math.max(...up)).toBeGreaterThan(-0.3);
        expect(Math.min(...up)).toBeLessThan(-0.5);
        expect(Math.max(...shown)).toBeGreaterThan(50);
        expect(Math.min(...shown)).toBe(0);
      }
    });

    it('swing higher and wider with the speed, a sprint the highest', () => {
      const range = (speed: number) => {
        const body = createBody();
        const q = man({ vz: -speed });
        const ys: number[] = [];
        for (let i = 0; i < 240; i++) {
          q.z -= speed * DT;
          body.update(q, DT);
          ys.push(hands(q, body)[1][1]);
        }
        return [Math.min(...ys), Math.max(...ys)];
      };
      const [walk, jog, sprint] = [range(1.5), range(5), range(10)];
      expect(jog[1]).toBeGreaterThan(walk[1] + 0.1);
      expect(sprint[1]).toBeGreaterThan(jog[1] + 0.03);
      expect(sprint[1] - sprint[0]).toBeGreaterThan(jog[1] - jog[0]);
    });

    it('pump with the stride, and stay still when standing', () => {
      const { body, p } = run(5, 90);
      p.vz = 0;
      watch(p, 120, body);
      const first = hands(p, body).flat();
      watch(p, 600, body);
      hands(p, body)
        .flat()
        .forEach((v, i) => expect(v).toBeCloseTo(first[i], 4));
    });

    it('swing wider on a sprint than on a jog', () => {
      const travel = (speed: number) => {
        const body = createBody();
        const q = man({ vz: -speed });
        let [lo, hi] = [Infinity, -Infinity];
        for (let i = 0; i < 240; i++) {
          q.z -= speed * DT;
          body.update(q, DT);
          const f = hands(q, body)[1][2];
          [lo, hi] = [Math.min(lo, f), Math.max(hi, f)];
        }
        return hi - lo;
      };
      expect(travel(9)).toBeGreaterThan(travel(3) * 1.4);
    });

    it('go up on a jump and out in a fall', () => {
      const idle = hands(man(), watch(man(), 60));
      const up = man({ mode: MODE.AIR, ground: false, y: 0.5, vy: 4 });
      const fall = { ...up, vy: -4 };
      const [rise, drop] = [up, fall].map(p => hands(p, watch(p, 40)));
      for (const i of [0, 1]) {
        expect(rise[i][1]).toBeGreaterThan(idle[i][1] + 0.12);
        expect(Math.abs(drop[i][0])).toBeGreaterThan(Math.abs(idle[i][0]) + 0.05);
      }
    });

    it('flail out and up in a stumble, swinging, and drop back when it is over', () => {
      const rest = man();
      const calm = hands(rest, watch(rest, 40));
      const p = man({ stun: 40 });
      const body = watch(p, 20);
      const swing = Array.from({ length: 12 }, () => hands(p, watch(p, 1, body)));
      for (const i of [0, 1]) {
        // Out to the sides and higher than at rest, and swinging: some frames on the hand is somewhere else.
        expect(Math.abs(swing[0][i][0])).toBeGreaterThan(Math.abs(calm[i][0]) + 0.1);
        const ys = swing.map(h => h[i][1]);
        expect(Math.max(...ys)).toBeGreaterThan(calm[i][1] + 0.1);
        expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.1);
      }
      hands(rest, watch(rest, 60, body)).forEach((h, i) => {
        expect(h[0]).toBeCloseTo(calm[i][0], 1);
        expect(h[1]).toBeCloseTo(calm[i][1], 1);
      });
    });

    it('drive straight forward on a dash', () => {
      for (const h of hands(dash, watch(dash, 20))) {
        expect(h[2]).toBeGreaterThan(0.3);
        expect(h[1]).toBeGreaterThan(-0.2);
        expect(Math.abs(h[0])).toBeLessThan(0.25);
        expect(seen(h)).toBe(true);
      }
    });

    it('reach for the ledge in a hang, wherever it is, a hand-width apart', () => {
      for (const edge of [2.4, 3.1]) {
        const p = { ...hang, y: edge - 2, edge };
        const s = pose(watch(p, 40), p);
        const [l, r] = [J.HAND_L, J.HAND_R].map(j => s.pos[j]);
        for (const w of [l, r]) {
          // The wrist on the ledge's top, a hand short of its lip, the fingers over it.
          expect(w[1]).toBeGreaterThan(edge - 0.12);
          expect(w[1]).toBeLessThan(edge + 0.15);
          expect(p.z - w[2]).toBeGreaterThan(PLAYER_R + GRAB_GAP - 0.2);
          expect(p.z - w[2]).toBeLessThan(PLAYER_R + GRAB_GAP);
        }
        expect(r[0] - l[0]).toBeGreaterThan(0.15);
        expect(r[0] - l[0]).toBeLessThan(0.35);
      }
    });

    it('push down in the lower view as the body rises past the ledge in a climb', () => {
      const body = watch(hang, 30);
      const heights: number[] = [];
      for (const y of [0.4, 1, 1.6, 2.2, 2.4]) {
        const p = { ...hang, mode: MODE.CLIMB, y };
        watch(p, 8, body);
        heights.push(hands(p, body)[0][1]);
      }
      // The hands start above the eye and end low in the view, never out of reach.
      expect(heights[0]).toBeGreaterThan(0);
      expect(heights.at(-1)).toBeLessThan(-0.15);
      expect(heights.at(-1)).toBeGreaterThan(-0.45);
      expect(heights.every((h, i) => !i || h <= heights[i - 1] + 1e-6)).toBe(true);
    });

    it('brush the wall with the hand on its side in a wall-run', () => {
      for (const [side, yaw, toward] of [
        [SIDE.WEST, 0, -1],
        [SIDE.EAST, 0, 1],
        [SIDE.EAST, Math.PI, -1],
      ]) {
        const p = { ...wall, wall: side, yaw, vz: -8 * Math.cos(yaw) };
        const [l, r] = hands(p, watch(p, 60));
        const [near, far] = toward < 0 ? [l, r] : [r, l];
        expect(Math.abs(near[0])).toBeGreaterThan(0.36);
        expect(Math.sign(near[0])).toBe(toward);
        expect(Math.abs(near[0])).toBeGreaterThan(Math.abs(far[0]));
        expect(seen(near)).toBe(true);
      }
    });

    it('trail one hand low and wide in a slide', () => {
      const [l, r] = hands(slide, watch(slide, 40));
      expect(r[1]).toBeLessThan(l[1]);
      expect(r[0]).toBeGreaterThan(0.3);
    });
  });

  describe('hands', () => {
    /** How far the right hand's fingers go past the wrist, and how wide they spread there. */
    const fingers = (p: PlayerState, body: Body) => {
      const s = pose(body, p);
      const [wrist, f, thumb] = [
        s.pos[J.HAND_R],
        turn(s.rot[J.HAND_R], [0, -1, 0]),
        turn(s.rot[J.HAND_R], [0, 0, -1]),
      ];
      const along = (v: Vert, a: Vec3) =>
        (v.at[0] - wrist[0]) * a[0] + (v.at[1] - wrist[1]) * a[1] + (v.at[2] - wrist[2]) * a[2];
      // The glove around the right wrist, not the left hand's.
      const glove = colored(draw(body, p), GLOVE).filter(
        v => away(v.at, wrist) < 0.25 && v.at[0] > eyeOf(p)[0],
      );
      const tips = glove.filter(v => along(v, f) > 0.1).map(v => along(v, thumb));
      return {
        reach: Math.max(...glove.map(v => along(v, f))),
        spread: Math.max(...tips) - Math.min(...tips),
      };
    };
    const running = (v: number) => {
      const { body, p } = run(v, 120);
      return fingers(p, body);
    };

    it('close into a loose fist on a run, tighter on a sprint', () => {
      const [idle, jog, fast] = [fingers(man(), watch(man(), 60)), running(5.5), running(10)];
      for (const fist of [idle, jog]) {
        expect(fist.reach).toBeLessThan(0.14);
      }
      expect(fast.reach).toBeLessThan(jog.reach);
      expect(fast.spread).toBeLessThan(jog.spread);
    });

    it('open and spread on a ledge, against a wall, in the air and flat in a slide', () => {
      const fist = running(5.5);
      for (const p of [hang, wall, slide, man({ mode: MODE.AIR, ground: false, y: 1, vy: -3 })]) {
        const open = fingers(p, watch(p, 90));
        expect(open.reach).toBeGreaterThan(fist.reach + 0.04);
        expect(open.spread).toBeGreaterThan(fist.spread);
      }
    });

    it('are a palm, four fingers and a thumb in the glove colour, on a thinner wrist', () => {
      const p = man();
      const v = draw(watch(p, 60), p);
      // The sleeve's cuff, which is glove too, is a few dozen vertices; the hands are the rest.
      const glove = colored(v, GLOVE).length;
      expect(glove).toBeGreaterThanOrEqual(2 * HAND);
      expect(glove).toBeLessThan(2 * HAND + 200);
    });

    describe('as meshes', () => {
      /** The vertices of a tube as it is drawn: the first and last are its root ring and its tip. */
      const edgeKey = (a: Vec3, b: Vec3) => {
        const k = (v: Vec3) => v.map(c => Math.round(c * 1e6)).join();
        return [k(a), k(b)].sort().join('|');
      };
      /** The tubes of a hand at `curl` in its own space: the palm, then the four fingers and the thumb. */
      const tubes = (curl: number) => {
        const out: number[] = [];
        hand(out, [0, 0, 0], [0, 0, 1], [0, 1, 0], [1, 0, 0], curl, [1, 1, 1]);
        const v = Array.from({ length: out.length / STRIDE }, (_, i) => ({
          at: out.slice(i * STRIDE, i * STRIDE + 3) as Vec3,
          n: out.slice(i * STRIDE + 3, i * STRIDE + 6) as Vec3,
        }));
        expect(v).toHaveLength(HAND);
        return [
          v.slice(0, PALM),
          ...Array.from({ length: 5 }, (_, i) =>
            v.slice(PALM + i * FINGER, PALM + (i + 1) * FINGER),
          ),
        ];
      };
      const curls = [0, 0.4, 0.75, 1];

      it('stay under the 1026 vertices of the segments they replace', () => {
        expect(HAND).toBeLessThanOrEqual(1026);
      });

      it('make each finger and the thumb one closed surface: no cap or face between its phalanges', () => {
        for (const curl of curls) {
          for (const t of tubes(curl).slice(1)) {
            const uses = new Map<string, number>();
            for (let i = 0; i < t.length; i += 3) {
              for (let j = 0; j < 3; j++) {
                const k = edgeKey(t[i + j].at, t[i + ((j + 1) % 3)].at);
                uses.set(k, (uses.get(k) ?? 0) + 1);
              }
            }
            const open = [...uses.values()].filter(n => n != 2);
            // Every edge joins two triangles but the six of the root ring, which the palm closes.
            expect(open).toHaveLength(6);
            expect(open.every(n => n == 1)).toBe(true);
          }
        }
      });

      /** Whether `p` is inside the closed mesh `t` (triangles as vertices three by three): a ray along +x crosses it an odd number of times. */
      const inside = (t: { at: Vec3 }[], p: Vec3) => {
        let hits = 0;
        for (let i = 0; i < t.length; i += 3) {
          const [a, b, c] = [t[i].at, t[i + 1].at, t[i + 2].at];
          const [e1, e2] = [sub(b, a), sub(c, a)];
          // Moller-Trumbore with the direction (1, 0, 0).
          const h: Vec3 = [0, -e2[2], e2[1]];
          const det = e1[1] * h[1] + e1[2] * h[2];
          if (Math.abs(det) < 1e-15) {
            continue;
          }
          const s = sub(p, a);
          const u = (s[1] * h[1] + s[2] * h[2]) / det;
          const q: Vec3 = [
            s[1] * e1[2] - s[2] * e1[1],
            s[2] * e1[0] - s[0] * e1[2],
            s[0] * e1[1] - s[1] * e1[0],
          ];
          const v = q[0] / det;
          const d = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
          if (u >= 0 && v >= 0 && u + v <= 1 && d > 0) {
            hits++;
          }
        }
        return hits % 2 == 1;
      };

      it('grow out of the palm: the middle of each root ring is in it, in a fist and open', () => {
        for (const curl of curls) {
          const [palm, ...rest] = tubes(curl);
          for (const t of rest) {
            // The root ring is the open end of the tube: the vertices of the edges used once.
            const uses = new Map<string, Vec3[]>();
            for (let i = 0; i < t.length; i += 3) {
              for (let j = 0; j < 3; j++) {
                const [a, b] = [t[i + j].at, t[i + ((j + 1) % 3)].at];
                const k = edgeKey(a, b);
                uses.set(k, uses.has(k) ? [] : [a, b]);
              }
            }
            const root = [...uses.values()].filter(e => e.length);
            expect(root).toHaveLength(6);
            const mid = root
              .reduce((m, [a]) => add(m, a), [0, 0, 0] as Vec3)
              .map(c => c / 6) as Vec3;
            // A millimetre back: the ring lies in the plane of the palm's last ring, where a ray is ambiguous.
            expect(inside(palm, add(mid, [0, 0, -0.001]))).toBe(true);
          }
        }
      });

      it('share their vertices smoothly: one normal where triangles meet, turning gently along a finger', () => {
        for (const curl of curls) {
          for (const t of tubes(curl)) {
            const at = new Map<string, Vec3>();
            for (const { at: a, n } of t) {
              expect(Math.hypot(...n)).toBeCloseTo(1);
              const k = a.map(c => Math.round(c * 1e6)).join();
              const was = at.get(k);
              if (was) {
                expect(away(was, n)).toBeLessThan(1e-5);
              }
              at.set(k, n);
            }
            // Along a finger's edge the normal never turns more than 80 degrees, the knuckle of a fist included;
            // the palm's side, a flat edge of the few-sided ring, 110.
            const most = t.length == PALM ? 110 : 80;
            for (let i = 0; i < t.length; i += 3) {
              for (let j = 0; j < 3; j++) {
                expect(dot(t[i + j].n, t[i + ((j + 1) % 3)].n)).toBeGreaterThan(
                  Math.cos((most * Math.PI) / 180),
                );
              }
            }
          }
        }
      });

      it('keep the length of the fingers from an open hand to a fist, the thumb too', () => {
        const length = (curl: number, i: number) => {
          const rings = finger([0, 0, 0], ...phalanges(curl, i), 0.04, 0.01, [0, 0, 1]);
          return rings.slice(1).reduce((n, [c], k) => n + away(c, rings[k][0]), 0);
        };
        for (let i = 0; i < 4; i++) {
          const open = length(0, i);
          expect(open).toBeCloseTo(0.086, 2);
          // The knuckle is a curve, which takes a little of the length.
          expect(length(1, i)).toBeLessThan(open);
          expect(length(1, i)).toBeGreaterThan(open * 0.82);
        }
      });

      it('start at the sleeve: the palm begins on the ring of the cuff, vertex for vertex', () => {
        const [rim, wrist] = [skinOf(2).v, solve(rest()).pos[J.HAND_R]];
        const cuff: Vec3[] = [];
        for (let i = 0; i < rim.length; i += 6) {
          // The right arm's ring at y = 0.925 (the sleeve ends there), in the hand's space.
          if (rim[i] > 0 && Math.abs(rim[i + 1] - CUFF[0]) < 1e-6) {
            cuff.push([-rim[i + 2], rim[i] - wrist[0], wrist[1] - rim[i + 1]]);
          }
        }
        expect(cuff).toHaveLength(CUFF_SIDES);
        const [palm] = tubes(0.5);
        const ring = palm
          .filter(v => Math.abs(v.at[2] - (wrist[1] - CUFF[0])) < 1e-6)
          .map(v => v.at);
        for (const c of cuff) {
          expect(Math.min(...ring.map(r => away(r, c)))).toBeLessThan(1e-4);
        }
      });
    });
  });

  describe('legs', () => {
    it('are the runners: the gait strides one foot forward while the other is back', () => {
      const body = createBody();
      const p = man({ vz: -6 });
      const gap: number[] = [];
      for (let i = 0; i < 120; i++) {
        p.z -= 6 * DT;
        body.update(p, DT);
        const s = pose(body, p);
        gap.push(s.pos[J.FOOT_L][2] - s.pos[J.FOOT_R][2]);
      }
      expect(Math.max(...gap)).toBeGreaterThan(0.3);
      expect(Math.min(...gap)).toBeLessThan(-0.3);
    });

    it('put the lead leg out in front, low, in a slide, the other foot by the hip', () => {
      const s = pose(watch(slide, 60), slide);
      const ahead = (hip: number, foot: number) => s.pos[hip][2] - s.pos[foot][2];
      const legs = [
        [J.THIGH_L, J.FOOT_L],
        [J.THIGH_R, J.FOOT_R],
      ];
      // Forward is -z: one foot is well ahead of its hip, and both are low.
      expect(Math.max(...legs.map(([h, f]) => ahead(h, f)))).toBeGreaterThan(0.4);
      for (const [, foot] of legs) {
        expect(s.pos[foot][1] - slide.y).toBeLessThan(0.5);
      }
    });
  });

  it('eases between poses with no snapping, and settles', () => {
    const ground = man();
    /** The largest move of a hand, in the view, or a foot, from the player, in a frame, over `per` frames of each state in turn. */
    const worst = (steps: PlayerState[], per: number) => {
      const body = watch(steps[0], 30);
      // The camera eases to the eye height of the mode, as in effects.ts.
      let h = eyeOf(steps[0])[1];
      const joints = (p: PlayerState) => {
        h += (eyeOf(p)[1] - h) * (1 - Math.exp(-14 * DT));
        const s = body.pose([p.x, h, p.z], p.yaw, -1)!;
        return [
          ...[J.HAND_L, J.HAND_R].flatMap(j =>
            local({ ...p, y: h - EYE, mode: MODE.GROUND }, s.pos[j], -1),
          ),
          ...[J.FOOT_L, J.FOOT_R].flatMap(j => s.pos[j].map((v, i) => v - [p.x, p.y, p.z][i])),
        ];
      };
      let [prev, most] = [joints(steps[0]), 0];
      for (const p of steps) {
        for (let i = 0; i < per; i++) {
          body.update(p, DT);
          const now = joints(p);
          most = Math.max(most, ...now.map((v, k) => Math.abs(v - prev[k])));
          prev = now;
        }
      }
      return most;
    };
    // The states a few metres apart in height would be a teleport, which is not what is measured.
    const [low, flat] = [
      { ...wall, y: 0 },
      { ...dash, y: 0 },
    ];
    for (const [a, b] of [
      [ground, slide],
      [slide, ground],
      [ground, flat],
      [flat, ground],
      [ground, low],
      [low, ground],
      [{ ...ground, z: hang.z }, hang],
    ]) {
      expect(worst([a, b], 90)).toBeLessThan(0.35);
    }
    const [settled, again] = [
      hands(hang, watch(hang, 200)).flat(),
      hands(hang, watch(hang, 800)).flat(),
    ];
    settled.forEach((v, i) => expect(again[i]).toBeCloseTo(v, 3));
  });
});

describe('the gun in the right hand', () => {
  const armed = (o: Partial<PlayerState> = {}) => man({ ...o, ammo: 30 });
  /** The cyan glow of the gun: bright green, over a violet that is not. */
  const glow = (v: Vert[]) => v.filter(q => q.c[1] > 1.5);
  const GRIP: Vec3 = [0.22, -0.25, 0.4];

  it('is not there without the gun, nor while down', () => {
    expect(glow(draw(watch(man(), 60), man()))).toHaveLength(0);
    const down = armed({ down: 60 });
    const body = watch(down, 60);
    expect(body.pose(eyeOf(down), 0, 0)).toBeUndefined();
    const out: number[] = [];
    body.draw(out, eyeOf(down), 0, 0);
    expect(out).toEqual([]);
  });

  it('is in the lower right of the view, in front of the camera, aimed at the crosshair', () => {
    const p = armed();
    const v = draw(watch(p, 60), p);
    const g = glow(v).map(q => local(p, q.at));
    expect(g.length).toBeGreaterThan(50);
    // The gun is in the lower right: nearly all of it on the screen, none left of the middle.
    expect(g.filter(seen).length).toBeGreaterThan(g.length * 0.7);
    for (const l of g) {
      expect(l[0]).toBeGreaterThan(0);
    }
    const body = watch(p, 60);
    const [mx, my, mz] = body.muzzle();
    expect(mx).toBeGreaterThan(0.05);
    expect(mx).toBeLessThan(0.3);
    expect(my).toBeLessThan(0.1);
    expect(my).toBeGreaterThan(-0.35);
    expect(mz).toBeGreaterThan(0.6);
    // The muzzle is on the screen, between the grip and the crosshair.
    expect(seen([mx, my, mz])).toBe(true);
    expect(mx).toBeLessThan(GRIP[0] + 0.02);
  });

  it('is held on the grip: the hand is where the gun puts its grip, the back of the hand to its right', () => {
    const p = armed();
    const body = watch(p, 90);
    const s = pose(body, p);
    const wrist = local(p, s.pos[J.HAND_R]);
    const q = s.rot[J.HAND_R];
    // The middle of the grip is 8 cm along the fingers and 2 cm toward the palm from the wrist.
    const g = local(
      p,
      [0, 1, 2].map(
        i => s.pos[J.HAND_R][i] + turn(q, [0, -1, 0])[i] * 0.078 - turn(q, [1, 0, 0])[i] * 0.022,
      ) as Vec3,
    );
    expect(away(g, GRIP)).toBeLessThan(0.02);
    expect(away(wrist, g)).toBeCloseTo(Math.hypot(0.078, 0.022), 2);
    // The back of the hand looks right, and the fingers go forward and down: around a grip that rises.
    const back = turn(q, [1, 0, 0]);
    expect(back[0]).toBeGreaterThan(0.9);
  });

  it('sways with the run: the hand and the muzzle move with the stride, less than the free arm', () => {
    const ys: number[] = [];
    const bob = createBody();
    const q = armed({ vz: -9 });
    for (let i = 0; i < 80; i++) {
      q.z -= 9 * DT;
      bob.update(q, DT);
      if (i > 40) {
        ys.push(bob.muzzle()[1]);
      }
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.005);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.1);
  });

  it('kicks back and up with a shot, and comes back', () => {
    const p = armed();
    const body = watch(p, 60);
    const rest = body.muzzle();
    body.update(p, DT, 1);
    const kicked = body.muzzle();
    expect(kicked[2]).toBeLessThan(rest[2] - 0.03);
    expect(kicked[1]).toBeGreaterThan(rest[1] - 0.02);
    body.update(p, DT, 0);
    expect(away(body.muzzle(), rest)).toBeLessThan(1e-3);
  });

  it('rises from below when taken', () => {
    const p = armed();
    const body = createBody();
    body.update(man(), DT);
    for (let i = 0; i < 3; i++) {
      body.update(man(), DT);
    }
    body.update(p, DT);
    const low = body.muzzle()[1];
    for (let i = 0; i < 60; i++) {
      body.update(p, DT);
    }
    expect(body.muzzle()[1]).toBeGreaterThan(low + 0.1);
  });

  it('leaves the right hand to the ledge on a hang, and the wall on a wall-run, and shows no gun there', () => {
    const h = armed({ ...hang });
    const hung = draw(watch(h, 120), h);
    expect(glow(hung).length).toBe(0);
    const w = armed({ ...wall });
    // A wall on the east is on the right: that hand is busy; one on the left leaves it free.
    expect(glow(draw(watch(w, 120), w)).length).toBe(0);
    const left = armed({ ...wall, wall: SIDE.WEST });
    expect(glow(draw(watch(left, 120), left)).length).toBeGreaterThan(50);
  });

  it('shows it again after the hang', () => {
    const h = armed({ ...hang });
    const body = watch(h, 120);
    const g = armed();
    for (let i = 0; i < 60; i++) {
      body.update(g, DT);
    }
    const out: number[] = [];
    body.draw(out, eyeOf(g), 0, 0, 0, TEAM);
    expect(out.length).toBeGreaterThan(0);
    expect(glow(draw(body, g)).length).toBeGreaterThan(50);
  });

  it('keeps the arm within its length and the vertices finite, whatever the pose', () => {
    for (const o of [
      {},
      { vz: -9 },
      { mode: MODE.SLIDE, vz: -8 },
      { mode: MODE.AIR, ground: false, vy: 4 },
      { stun: 20 },
      dash,
    ]) {
      const p = armed(o);
      const body = watch(p, 90);
      const s = pose(body, p, 0.5);
      for (const [a, b] of [
        [J.ARM_R, J.FOREARM_R],
        [J.FOREARM_R, J.HAND_R],
      ]) {
        expect(away(s.pos[a], s.pos[b])).toBeGreaterThan(0.2);
        expect(away(s.pos[a], s.pos[b])).toBeLessThan(0.31);
      }
      const out: number[] = [];
      body.draw(out, eyeOf(p), p.yaw, 0.5, 0, TEAM);
      expect(out.every(Number.isFinite)).toBe(true);
    }
  });

  it('leaves the left hand hanging out of view while it stands with the gun, and swings it into view to run', () => {
    const idle = armed();
    const [still] = hands(idle, watch(idle, 90));
    expect(seen(still)).toBe(false);
    expect(still[1]).toBeLessThan(-0.45);
    // Running, it swings up into the view again.
    const run = armed({ vz: -9 });
    const body = createBody();
    const left: boolean[] = [];
    for (let i = 0; i < 120; i++) {
      run.z -= 9 * DT;
      body.update(run, DT);
      left.push(seen(hands(run, body)[0]));
    }
    expect(left.slice(60)).toContain(true);
    expect(left.slice(60)).toContain(false);
  });

  it('keeps the gun in a narrow screen: the grip comes in with the aspect', () => {
    const p = armed();
    const side = (aspect: number) => {
      const body = createBody();
      for (let i = 0; i < 90; i++) {
        body.update(p, DT, 0, aspect);
      }
      return body.muzzle()[0];
    };
    expect(side(1.6)).toBeGreaterThan(0.1);
    expect(side(0.55)).toBeLessThan(side(1.6) - 0.1);
    // Inside the view of a phone held upright.
    expect(side(0.55)).toBeLessThan(0.45 * TAN * 0.55 * 2);
  });
});

describe('the ammo on the back of the gun', () => {
  const armed = (ammo: number) => man({ ammo });
  /** The digits drawn last: their vertices as the body drew them. */
  const digits = (p: PlayerState, body = watch(p, 60)) => {
    const out: number[] = [];
    body.draw(out, eyeOf(p), 0, 0, 0, TEAM);
    return out.slice(out.length - readout(p.ammo).length);
  };

  it('shows the digits of the ammo, from the predicted state of each frame', () => {
    const p = armed(30);
    const body = watch(p, 60);
    expect(digits(p, body).length).toBe(readout(30).length);
    const q = armed(31);
    body.update(q, DT);
    expect(digits(q, body).length).toBe(readout(31).length);
    expect(readout(31).length).not.toBe(readout(30).length);
  });

  it('are cyan, and red at ten and under', () => {
    /** The last vertex drawn: a digit's. */
    const last = (n: number) => digits(armed(n)).slice(-STRIDE);
    expect(last(30)[7]).toBeGreaterThan(last(30)[6]);
    expect(last(8)[6]).toBeGreaterThan(last(8)[7]);
    expect(last(11)[7]).toBeGreaterThan(last(11)[6]);
    expect(last(10)[6]).toBeGreaterThan(last(10)[7]);
  });

  it('face the eye: the digits are on a display turned toward the camera, nearly head on, on the screen', () => {
    const p = armed(42);
    const out = digits(p);
    const eye = eyeOf(p);
    const glow: number[][] = [];
    for (let i = 0; i < out.length; i += STRIDE) {
      if (out[i + 8] == -2) {
        glow.push(out.slice(i, i + STRIDE));
      }
    }
    expect(glow.length).toBeGreaterThan(40);
    const on = glow.filter(g => seen(local(p, [g[0], g[1], g[2]])));
    expect(on.length).toBe(glow.length);
    for (const g of glow) {
      const to = [eye[0] - g[0], eye[1] - g[1], eye[2] - g[2]];
      const cos = (to[0] * g[3] + to[1] * g[4] + to[2] * g[5]) / Math.hypot(...to);
      // Within about 45 degrees of head on.
      expect(cos).toBeGreaterThan(0.7);
    }
    // Two digits side by side, wider than 3 cm in the camera's space.
    const xs = glow.map(g => local(p, [g[0], g[1], g[2]])[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.03);
  });

  it('are not drawn without the gun', () => {
    const out: number[] = [];
    const p = man();
    watch(p, 60).draw(out, eyeOf(p), 0, 0, 0, TEAM);
    expect(out.length / STRIDE).toBeLessThan(5000);
    expect(out.slice(-6).every(v => Number.isFinite(v))).toBe(true);
  });
});

describe('the gun points where the beam goes', () => {
  const armed = (o: Partial<PlayerState> = {}) => man({ ...o, ammo: 30 });
  /** The model vertex of the gun that is nearest to a model point, and where the body drew it. */
  const spot = (out: number[], model: Vec3): Vec3 => {
    const m = gun(1);
    const first = out.length / STRIDE - m.length / STRIDE - readout(30).length / STRIDE;
    let best = 0;
    let d = Infinity;
    for (let i = 0; i < m.length / STRIDE; i++) {
      const e = Math.hypot(
        m[i * STRIDE] - model[0],
        m[i * STRIDE + 1] - model[1],
        m[i * STRIDE + 2] - model[2],
      );
      if (e < d) {
        [best, d] = [i, e];
      }
    }
    const k = (first + best) * STRIDE;
    return [out[k], out[k + 1], out[k + 2]];
  };
  const angle = (a: Vec3, b: Vec3) =>
    (Math.acos(
      Math.min(
        1,
        (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b)),
      ),
    ) *
      180) /
    Math.PI;

  it.each([
    ['a near wall', [0.1, 0.05, 3.5]],
    ['a wall at 8 m', [-0.5, 0.4, 8]],
    ['far', [0, 0.2, 60]],
    ['far and to the side', [4, -1, 70]],
  ] as [string, Vec3][])(
    'along the long axis, from the back of the body to the emitter: %s',
    (_, target) => {
      const p = armed();
      const body = createBody();
      body.aim(target);
      for (let i = 0; i < 90; i++) {
        body.update(p, DT);
      }
      const eye = eyeOf(p);
      const out: number[] = [];
      body.draw(out, eye, 0, 0, 0, TEAM);
      const emitter = spot(out, [0, MUZZLE[1], MUZZLE[2]]);
      const rear = spot(out, REAR);
      const axis: Vec3 = [emitter[0] - rear[0], emitter[1] - rear[1], emitter[2] - rear[2]];
      // The camera space of the muzzle, from the world: eye is at the origin, yaw 0 looks along -z.
      const m = body.muzzle();
      const wm: Vec3 = [eye[0] + m[0], eye[1] + m[1], eye[2] - m[2]];
      expect(away(wm, emitter)).toBeLessThan(0.03);
      // The beam: from the emitter to the target (the target is in the camera's space: forward is -z).
      const end: Vec3 = [eye[0] + target[0], eye[1] + target[1], eye[2] - target[2]];
      const beam: Vec3 = [end[0] - wm[0], end[1] - wm[1], end[2] - wm[2]];
      expect(angle(axis, beam)).toBeLessThan(2);
    },
  );
});

describe('the katana in both hands', () => {
  const blade = (o: Partial<PlayerState> = {}) =>
    man({ wield: true, blade: true, cut: CUT.THRUST, swing: 0, ...o });
  /** The cyan glow of the blade, its edge and its crackle (unlit, above 1). */
  const glow = (v: Vert[]) => v.filter(q => q.c[1] > 1.5);
  /** The raw vertices of a draw: for the layer, and for the trail (unlit with the normal up). */
  const raw = (body: Body, p: PlayerState) => {
    const out: number[] = [];
    body.draw(out, eyeOf(p), p.yaw, 0, 0, TEAM);
    return Array.from({ length: out.length / STRIDE }, (_, i) =>
      out.slice(i * STRIDE, (i + 1) * STRIDE),
    );
  };
  const trail = (body: Body, p: PlayerState) =>
    raw(body, p).filter(v => v[8] == -2 && v[3] == 0 && v[4] == 1 && v[5] == 0).length;
  /** A body that has stood with the katana for 60 frames, then been `ticks` ticks into a cut; and the player as of then. */
  const into = (cut: number, ticks: number, o: Partial<PlayerState> = {}) => {
    const body = watch(blade({ cut, ...o }), 60);
    let p = blade({ cut, ...o });
    for (let i = 0; i <= ticks; i++) {
      p = blade({ cut, swing: CUTS[cut].ticks - i, ...o });
      body.update(p, DT);
    }
    return { body, p };
  };
  /** The point of the blade in the camera's space, at `ticks` ticks into the cut. */
  const tipOf = (cut: number, ticks: number, o: Partial<PlayerState> = {}) => {
    const { body, p } = into(cut, ticks, o);
    const s = pose(body, p);
    return local(p, ends(s.pos[J.HAND_R], s.rot[J.HAND_R])[1]);
  };
  /** How far the left hand's grip is from its place on the handle, BEHIND the right hand's. */
  const leftOff = (body: Body, p: PlayerState) => {
    const s = pose(body, p);
    const [gr, ax] = [grip(s.pos[J.HAND_R], s.rot[J.HAND_R]), axes(s.rot[J.HAND_R])];
    const [fing, back] = [turn(s.rot[J.HAND_L], [0, -1, 0]), turn(s.rot[J.HAND_L], [1, 0, 0])];
    const gl = [0, 1, 2].map(i => s.pos[J.HAND_L][i] + fing[i] * 0.078 + back[i] * 0.022) as Vec3;
    return away(gl, gr.map((v, i) => v - BEHIND * ax[2][i]) as Vec3);
  };

  it('is not there without it, nor while down, and the gun is not drawn with it', () => {
    expect(glow(draw(watch(man(), 60), man()))).toHaveLength(0);
    expect(
      glow(draw(watch(man({ wield: true }), 60), man({ wield: true }))).length,
    ).toBeGreaterThan(200);
    const down = blade({ down: 60 });
    expect(watch(down, 60).pose(eyeOf(down), 0, 0)).toBeUndefined();
    // Wielding the katana with the gun in the bag: the same picture as without the gun.
    const [a, b] = [blade({ ammo: 30 }), blade()];
    expect(raw(watch(a, 60), a)).toHaveLength(raw(watch(b, 60), b).length);
  });

  it('rests angled up and forward at the right of the view, in both hands, not filling the screen', () => {
    const p = blade();
    const body = watch(p, 60);
    const s = pose(body, p);
    const tip = local(p, ends(s.pos[J.HAND_R], s.rot[J.HAND_R])[1]);
    expect(tip[0]).toBeGreaterThan(0.02);
    expect(tip[0]).toBeLessThan(0.4);
    expect(tip[1]).toBeGreaterThan(0.05);
    expect(tip[2]).toBeGreaterThan(1.2);
    // The right hand is low at the right of the view, the left is on the grip a hand behind it.
    const [l, r] = hands(p, body);
    expect(r[0]).toBeGreaterThan(0.05);
    expect(r[1]).toBeLessThan(-0.08);
    // Both fists show at the bottom of the view.
    expect(seen(r)).toBe(true);
    expect(leftOff(body, p)).toBeLessThan(0.03);
    expect(l[0]).toBeGreaterThan(-0.05);
    // Nothing of it left of the middle of the view, and a thin line of the screen.
    const g = glow(draw(body, p)).map(q => local(p, q.at));
    expect(g.filter(v => v[0] < -0.02)).toHaveLength(0);
    expect(g.filter(seen).length).toBeGreaterThan(g.length * 0.5);
  });

  it('is held on the grip: the right hand is where the sword puts its grip, with the point at the end of the blade', () => {
    const p = blade();
    const body = watch(p, 60);
    const s = pose(body, p);
    const at = grip(s.pos[J.HAND_R], s.rot[J.HAND_R]);
    // The wrist is a hand's length from the grip, along the fingers.
    expect(away(s.pos[J.HAND_R], at)).toBeCloseTo(Math.hypot(0.078, 0.022), 2);
    // The farthest light from the grip is the point of the blade.
    const far = glow(draw(body, p)).reduce((m, q) => (away(q.at, at) > away(m.at, at) ? q : m));
    expect(away(far.at, ends(s.pos[J.HAND_R], s.rot[J.HAND_R])[1])).toBeLessThan(0.006);
  });

  it.each([
    [CUT.THRUST, 'thrusts: the point goes forward to the crosshair'],
    [CUT.LEFT, 'cuts from the left to the right'],
    [CUT.RIGHT, 'cuts from the right to the left'],
    [CUT.SLASH, 'slashes down through the middle'],
  ])('does cut %i: %s', (cut, _name) => {
    const { ticks, strike } = CUTS[cut];
    const path = Array.from({ length: ticks }, (_, i) => tipOf(cut, i));
    /** The tick at the share `k` of the swing. */
    const tick = (k: number) => Math.round(k * ticks);
    const at = path[strike];
    // Through the middle of the view at the strike, in front of the camera.
    expect(Math.abs(at[0])).toBeLessThan(0.25);
    expect(Math.abs(at[1])).toBeLessThan(0.15);
    expect(at[2]).toBeGreaterThan(1);
    if (cut == CUT.THRUST) {
      // Out: from the pull back to the strike, forward.
      expect(path[strike][2]).toBeGreaterThan(path[tick(0.22)][2] + 0.2);
      expect(path[strike][2]).toBeGreaterThan(Math.max(...path.map(v => v[2])) - 0.05);
    } else if (cut == CUT.SLASH) {
      // Over the head, behind the eye, then down through the middle to far below the view.
      expect(path[tick(0.27)][1]).toBeGreaterThan(0.7);
      expect(path[tick(0.27)][2]).toBeLessThan(0);
      expect(path[strike - 2][1]).toBeGreaterThan(path[strike][1]);
      expect(path[strike][1]).toBeGreaterThan(path[strike + 2][1]);
      expect(path[tick(0.55)][1]).toBeLessThan(-1);
    } else {
      // From behind the shoulder on one side to far across and low on the other.
      const sign = cut == CUT.LEFT ? 1 : -1;
      expect(sign * path[tick(0.22)][0]).toBeLessThan(-0.5);
      expect(path[tick(0.22)][2]).toBeLessThan(0);
      expect(sign * path[strike - 2][0]).toBeLessThan(sign * path[strike][0]);
      expect(sign * path[strike][0]).toBeLessThan(sign * path[strike + 2][0]);
      expect(sign * path[tick(0.6)][0]).toBeGreaterThan(0.6);
      expect(path[tick(0.6)][1]).toBeLessThan(-0.8);
    }
    // And back at the guard at the end.
    const rest = tipOf(cut, CUTS[cut].ticks - 1);
    const guard = path[0];
    expect(away(rest, guard)).toBeLessThan(0.15);
  });

  it('keeps both hands on the grip through every cut, standing or running, the arms within their length', () => {
    for (const [cut, v] of [CUT.THRUST, CUT.LEFT, CUT.RIGHT, CUT.SLASH].flatMap(c => [
      [c, 0],
      [c, 6],
    ])) {
      const body = createBody();
      let z = 0;
      for (let i = 0; i < 60; i++) {
        body.update(blade({ cut, vz: -v, z: (z -= v * DT) }), DT);
      }
      for (let i = 0; i < CUTS[cut].ticks; i++) {
        const p = blade({ cut, swing: CUTS[cut].ticks - i, vz: -v, z: (z -= v * DT) });
        body.update(p, DT);
        // On the grip in the guard and all through the cut: within a centimetre and a half.
        expect(leftOff(body, p)).toBeLessThan(0.015);
        const s = pose(body, p);
        for (const [h, a] of [
          [J.HAND_L, J.ARM_L],
          [J.HAND_R, J.ARM_R],
        ]) {
          expect(away(s.pos[h], s.pos[a])).toBeLessThan(0.56);
        }
      }
    }
  });

  it('keeps both hands on the grip on a run too, once it is drawn', () => {
    const p = blade({ vz: -8 });
    const body = createBody();
    for (let i = 0; i < 90; i++) {
      p.z -= 8 * DT;
      body.update(p, DT);
      if (i > 40) {
        expect(leftOff(body, p)).toBeLessThan(0.01);
      }
    }
    expect(glow(draw(body, p)).length).toBeGreaterThan(200);
  });

  it('draws the katana up from below when it is taken, and out of sight again when it goes', () => {
    const none = man();
    const body = watch(none, 60);
    const y = (p: PlayerState) => hands(p, body)[1][1];
    body.update(blade(), DT);
    const first = hands(blade(), body)[1][1];
    watch(blade(), 40, body);
    expect(hands(blade(), body)[1][1]).toBeGreaterThan(first + 0.2);
    watch(none, 40, body);
    expect(y(none)).toBeLessThan(-0.5);
    expect(glow(draw(body, none))).toHaveLength(0);
  });

  it('gives the hands to a ledge, a wall-run and a stumble, with no sword in them', () => {
    for (const o of [hang, wall, man({ stun: 40 })]) {
      const p = { ...o, wield: true, blade: true, cut: 0, swing: 0 };
      const body = watch(p, 60);
      const [l, r] = hands(p, body);
      const plain = watch(o, 60);
      const [pl, pr] = hands(o, plain);
      // The hand on the ledge, the wall or in the air goes where it goes empty-handed.
      expect(away(r, pr)).toBeLessThan(0.1);
      if (o != wall) {
        expect(away(l, pl)).toBeLessThan(0.1);
      }
      expect(glow(draw(body, p)).length).toBeLessThan(10);
    }
  });

  it('shows the cut in a trail of light: a ribbon through the cut, gone soon after', () => {
    const rest = blade();
    const body = watch(rest, 60);
    expect(trail(body, rest)).toBe(0);
    // Drawn every frame, as the game does: not at the wind-up, there at the strike.
    const seenAt: number[] = [];
    for (let i = 0; i < CUTS[CUT.LEFT].ticks; i++) {
      const p = blade({ cut: CUT.LEFT, swing: CUTS[CUT.LEFT].ticks - i });
      body.update(p, DT);
      seenAt.push(trail(body, p));
    }
    expect(seenAt[1]).toBe(0);
    expect(seenAt[7]).toBe(0);
    expect(seenAt[CUTS[CUT.LEFT].strike + 2]).toBeGreaterThan(30);
    // A quarter of a second after the last swing, the light is gone.
    for (let i = 0; i < 16; i++) {
      body.update(rest, DT);
      trail(body, rest);
    }
    expect(trail(body, rest)).toBe(0);
  });

  it('keeps the vertices finite and the geometry whole in every cut and state', () => {
    for (const o of [
      blade(),
      blade({ vz: -9 }),
      { ...slide, wield: true },
      { ...dash, wield: true },
    ]) {
      for (const cut of [0, 1, 2, 3]) {
        const body = watch({ ...o, cut }, 30);
        for (let i = 0; i < CUTS[cut].ticks; i += 3) {
          const p = { ...o, cut, swing: CUTS[cut].ticks - i };
          body.update(p, DT);
          const out: number[] = [];
          body.draw(out, eyeOf(p), p.yaw, 0.3, 0, TEAM);
          expect(out.length % (3 * STRIDE)).toBe(0);
          expect(out.every(Number.isFinite)).toBe(true);
        }
      }
    }
  });
});
