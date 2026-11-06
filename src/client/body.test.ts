import { describe, expect, it } from 'vitest';
import { DASH_COOLDOWN, EYE, GRAB_GAP, LOW_EYE, PLAYER_R } from '../shared/constants';
import { STILL } from '../shared/physics';
import { MODE, SIDE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { createBody } from './body';
import type { Body } from './body';
import { STRIDE, basis } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, turn } from './rig';
import { palette } from './skin';

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
        // The near runner minus its head, neck and fists, plus two hands of 1026 vertices each.
        expect(v.length).toBeGreaterThan(4000);
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
    it('hang low and a little forward when idle, either side of the view', () => {
      const p = man();
      const [l, r] = hands(p, watch(p, 60));
      expect(l[0]).toBeLessThan(-0.15);
      expect(r[0]).toBeGreaterThan(0.15);
      for (const h of [l, r]) {
        expect(h[1]).toBeLessThan(-0.1);
        expect(h[2]).toBeGreaterThan(0.25);
        expect(seen(h)).toBe(true);
      }
    });

    it('keep the hands in the view all through a run and a sprint, pumping against each other', () => {
      for (const v of [4, 6, 10]) {
        const body = createBody();
        const q = man({ vz: -v });
        const gap: number[] = [];
        for (let i = 0; i < 150; i++) {
          q.z -= v * DT;
          body.update(q, DT);
          const [l, r] = hands(q, body);
          if (i > 60) {
            // A glove each side of the view, whatever the phase of the stride.
            const gloves = colored(draw(body, q), GLOVE).filter(g => seen(local(q, g.at)));
            expect(gloves.some(g => local(q, g.at)[0] < 0)).toBe(true);
            expect(gloves.some(g => local(q, g.at)[0] > 0)).toBe(true);
            gap.push(l[2] - r[2]);
          }
        }
        // When one hand is forward the other is back, and then the other way round.
        expect(Math.max(...gap)).toBeGreaterThan(0.06);
        expect(Math.min(...gap)).toBeLessThan(-0.06);
      }
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
      // 126 vertices of palm and ten segments of 90 a hand, besides the cuffs.
      expect(colored(v, GLOVE).length).toBeGreaterThanOrEqual(2 * (126 + 10 * 90));
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
      expect(worst([a, b], 90)).toBeLessThan(0.25);
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
  const GRIP: Vec3 = [0.27, -0.2, 0.5];

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
    for (const l of g) {
      expect(seen(l)).toBe(true);
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

  it('drops the left hand out of view while it stands with the gun, and brings it back to run', () => {
    const idle = armed();
    const [still] = hands(idle, watch(idle, 90));
    expect(seen(still)).toBe(false);
    expect(still[1]).toBeLessThan(-0.45);
    // Without the gun the same stance keeps it in view.
    const [free] = hands(man(), watch(man(), 90));
    expect(seen(free)).toBe(true);
    // Running, it swings in view again.
    const run = armed({ vz: -9 });
    const body = createBody();
    for (let i = 0; i < 90; i++) {
      run.z -= 9 * DT;
      body.update(run, DT);
    }
    expect(seen(hands(run, body)[0])).toBe(true);
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
