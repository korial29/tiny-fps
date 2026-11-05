import { describe, expect, it } from 'vitest';
import { DASH_COOLDOWN, EYE, LOW_EYE, PLAYER_R } from '../shared/constants';
import { STILL } from '../shared/physics';
import { EV, MODE, SIDE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { createBody } from './body';
import type { Events, Rig } from './body';
import { SKIN, SOLE } from './figure';
import { STRIDE, basis } from './mesh';
import type { Vec3 } from './mesh';

const DT = 1 / 60;
const NONE: Events = { ev: 0, fall: 0 };
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

/** A body that has watched `n` frames of `p`, the first with the events `e`. */
const watch = (p: PlayerState, n: number, e: Events = NONE, body = createBody()) => {
  for (let i = 0; i < n; i++) {
    body.update(p, i ? NONE : e, DT);
  }
  return body;
};
/** Runs `n` frames along -z at speed v, a step of v / 60 a frame. */
const run = (v: number, n: number, dt = DT, body = createBody()) => {
  const p = man({ vz: -v });
  for (let i = 0; i < n; i++) {
    p.z -= v * dt;
    body.update(p, NONE, dt);
  }
  return { body, p };
};
const look = (body: ReturnType<typeof createBody>, p: PlayerState, pitch = 0): Rig =>
  body.rig(eyeOf(p), p.yaw, pitch)!;
/** A world point in the camera's right, up, forward, looking level along -z from the eye. */
const local = (p: PlayerState, w: Vec3): Vec3 => {
  const e = eyeOf(p);
  const [r, u, f] = basis(p.yaw, 0);
  const d = [w[0] - e[0], w[1] - e[1], w[2] - e[2]];
  return [r, u, f].map(a => a[0] * d[0] + a[1] * d[1] + a[2] * d[2]) as Vec3;
};
const hands = (p: PlayerState, rig: Rig) => rig.arms.map(a => local(p, a.end));

describe('body', () => {
  it('shows nothing before it knows the player, or when it is gone', () => {
    const body = createBody();
    const out: number[] = [];
    expect(body.rig([0, EYE, 0], 0, 0)).toBeUndefined();
    body.draw(out, [0, EYE, 0], 0, 0);
    expect(out).toEqual([]);
    watch(man(), 3, NONE, body);
    expect(body.rig([0, EYE, 0], 0, 0)).toBeDefined();
    body.update(undefined, NONE, DT);
    body.draw(out, [0, EYE, 0], 0, 0);
    expect(out).toEqual([]);
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

  it('keeps its geometry bounded: whole triangles, finite unit normals, the legs more looking down', () => {
    const states: PlayerState[] = [
      man(),
      man({ mode: MODE.SLIDE, vz: -8 }),
      man({ mode: MODE.HANG, ground: false, y: 0.4, wall: SIDE.NORTH, edge: 2.4 }),
      man({ mode: MODE.AIR, ground: false, y: 1, dash: DASH_COOLDOWN - 2 }),
    ];
    for (const p of states) {
      const body = watch(p, 40, { ev: EV.JUMP | EV.DOUBLE, fall: 5 });
      const [level, down] = [0, -1].map(pitch => {
        const out: number[] = [];
        body.draw(out, eyeOf(p), p.yaw, pitch);
        expect(out.length % (3 * STRIDE)).toBe(0);
        expect(out.every(Number.isFinite)).toBe(true);
        for (let i = 0; i < out.length; i += STRIDE) {
          expect(Math.hypot(out[i + 3], out[i + 4], out[i + 5])).toBeCloseTo(1);
        }
        return out.length / STRIDE;
      });
      // Two arms with five fingers each ahead, the jacket, legs and shoes more looking down.
      expect(level).toBeGreaterThan(2500);
      expect(level).toBeLessThanOrEqual(p.mode == MODE.SLIDE ? 5600 : 3800);
      expect(down).toBeLessThanOrEqual(5600);
      expect(down).toBeGreaterThanOrEqual(level);
    }
    expect(watch(man(), 9).rig([0, EYE, 0], 0, 0)?.arms).toHaveLength(2);
  });

  it('keeps the legs out of the draw when looking ahead, unless the body is low', () => {
    const count = (p: PlayerState, pitch: number) => {
      const out: number[] = [];
      watch(p, 40).draw(out, eyeOf(p), 0, pitch);
      return out.length;
    };
    expect(count(man(), 0)).toBeLessThan(count(man(), -1));
    expect(count(man({ mode: MODE.SLIDE }), 0)).toBe(count(man({ mode: MODE.SLIDE }), -1));
  });

  describe('arms', () => {
    it('hang low and a little forward when idle, either side of the view', () => {
      const p = man();
      const [l, r] = hands(p, look(watch(p, 60), p));
      expect(l[0]).toBeLessThan(-0.15);
      expect(r[0]).toBeGreaterThan(0.15);
      for (const h of [l, r]) {
        expect(h[1]).toBeLessThan(-0.15);
        expect(h[1]).toBeGreaterThan(-0.4);
        expect(h[2]).toBeGreaterThan(0.25);
      }
    });

    it('pump against each other with the distance run, not with the time', () => {
      const at = (dist: number, speed: number) => {
        const { body, p: q } = run(speed, Math.round(dist / (speed * DT)), DT);
        return hands(q, look(body, q));
      };
      // The same 4.8 m at 3 and at 5 m/s: the same pose.
      const [a, b] = [at(4.8, 3), at(4.8, 5)];
      expect(a[0][2]).toBeCloseTo(b[0][2], 1);
      expect(a[1][1]).toBeCloseTo(b[1][1], 1);
      // Counter-phase: when one hand is forward the other is back, and then the other way round.
      const jog = createBody();
      const j = man({ vz: -5 });
      const gap: number[] = [];
      for (let i = 0; i < 120; i++) {
        j.z -= 5 * DT;
        jog.update(j, NONE, DT);
        const [l, r] = hands(j, look(jog, j));
        gap.push(l[2] - r[2]);
      }
      expect(Math.max(...gap)).toBeGreaterThan(0.06);
      expect(Math.min(...gap)).toBeLessThan(-0.06);
      // Standing for a long time does not move them.
      const still = createBody();
      const q = run(5, 20, DT, still).p;
      q.vz = 0;
      watch(q, 120, NONE, still);
      const first = hands(q, look(still, q)).flat();
      watch(q, 600, NONE, still);
      hands(q, look(still, q))
        .flat()
        .forEach((v, i) => expect(v).toBeCloseTo(first[i], 6));
    });

    it('swing wider on a sprint than on a jog', () => {
      const travel = (speed: number) => {
        const body = createBody();
        const q = man({ vz: -speed });
        let [lo, hi] = [Infinity, -Infinity];
        for (let i = 0; i < 240; i++) {
          q.z -= speed * DT;
          body.update(q, NONE, DT);
          const h = look(body, q).arms[1].end;
          const f = local(q, h)[2];
          [lo, hi] = [Math.min(lo, f), Math.max(hi, f)];
        }
        return hi - lo;
      };
      expect(travel(9)).toBeGreaterThan(travel(3) * 1.4);
    });

    it('swing up on a jump, then settle', () => {
      const p = man({ mode: MODE.AIR, ground: false, y: 0.5 });
      const idle = hands(man(), look(watch(man(), 60), man()));
      const jump = hands(p, look(watch(p, 8, { ev: EV.JUMP, fall: 0 }), p));
      for (const i of [0, 1]) {
        expect(jump[i][1]).toBeGreaterThan(idle[i][1] + 0.2);
      }
      const later = hands(p, look(watch(p, 240, { ev: EV.JUMP, fall: 0 }), p));
      expect(later[0][1]).toBeLessThan(jump[0][1] - 0.1);
    });

    it('tuck on a double jump: hands in, knees up', () => {
      const p = man({ mode: MODE.AIR, ground: false, y: 1 });
      const plain = watch(p, 8);
      const tucked = watch(p, 8, { ev: EV.DOUBLE, fall: 0 });
      const [a, b] = [plain, tucked].map(body => look(body, p));
      for (const i of [0, 1]) {
        expect(Math.hypot(...local(p, b.arms[i].end))).toBeLessThan(
          Math.hypot(...local(p, a.arms[i].end)) - 0.1,
        );
        expect(b.legs[i].end[1]).toBeGreaterThan(a.legs[i].end[1] + 0.15);
      }
      expect(b.legs[0].end[1] - p.y).toBeGreaterThan(0.45);
    });

    it('drive straight forward on a dash', () => {
      const p = man({ mode: MODE.AIR, ground: false, y: 0.3, dash: DASH_COOLDOWN - 2 });
      for (const h of hands(p, look(watch(p, 12), p))) {
        expect(h[2]).toBeGreaterThan(0.45);
        expect(h[1]).toBeGreaterThan(-0.2);
        expect(Math.abs(h[0])).toBeLessThan(0.25);
      }
    });

    it('reach up and plant on the ledge in a hang, wherever it is', () => {
      for (const edge of [2.4, 3.1]) {
        const p = man({
          mode: MODE.HANG,
          ground: false,
          y: edge - 2,
          z: 5.43,
          wall: SIDE.NORTH,
          edge,
        });
        const rig = look(watch(p, 30, { ev: EV.GRAB, fall: 0 }), p);
        for (const arm of rig.arms) {
          // At the lip, a hand-width apart, on the ledge's height, above the eye.
          expect(arm.end[1]).toBeGreaterThan(edge - 0.1);
          expect(arm.end[1]).toBeLessThan(edge + 0.15);
          expect(arm.end[1]).toBeGreaterThan(eyeOf(p)[1]);
          expect(p.z - arm.end[2]).toBeGreaterThan(PLAYER_R - 0.12);
          expect(p.z - arm.end[2]).toBeLessThan(PLAYER_R + 0.12);
        }
        expect(Math.abs(rig.arms[0].end[0] - rig.arms[1].end[0])).toBeGreaterThan(0.15);
        expect(rig.grip).toBeGreaterThan(0.99);
      }
    });

    it('push down in the lower view as the body rises past the ledge in a climb', () => {
      const hang = man({
        mode: MODE.HANG,
        ground: false,
        y: 0.4,
        z: 5.43,
        wall: SIDE.NORTH,
        edge: 2.4,
      });
      const body = watch(hang, 30);
      const heights: number[] = [];
      for (const y of [0.4, 1, 1.6, 2.2, 2.4]) {
        const p = { ...hang, mode: MODE.CLIMB, y };
        watch(p, 6, NONE, body);
        heights.push(local(p, look(body, p).arms[0].end)[1]);
      }
      // The hands start above the eye and end low in view, never out of reach.
      expect(heights[0]).toBeGreaterThan(0);
      expect(heights.at(-1)).toBeLessThan(-0.15);
      expect(heights.at(-1)).toBeGreaterThan(-0.45);
      expect(heights.every((h, i) => !i || h <= heights[i - 1] + 1e-6)).toBe(true);
    });

    it('brush the wall with the hand on its side in a wall-run', () => {
      for (const [wall, yaw, side] of [
        [SIDE.WEST, 0, -1],
        [SIDE.EAST, 0, 1],
        [SIDE.EAST, Math.PI, -1],
      ]) {
        const p = man({ mode: MODE.WALLRUN, ground: false, y: 1.2, vz: -8, wall, yaw });
        const body = watch(p, 60);
        const [l, r] = hands(p, look(body, p));
        const [near, far] = side < 0 ? [l, r] : [r, l];
        expect(Math.abs(near[0])).toBeGreaterThan(0.36);
        expect(Math.sign(near[0])).toBe(side);
        expect(Math.abs(near[0])).toBeGreaterThan(Math.abs(far[0]));
      }
    });

    it('trail one hand low and wide in a slide', () => {
      const p = man({ mode: MODE.SLIDE, vz: -8 });
      const [l, r] = hands(p, look(watch(p, 40), p));
      expect(r[1]).toBeLessThan(l[1]);
      expect(r[0]).toBeGreaterThan(0.3);
    });
  });

  describe('hands', () => {
    /** Each hand's skin as seen from a level look: how many vertices, and how far past the wrist along its pointing. */
    const fingers = (p: PlayerState, body = watch(p, 60), pitch = 0) => {
      const out: number[] = [];
      body.draw(out, eyeOf(p), p.yaw, pitch);
      const skin: Vec3[] = [];
      for (let i = 0; i < out.length; i += STRIDE) {
        if (out[i + 6] == SKIN[0] && out[i + 7] == SKIN[1] && out[i + 9] == SKIN[2]) {
          skin.push([out[i], out[i + 1], out[i + 2]]);
        }
      }
      const arms = look(body, p, pitch).arms;
      const away = (q: Vec3, e: Vec3) => Math.hypot(q[0] - e[0], q[1] - e[1], q[2] - e[2]);
      return arms.map(({ end, dir }, i) => {
        // The skin nearer to this wrist than to the other.
        const near = skin.filter(q => away(q, end) < away(q, arms[1 - i].end));
        const d = near.map(
          q => (q[0] - end[0]) * dir[0] + (q[1] - end[1]) * dir[1] + (q[2] - end[2]) * dir[2],
        );
        return { count: near.length, reach: Math.max(...d) };
      });
    };
    const ledge = man({
      mode: MODE.HANG,
      ground: false,
      y: 0.4,
      z: 5.43,
      wall: SIDE.NORTH,
      edge: 2.4,
    });

    it('curl into a loose fist on a run, tighter on a sprint, and open flat on a ledge', () => {
      const [jog, fast] = [run(5, 90), run(10, 90)];
      const [a, b, c] = [
        look(jog.body, jog.p),
        look(fast.body, fast.p),
        look(watch(ledge, 40, { ev: EV.GRAB, fall: 0 }), ledge),
      ].map(r => r.arms.map(l => l.curl));
      for (const i of [0, 1]) {
        expect(a[i]).toBeGreaterThan(0.5);
        expect(b[i]).toBeGreaterThan(a[i] + 0.1);
        expect(c[i]).toBeLessThan(0.15);
      }
    });

    it('draw a palm with ten finger segments, a fist shorter than an open hand', () => {
      const jog = run(5, 90);
      const [fist, open] = [fingers(jog.p, jog.body), fingers(ledge)];
      for (const i of [0, 1]) {
        // The palm and the ten segments of fingers and thumb: 126 + 10 * 90 vertices.
        expect(fist[i].count).toBe(1026);
        expect(open[i].count).toBe(1026);
        expect(fist[i].reach).toBeLessThan(open[i].reach - 0.04);
      }
    });

    it('end each sleeve at the wrist in a cuff of the accent colour', () => {
      const p = man();
      const out: number[] = [];
      const body = watch(p, 60);
      body.draw(out, eyeOf(p), 0, 0);
      const ends = look(body, p).arms.map(a => a.end);
      const cuff: Vec3[] = [];
      for (let i = 0; i < out.length; i += STRIDE) {
        if (out[i + 6] == 0.95 && out[i + 7] == 0.22 && out[i + 9] == 0.1) {
          cuff.push([out[i], out[i + 1], out[i + 2]]);
        }
      }
      const away = (q: Vec3, e: Vec3) => Math.hypot(q[0] - e[0], q[1] - e[1], q[2] - e[2]);
      expect(cuff.length).toBeGreaterThan(100);
      for (const q of cuff) {
        expect(Math.min(...ends.map(e => away(q, e)))).toBeLessThan(0.06);
      }
      for (const e of ends) {
        expect(cuff.some(q => away(q, e) < 0.03)).toBe(true);
      }
    });
  });

  describe('legs', () => {
    it('stand under the eye, planted', () => {
      const p = man();
      for (const leg of look(watch(p, 60), p).legs) {
        expect(Math.hypot(leg.end[0] - p.x, leg.end[2] - p.z)).toBeLessThan(0.3);
        expect(leg.end[1] - p.y).toBeLessThan(0.1);
        expect(leg.root[1] - p.y).toBeGreaterThan(0.8);
      }
    });

    it('stride in step with the run, one forward while the other is back', () => {
      const body = createBody();
      const p = man({ vz: -6 });
      const gap: number[] = [];
      for (let i = 0; i < 120; i++) {
        p.z -= 6 * DT;
        body.update(p, NONE, DT);
        const [a, b] = look(body, p).legs.map(l => l.end[2] - p.z);
        gap.push(a - b);
      }
      expect(Math.max(...gap)).toBeGreaterThan(0.3);
      expect(Math.min(...gap)).toBeLessThan(-0.3);
    });

    it('end in shoes: light soles on the floor under the ankles, toes ahead', () => {
      const p = man({ pitch: -1 });
      const out: number[] = [];
      const body = watch(p, 60);
      body.draw(out, eyeOf(p), 0, -1);
      const sole: Vec3[] = [];
      for (let i = 0; i < out.length; i += STRIDE) {
        if (out[i + 6] == SOLE[0] && out[i + 7] == SOLE[1] && out[i + 9] == SOLE[2]) {
          sole.push([out[i], out[i + 1], out[i + 2]]);
        }
      }
      expect(sole.length).toBeGreaterThan(50);
      expect(Math.min(...sole.map(q => q[1]))).toBeCloseTo(p.y, 1);
      // Facing -z: the toes are ahead of the ankles, the heel just behind them.
      for (const leg of look(body, p, -1).legs) {
        const mine = sole.filter(q => Math.abs(q[0] - leg.end[0]) < 0.08);
        expect(Math.min(...mine.map(q => q[2]))).toBeLessThan(leg.end[2] - 0.12);
        expect(Math.max(...mine.map(q => q[2]))).toBeLessThan(leg.end[2] + 0.12);
      }
    });

    it('stretch out in front, low, in a slide', () => {
      const p = man({ mode: MODE.SLIDE, vz: -8 });
      for (const leg of look(watch(p, 40), p).legs) {
        // Forward is -z; the feet are well ahead of the hips and near the floor.
        expect(leg.root[2] - leg.end[2]).toBeGreaterThan(0.6);
        expect(leg.end[1] - p.y).toBeLessThan(0.35);
        expect(leg.root[1] - p.y).toBeLessThan(0.4);
      }
    });

    it('hang straight down from a ledge, and tuck up in the air', () => {
      const hang = man({
        mode: MODE.HANG,
        ground: false,
        y: 0.4,
        z: 5.43,
        wall: SIDE.NORTH,
        edge: 2.4,
      });
      for (const leg of look(watch(hang, 40), hang).legs) {
        expect(leg.end[1] - hang.y).toBeLessThan(0.25);
      }
      const air = man({ mode: MODE.AIR, ground: false, y: 1 });
      const feet = look(watch(air, 40), air).legs.map(l => l.end[1] - air.y);
      expect(Math.min(...feet)).toBeGreaterThan(0.2);
    });
  });

  describe('blends', () => {
    /** The arms in the view and the legs from the feet: what the player sees, not the camera's own moves. */
    const flat = (p: PlayerState, r: Rig) => [
      ...r.arms.flatMap(l => [...local(p, l.mid), ...local(p, l.end)]),
      ...r.legs.flatMap(l => [...l.mid, ...l.end].map((v, i) => v - [p.x, p.y, p.z][i % 3])),
    ];
    /** The largest move of any joint in a frame, over `per` frames of each state in turn. */
    const worst = (steps: PlayerState[], per: number) => {
      const body = watch(steps[0], 30);
      let [prev, most] = [flat(steps[0], look(body, steps[0], -1)), 0];
      for (const p of steps) {
        for (let i = 0; i < per; i++) {
          body.update(p, NONE, DT);
          const now = flat(p, look(body, p, -1));
          most = Math.max(most, ...now.map((v, k) => Math.abs(v - prev[k])));
          prev = now;
        }
      }
      return most;
    };

    it('ease between poses with no snapping, and settle', () => {
      const ground = man();
      const slide = man({ mode: MODE.SLIDE, vz: -8 });
      const hang = man({
        mode: MODE.HANG,
        ground: false,
        y: 0.4,
        z: 5.43,
        wall: SIDE.NORTH,
        edge: 2.4,
      });
      const wall = man({ mode: MODE.WALLRUN, ground: false, y: 1.2, vz: -8, wall: SIDE.WEST });
      const dash = man({ mode: MODE.AIR, ground: false, vz: -16, dash: DASH_COOLDOWN - 2 });
      for (const [a, b] of [
        [ground, slide],
        [slide, ground],
        [ground, dash],
        [dash, ground],
        [ground, wall],
        [wall, ground],
      ]) {
        expect(worst([a, b], 90)).toBeLessThan(0.2);
      }
      // Hanging moves the body 2 m up while the hands stay on the ledge: it is the pose that is
      // measured, in the view, which has to stay smooth too.
      const body = watch(ground, 30);
      let prev = hands(ground, look(body, ground)).flat();
      let most = 0;
      for (let i = 0; i < 60; i++) {
        body.update(hang, NONE, DT);
        const now = hands(hang, look(body, hang)).flat();
        most = Math.max(most, ...now.map((v, k) => Math.abs(v - prev[k])));
        prev = now;
      }
      expect(most).toBeLessThan(0.2);
      const [settled, again] = [
        hands(hang, look(body, hang)).flat(),
        (watch(hang, 600, NONE, body), hands(hang, look(body, hang)).flat()),
      ];
      settled.forEach((v, i) => expect(again[i]).toBeCloseTo(v, 3));
    });

    it('lets the pulses of a jump and a landing die away', () => {
      const p = man();
      const body = watch(p, 30);
      const rest = hands(p, look(body, p)).flat();
      body.update(p, { ev: EV.JUMP | EV.LAND, fall: 9 }, DT);
      body.update(p, NONE, DT);
      expect(Math.abs(hands(p, look(body, p))[0][1] - rest[1])).toBeGreaterThan(0.01);
      watch(p, 300, NONE, body);
      hands(p, look(body, p))
        .flat()
        .forEach((v, i) => expect(v).toBeCloseTo(rest[i], 3));
    });
  });
});
