import { describe, expect, it } from 'vitest';
import { CUTS, DASH_COOLDOWN, DOWN_TICKS, PLAYER_H, PLAYER_R, TICK_HZ } from '../shared/constants';
import { STILL } from '../shared/physics';
import { CUT, MODE, SIDE, TEX } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { build } from '../shared/world';
import type { WorldDef } from '../shared/world';
import { MUZZLE, REAR, aimed, foregrip, grip, gun, tip } from './gun';
import { BEHIND, axes } from './katana';
import { SHINE, STRIDE } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, solve, turn } from './rig';
import { FRY, animate, brandish, createRunner, dissolve, fried, soldier, stance } from './soldier';
import type { Runner } from './soldier';
import { palette } from './skin';

const DT = 1 / 60;
const DASH_BURST = DASH_COOLDOWN - 2;
const [, , , SKIN, , , SOLE, GLOVE] = palette([0.1, 0.8, 0.2]);
const man = (o: Partial<PlayerState> = {}): PlayerState => ({
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
/** Hanging 2 m under the top of a ledge ahead (toward -z). */
const HANGS = {
  mode: MODE.HANG,
  ground: false,
  y: 1,
  wall: SIDE.NORTH,
  edge: 3,
};

/** Vertices of a model, as [x, y, z, layer, r, g, b] after the position and normal. */
const rows = (v: number[]) =>
  Array.from({ length: v.length / STRIDE }, (_, i) => {
    const k = i * STRIDE;
    return [v[k], v[k + 1], v[k + 2], v[k + 8], v[k + 6], v[k + 7], v[k + 9]];
  });

/** A runner that has held the state `o` for `n` frames, run along -z when it has a speed, ending at z = -3. */
const hold = (o: Partial<PlayerState>, n = 90) => {
  const book = new Map<number, Runner>();
  let p = man({ ...o, z: -3 - (o.vz ?? 0) * DT * (n - 1) });
  for (let i = 0; i < n; i++) {
    animate(book, [p], DT);
    p = man({ ...o, z: p.z + (o.vz ?? 0) * DT });
  }
  return book.get(1)!;
};

describe('animate', () => {
  it('keeps one runner per player and drops the ones that left', () => {
    const book = new Map<number, Runner>();
    animate(book, [man({ id: 1 }), man({ id: 2 })], DT);
    expect([...book.keys()]).toEqual([1, 2]);
    const first = book.get(1);
    animate(book, [man({ id: 1, x: 6 })], DT);
    expect([...book.keys()]).toEqual([1]);
    expect(book.get(1)).toBe(first);
    expect(first!.p.x).toBe(6);
  });

  it('gives each player a gait of its own, and one back to a player that returns', () => {
    const book = new Map<number, Runner>();
    animate(book, [man({ id: 1 }), man({ id: 2 })], DT);
    expect(book.get(1)!.gait).not.toBe(book.get(2)!.gait);
    const gait = book.get(1)!.gait;
    animate(book, [man({ id: 2 })], DT);
    animate(book, [man({ id: 1 })], DT);
    expect(book.get(1)!.gait).not.toBe(gait);
  });

  it('feeds the gait: the stride goes on while it runs, and the pose follows the player', () => {
    const r = hold({ vz: -6 }, 120);
    expect(r.gait.steps).toBeGreaterThan(3);
    expect(r.gait.pose().at).toEqual([r.p.x, r.p.y, r.p.z]);
  });

  it('starts a new player in the pose its state asks for, and a dash at once', () => {
    const r = createRunner(man({ dash: DASH_BURST, vz: -14 }));
    expect(r.dash).toBe(1);
    expect(createRunner(man()).dash).toBe(0);
  });

  it('eases the dash in and out, by its timer', () => {
    const book = new Map<number, Runner>();
    animate(book, [man()], DT);
    animate(book, [man({ dash: DASH_BURST })], DT);
    const r = book.get(1)!;
    expect(r.dash).toBeGreaterThan(0.1);
    expect(r.dash).toBeLessThan(0.5);
    for (let i = 0; i < 30; i++) {
      animate(book, [man({ dash: DASH_BURST })], DT);
    }
    expect(r.dash).toBeGreaterThan(0.99);
    animate(book, [man({ dash: DASH_COOLDOWN - 40 })], DT);
    expect(r.dash).toBeLessThan(0.99);
    for (let i = 0; i < 30; i++) {
      animate(book, [man({ dash: DASH_COOLDOWN - 40 })], DT);
    }
    expect(r.dash).toBeLessThan(0.01);
  });

  it('puts the feet on the brushes under them when it has the world, and on its own floor without', () => {
    // A 20 cm step under the right foot (x 5 to 6), a floor at y = 1 elsewhere.
    const def: WorldDef = {
      brushes: [
        { min: [4, 0, -4], max: [6, 1, -2], top: TEX.TILE, side: TEX.BRICK },
        { min: [5, 0, -4], max: [6, 1.2, -2], top: TEX.TILE, side: TEX.BRICK },
      ],
      teams: [
        { base: [0, 0, 0], spawns: [[0, 0, 0, 0]] },
        { base: [0, 0, 0], spawns: [[0, 0, 0, 0]] },
      ],
      floor: -20,
      sun: { dir: [0, 1, 0], color: [1, 1, 1] },
      sky: [
        [0, 0, 0],
        [0, 0, 0],
      ],
    };
    const lowest = (world?: ReturnType<typeof build>) => {
      const book = new Map<number, Runner>();
      for (let i = 0; i < 90; i++) {
        animate(book, [man()], DT, world);
      }
      const v: number[] = [];
      soldier(v, book.get(1)!, [0.1, 0.8, 0.2], 1);
      const shoes = rows(v).filter(p => p[4] == SOLE[0] && p[5] == SOLE[1] && p[6] == SOLE[2]);
      return Math.min(...shoes.filter(p => p[0] > 5.02).map(p => p[1]));
    };
    expect(lowest()).toBeCloseTo(1, 1);
    expect(lowest(build(def))).toBeCloseTo(1.2, 1);
  });
});

describe('soldier', () => {
  const GREEN = [0.1, 0.8, 0.2];
  /** A runner that has held the state, drawn at (5, y, -3). */
  const draw = (o?: Partial<PlayerState>, lod = 1, n = 60) => {
    const out: number[] = [];
    soldier(out, hold({ ...o }, n), GREEN, lod);
    return out;
  };
  const dyed = (v: number[][], c: number[]) =>
    v.filter(p => p[4] == c[0] && p[5] == c[1] && p[6] == c[2]);
  const MOVES: Partial<PlayerState>[] = [
    {},
    { vz: -9 },
    { vz: -5, yaw: 2 },
    { mode: MODE.AIR, ground: false, vy: 5, vz: -6 },
    { mode: MODE.AIR, ground: false, vy: -8, vz: -6 },
    { dash: DASH_BURST, vz: -14 },
    HANGS,
    { ...HANGS, mode: MODE.CLIMB, y: 1.6 },
    { mode: MODE.WALLRUN, ground: false, wall: SIDE.WEST, vz: -8 },
    { mode: MODE.SLIDE, vz: -8 },
    { mode: MODE.CROUCH, vz: -2 },
    { stun: 40, vz: -3 },
  ];

  it('stays under 8000 vertices near and about a quarter of that far, in every move, as whole triangles', () => {
    for (const o of MOVES) {
      const [near, far] = [1, 0].map(lod => draw(o, lod).length / STRIDE);
      expect(near).toBeLessThan(8000);
      expect(near).toBeGreaterThan(5000);
      expect(far).toBeLessThan(near * 0.3);
      expect(near % 3).toBe(0);
      expect(far % 3).toBe(0);
    }
  });

  it('draws a close runner with the close skin and its weapons near, the gun or the katana', () => {
    for (const o of [{ ammo: 12 }, { wield: true, blade: true }]) {
      const [near, close] = [1, 3].map(lod => draw(o, lod).length / STRIDE);
      expect(close - near).toBeGreaterThan(12000);
      expect(close % 3).toBe(0);
      expect(draw(o, 3).every(Number.isFinite)).toBe(true);
    }
  });

  it('adds only the streaks to a dash, and glows them', () => {
    const plain = draw({ vz: -14 }).length / STRIDE;
    const dash = rows(draw({ dash: DASH_BURST, vz: -14 }));
    const glow = dash.filter(p => p[3] == -2);
    expect(glow.length).toBeGreaterThan(15);
    expect(dash.length - glow.length).toBe(plain);
    expect(draw({ vz: -14 }).length / STRIDE).toBe(plain);
    expect(rows(draw({ vz: -14 })).every(p => p[3] == -1)).toBe(true);
    // They trail behind the runner: the way it came from, +z.
    expect(Math.min(...glow.map(p => p[2]))).toBeGreaterThan(-3 - 0.4);
  });

  it('has finite vertices and unit normals, in every move', () => {
    for (const o of MOVES) {
      for (const lod of [0, 1]) {
        const v = draw({ ...o, yaw: 1 }, lod);
        for (let i = 0; i < v.length; i += STRIDE) {
          expect(v.slice(i, i + STRIDE).every(Number.isFinite)).toBe(true);
          expect(Math.hypot(v[i + 3], v[i + 4], v[i + 5])).toBeCloseTo(1);
        }
      }
    }
  });

  it('stands PLAYER_H tall on its feet, all inside PLAYER_R when standing, at every level', () => {
    for (const lod of [0, 1]) {
      const v = rows(draw(undefined, lod));
      expect(Math.min(...v.map(p => p[1]))).toBeCloseTo(1, 1);
      expect(Math.max(...v.map(p => p[1]))).toBeCloseTo(1 + PLAYER_H, 1);
      expect(Math.max(...v.map(p => p[1]))).toBeLessThanOrEqual(1 + PLAYER_H + 1e-6);
      for (const p of v) {
        expect(Math.hypot(p[0] - 5, p[2] + 3)).toBeLessThan(PLAYER_R);
      }
    }
  });

  it('is a runner: the jacket in the colour, dark trousers, skin, hair and light shoes', () => {
    const v = rows(draw());
    const jacket = dyed(v, GREEN);
    expect(jacket.length).toBeGreaterThan(300);
    expect(Math.min(...jacket.map(p => p[1]))).toBeGreaterThan(1 + 0.9);
    expect(Math.max(...jacket.map(p => p[1]))).toBeLessThan(1 + 1.55);
    const legs = v.filter(p => p[1] < 1 + 0.8);
    expect(dyed(legs, GREEN)).toHaveLength(0);
    expect(legs.filter(p => p[4] + p[5] + p[6] < 0.6).length).toBeGreaterThan(300);
    expect(dyed(v, SKIN).length).toBeGreaterThan(100);
    expect(dyed(v, SOLE).length).toBeGreaterThan(30);
    const head = v.filter(p => p[1] > 1 + 1.55);
    expect(head.length).toBeGreaterThan(100);
    expect(dyed(head, SKIN).length).toBeGreaterThan(30);
    expect(head.some(p => p[4] + p[5] + p[6] < 0.35)).toBe(true);
  });

  it('turns with its yaw: the whites of the eyes, at the front of the face, go where it looks', () => {
    const eyes = (yaw: number) =>
      rows(draw({ yaw })).filter(p => p[1] > 1 + 1.55 && p[4] + p[5] + p[6] > 2.4);
    const [a, b] = [eyes(0), eyes(Math.PI / 2)];
    const mean = (v: number[][], i: number) => v.reduce((s, p) => s + p[i], 0) / v.length;
    expect(a.length).toBeGreaterThan(10);
    expect(mean(a, 2) + 3).toBeLessThan(-0.05);
    expect(Math.abs(mean(a, 0) - 5)).toBeLessThan(0.03);
    expect(mean(b, 0) - 5).toBeLessThan(-0.05);
    expect(Math.abs(mean(b, 2) + 3)).toBeLessThan(0.03);
  });

  it('draws the hands at the ledge in the world when hanging, on every side', () => {
    // The runner stands at (5, -3), the ledge top is 3 m up and the wall face 0.43 m from its centre.
    const TO = [[], [1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const wall of [SIDE.EAST, SIDE.WEST, SIDE.SOUTH, SIDE.NORTH]) {
      const [nx, nz] = TO[wall];
      const gloves = dyed(rows(draw({ ...HANGS, wall })), GLOVE);
      // A point as (metres past the wall face, metres above the lip, along the wall).
      const at = (p: number[]) => [
        (p[0] - 5) * nx + (p[2] + 3) * nz - 0.43,
        p[1] - 3,
        (p[0] - 5) * -nz + (p[2] + 3) * nx,
      ];
      const g = gloves.map(at);
      expect(g.length).toBeGreaterThan(60);
      // Each hand has a point within 3 cm of the lip, a hand-width apart along the wall.
      for (const side of [-1, 1]) {
        const hand = g.filter(q => q[2] * side > 0.05);
        expect(hand.length).toBeGreaterThan(30);
        expect(Math.min(...hand.map(q => Math.hypot(q[0], q[1])))).toBeLessThan(0.04);
      }
      // The fingers lie on the top, over the lip, and nothing goes into the wall or under the top.
      expect(Math.max(...g.map(q => q[0]))).toBeGreaterThan(0.1);
      for (const q of g) {
        expect(q[0] > 0.01 ? q[1] : 0).toBeGreaterThan(-0.02);
        expect(q[1] < -0.02 ? q[0] : -1).toBeLessThan(0.02);
      }
      expect(Math.max(...g.map(q => q[1]))).toBeLessThan(0.12);
    }
  });

  it('draws the sole on the wall in a wall-run, on both sides', () => {
    for (const [wall, s] of [
      [SIDE.WEST, -1],
      [SIDE.EAST, 1],
    ] as const) {
      // The wall face is 0.4 m from the centre. Over a stride the sole is flat on it for a while.
      const dist = [60, 65, 70, 75, 80, 85, 90, 95, 100].map(n => {
        const v = rows(draw({ mode: MODE.WALLRUN, ground: false, wall, vz: -8 }, 1, n));
        return dyed(v, SOLE).map(p => 0.4 - (p[0] - 5) * s);
      });
      for (const d of dist) {
        // Never through the wall.
        expect(Math.min(...d)).toBeGreaterThan(-0.03);
      }
      const flat = dist.filter(d => d.filter(x => Math.abs(x) < 0.03).length > 25);
      expect(flat.length).toBeGreaterThan(2);
      // The sole is a patch parallel to the wall: the other shoe is far from it.
      for (const d of flat) {
        expect(d.filter(x => x > 0.3).length).toBeGreaterThan(20);
      }
    }
  });
});

describe('the gun on a runner', () => {
  const armed = (o: Partial<PlayerState> = {}) => man({ ...o, ammo: 30 });
  /** The runner after `n` frames, the states given by `p` each one. */
  const run = (p: (i: number) => PlayerState, n: number) => {
    const book = new Map<number, Runner>();
    for (let i = 0; i < n; i++) {
      animate(book, [p(i)], DT);
    }
    return book.get(1)!;
  };
  const drawn = (r: Runner, lod = 1) => {
    const v: number[] = [];
    soldier(v, r, [0.1, 0.8, 0.2], lod);
    expect(v.every(Number.isFinite)).toBe(true);
    return rows(v);
  };
  /** The cyan of the gun: unlit, bright green. */
  const glow = (v: ReturnType<typeof rows>) => v.filter(p => p[3] == -2 && p[5] > 1.5);
  const centre = (v: ReturnType<typeof rows>) =>
    [0, 1, 2].map(k => v.reduce((s, p) => s + p[k], 0) / v.length);

  it('holds the gun when it has one, and nothing without', () => {
    expect(glow(drawn(run(() => armed(), 60))).length).toBeGreaterThan(50);
    expect(glow(drawn(run(() => man(), 60)))).toHaveLength(0);
    expect(glow(drawn(run(() => armed({ down: 50 }), 60)))).toHaveLength(0);
    // Far, it has the gun too, in fewer triangles.
    const [far, near] = [0, 1].map(lod =>
      drawn(
        run(() => armed(), 60),
        lod,
      ),
    );
    expect(glow(far).length).toBeGreaterThan(20);
    expect(far.length).toBeLessThan(near.length);
  });

  it('carries it at the side: low, beside the hip, not in front of the chest', () => {
    const r = run(() => armed({ yaw: 0 }), 90);
    const c = centre(glow(drawn(r)));
    expect(c[1] - 1).toBeLessThan(1.1);
    expect(c[1] - 1).toBeGreaterThan(0.3);
    // The right hand is on the runner's right: +x when he looks along -z.
    expect(c[0] - 5).toBeGreaterThan(0.1);
    expect(r.aim).toBe(0);
  });

  it('raises the arm and aims along the pitch when it fires, then lowers it after half a second', () => {
    const p = (i: number) => armed({ yaw: 0, pitch: 0.4, shots: i == 60 ? 1 : 0 });
    const side = run(p, 59);
    const sideC = centre(glow(drawn(side)));
    const r = run(p, 90);
    expect(r.aim).toBeGreaterThan(0.9);
    const up = glow(drawn(r));
    const [x, y, z] = centre(up);
    // Out in front of the face now, higher than at the side.
    expect(y).toBeGreaterThan(sideC[1] + 0.3);
    expect(z).toBeLessThan(-3 - 0.2);
    expect(Math.abs(x - 5 - 0.2)).toBeLessThan(0.25);
    // With no shot for half a second it is lowered again.
    const later = run(i => armed({ pitch: 0.4, shots: i >= 60 ? 1 : 0 }), 60 + 60);
    expect(later.aim).toBeLessThan(0.1);
    expect(later.since).toBeGreaterThan(0.5);
  });

  it('raises the arm with the shot and eases it down after', () => {
    const book = new Map<number, Runner>();
    animate(book, [armed()], DT);
    animate(book, [armed({ shots: 1 })], DT);
    const r = book.get(1)!;
    expect(r.since).toBe(0);
    // Up at once: the beam leaves a gun that already points at the shot.
    expect(r.aim).toBe(1);
    animate(book, [armed({ shots: 1 })], DT);
    expect(r.since).toBeCloseTo(DT, 6);
  });

  it('counts a wrapped counter as a shot', () => {
    const book = new Map<number, Runner>();
    animate(book, [armed({ shots: 255 })], DT);
    animate(book, [armed({ shots: 0 })], DT);
    expect(book.get(1)!.since).toBe(0);
  });

  it('keeps the arm its length and the body finite while aiming, looking up, down and about', () => {
    for (const [yaw, pitch] of [
      [0, 0],
      [1, 1.2],
      [3, -1.2],
      [-2, 0.3],
    ]) {
      const r = run(i => armed({ yaw, pitch, shots: i > 40 ? 1 : 0, vz: -5 }), 90);
      const v = drawn(r);
      expect(v.length).toBeGreaterThan(500);
      // Nothing flung away from the runner.
      for (const p of v) {
        expect(Math.hypot(p[0] - 5, p[1] - 1, p[2] + 3 - 0)).toBeLessThan(40);
      }
    }
  });

  it('lies when down, and sinks into the roof for the last half second', () => {
    const lowest = (down: number) =>
      Math.min(...drawn(run(() => man({ down, ammo: -1 }), 120)).map(p => p[1]));
    const top = (down: number) =>
      Math.max(...drawn(run(() => man({ down, ammo: -1 }), 120)).map(p => p[1]));
    expect(top(100)).toBeLessThan(1 + 0.5);
    expect(top(100)).toBeGreaterThan(1 + 0.1);
    expect(lowest(100)).toBeGreaterThan(1 - 0.05);
    expect(top(2)).toBeLessThan(top(100) - 0.3);
    expect(lowest(2)).toBeLessThan(0.7);
  });

  it('points its gun at where it shoots: the long axis of the drawn gun lies along the line from its emitter to the focus', () => {
    const model = gun(1);
    const spot = (v: number[], at: Vec3): Vec3 => {
      const first = v.length / STRIDE - model.length / STRIDE;
      let [best, d] = [0, Infinity];
      for (let i = 0; i < model.length / STRIDE; i++) {
        const e = Math.hypot(
          model[i * STRIDE] - at[0],
          model[i * STRIDE + 1] - at[1],
          model[i * STRIDE + 2] - at[2],
        );
        if (e < d) {
          [best, d] = [i, e];
        }
      }
      const k = (first + best) * STRIDE;
      return [v[k], v[k + 1], v[k + 2]];
    };
    for (const [yaw, pitch] of [
      [0, 0],
      [0.8, 0.3],
      [-2, -0.2],
    ]) {
      const r = run(i => armed({ yaw, pitch, shots: i > 40 ? 1 : 0 }), 50);
      const v: number[] = [];
      soldier(v, r, [0.1, 0.8, 0.2], 1);
      const emitter = spot(v, [0, MUZZLE[1], MUZZLE[2]]);
      const rear = spot(v, REAR);
      const [grip, ax] = aimed(r.p, r.focus);
      expect(Math.hypot(...[0, 1, 2].map(k => emitter[k] - tip(grip, ax)[k]))).toBeLessThan(0.06);
      const [a, b] = [
        [0, 1, 2].map(k => emitter[k] - rear[k]),
        [0, 1, 2].map(k => r.focus[k] - emitter[k]),
      ];
      const deg =
        (Math.acos(
          Math.min(
            1,
            (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b)),
          ),
        ) *
          180) /
        Math.PI;
      expect(deg).toBeLessThan(2);
    }
  });

  it('keeps the gun on the shot at once: a shot raises it with no ease, and it points at the last focus', () => {
    const book = new Map<number, Runner>();
    animate(book, [armed()], DT);
    animate(book, [armed({ shots: 1 })], DT);
    expect(book.get(1)!.aim).toBe(1);
  });
});

describe('a runner with the katana', () => {
  const GREEN = [0.1, 0.8, 0.2];
  const blade = (o: Partial<PlayerState> = {}) =>
    man({ wield: true, blade: true, cut: CUT.THRUST, swing: 0, ...o });
  /** The vertices of the katana's light: bright cyan, unlit. */
  const light = (v: number[]) => rows(v).filter(p => p[3] == -2 && p[5] > 1.5 && p[6] > p[4] * 2);
  /** The runner, drawn at frame i of a swing of `cut` from a standing start (swing 0 when `tick` is below 0). */
  const frames = (cut: number, o: Partial<PlayerState> = {}, lod = 1) => {
    const book = new Map<number, Runner>();
    for (let i = 0; i < 40; i++) {
      animate(book, [blade({ ...o, cut })], DT);
    }
    const out: number[][] = [];
    for (let i = 0; i < CUTS[cut].ticks; i++) {
      animate(book, [blade({ ...o, cut, swing: CUTS[cut].ticks - i })], DT);
      const v: number[] = [];
      soldier(v, book.get(1)!, GREEN, lod);
      out.push(v);
    }
    return { book, out };
  };
  /** The point of the blade: the light farthest from the runner's eye. */
  const tipOf = (v: number[], p: Partial<PlayerState> = {}) => {
    const eye = [p.x ?? 5, (p.y ?? 1) + 1.6, p.z ?? -3];
    return light(v).reduce((m, q) =>
      Math.hypot(q[0] - eye[0], q[1] - eye[1], q[2] - eye[2]) >
      Math.hypot(m[0] - eye[0], m[1] - eye[1], m[2] - eye[2])
        ? q
        : m,
    );
  };
  const still = (o: Partial<PlayerState> = {}) => {
    const out: number[] = [];
    soldier(out, hold(blade(o), 60), GREEN, 1);
    return out;
  };

  it('carries the katana in the right hand instead of the gun, in the same triangles', () => {
    expect(light(still()).length).toBeGreaterThan(200);
    // With the gun in the bag as well, it is the same picture.
    expect(still({ ammo: 30 })).toEqual(still());
    expect(light(still({ wield: false }))).toHaveLength(0);
    // Down, nothing in the hand.
    expect(light(still({ down: 40 }))).toHaveLength(0);
    // Far away it is the cheaper model.
    const [near, far] = [1, 0].map(lod => {
      const out: number[] = [];
      soldier(out, hold(blade(), 60), GREEN, lod);
      return out.length;
    });
    expect(far).toBeLessThan(near * 0.6);
  });

  it('carries it upright in both hands before its right shoulder, running or standing', () => {
    for (const vz of [0, -6, -9]) {
      const out: number[] = [];
      const r = hold(blade({ vz }), 90);
      soldier(out, r, GREEN, 1);
      // The point is the highest light: over its head, at its right (+x).
      const [x, y, z] = light(out).reduce((m, q) => (q[1] > m[1] ? q : m));
      expect(y).toBeGreaterThan(r.p.y + 2.1);
      expect(x).toBeGreaterThan(r.p.x);
      expect(x).toBeLessThan(r.p.x + 0.45);
      // Leaning a little forward with its straight wrists (lock()).
      expect(Math.abs(z - r.p.z)).toBeLessThan(0.65);
      // Nothing of it low: the blade stands above the hands at the chest, the pommel at the belt.
      expect(Math.min(...light(out).map(q => q[1]))).toBeGreaterThan(r.p.y + 0.95);
    }
  });

  it('twists the chest through a cut across, so the shoulders carry the arms', () => {
    const facing = (prog: number) => {
      const p = blade({ cut: CUT.LEFT, swing: 1 });
      const r = createRunner(p);
      const s = solve(brandish(r.gait.pose(), p, prog, 0));
      const f = turn(s.rot[J.CHEST], [0, 0, -1]);
      return Math.atan2(-f[0], -f[2]);
    };
    // From turned left over the wind-up to turned right in the follow-through: 75 degrees and more.
    expect(facing(0.24) - facing(0.6)).toBeGreaterThan(1.2);
  });

  it('holds the grip in both hands in the carry and all through every cut, standing or running', () => {
    /** How far the left hand's grip is from its place on the handle, BEHIND the right hand's. */
    const apart = (r: Runner) => {
      const s = solve(brandish(r.gait.pose(), r.p, r.prog, r.gait.phase));
      const [at, ax] = [grip(s.pos[J.HAND_R], s.rot[J.HAND_R]), axes(s.rot[J.HAND_R])];
      const [fing, back] = [turn(s.rot[J.HAND_L], [0, -1, 0]), turn(s.rot[J.HAND_L], [1, 0, 0])];
      return Math.hypot(
        ...[0, 1, 2].map(
          i => s.pos[J.HAND_L][i] + fing[i] * 0.078 + back[i] * 0.022 - (at[i] - BEHIND * ax[2][i]),
        ),
      );
    };
    for (const cut of [0, 1, 2, 3]) {
      for (const vz of [0, -6, -9]) {
        const book = new Map<number, Runner>();
        let z = -3;
        for (let i = 0; i < 60; i++) {
          animate(book, [blade({ cut, vz, z: (z += vz * DT) })], DT);
        }
        expect(apart(book.get(1)!)).toBeLessThan(0.005);
        for (let i = 0; i < CUTS[cut].ticks; i++) {
          animate(book, [blade({ cut, vz, z: (z += vz * DT), swing: CUTS[cut].ticks - i })], DT);
          // Within 3 cm: the arms run out of reach for a few frames of a sprint's follow-through.
          expect(apart(book.get(1)!)).toBeLessThan(0.03);
        }
      }
    }
  });

  it.each([
    [CUT.THRUST, 'thrusts: the point goes out ahead of it, toward -z'],
    [CUT.LEFT, 'cuts from its left to its right, toward +x'],
    [CUT.RIGHT, 'cuts from its right to its left, toward -x'],
    [CUT.SLASH, 'slashes down from over its head'],
  ])('does cut %i with the arms: %s', (cut, _name) => {
    const { out } = frames(cut);
    const { ticks, strike } = CUTS[cut];
    /** The frame at the share `k` of the swing. */
    const tick = (k: number) => Math.round(k * ticks);
    const path = out.map(v => tipOf(v));
    // A big move: over a metre and a half of the point, readable from far away.
    const total = path
      .slice(1)
      .reduce((n, q, i) => n + Math.hypot(...q.map((c, k) => c - path[i][k])), 0);
    expect(total).toBeGreaterThan(2);
    // Where it is at the strike: ahead of the runner (z = -3, ahead is -z), around the height of the eyes.
    expect(path[strike][2]).toBeLessThan(-3 - 0.7);
    if (cut == CUT.THRUST) {
      expect(path[strike][2]).toBeLessThan(path[tick(0.3)][2] - 0.2);
    } else if (cut == CUT.SLASH) {
      // Raised over the head and behind it, then down to below the hips.
      expect(path[tick(0.28)][1]).toBeGreaterThan(path[strike][1] + 0.5);
      expect(path[tick(0.28)][2]).toBeGreaterThan(-3);
      expect(path[strike][1]).toBeGreaterThan(path[tick(0.55)][1] + 0.8);
    } else {
      const s = cut == CUT.LEFT ? 1 : -1;
      expect(s * path[strike + 3][0]).toBeGreaterThan(s * path[strike - 4][0] + 0.8);
      // The runner faces -z: its right is +x. Wound up out at one side, finished out at the other.
      expect(s * (path[tick(0.24)][0] - 5)).toBeLessThan(-0.3);
      expect(s * (path[tick(0.6)][0] - 5)).toBeGreaterThan(0.3);
      expect(path[tick(0.6)][1]).toBeLessThan(1 + 1.3);
    }
    // The cut ends where the carry was: the blade upright.
    expect(path.at(-1)![1]).toBeGreaterThan(1 + 2.1);
  });

  it('turns the trunk into the cut: the shoulders go with the blade', () => {
    /** How far the right shoulder is ahead of the left (it faces -z): the chest turned to its left when positive. */
    const turned = (cut: number, k: number) => {
      const book = new Map<number, Runner>();
      animate(book, [blade({ cut })], DT);
      animate(book, [blade({ cut, swing: Math.round(CUTS[cut].ticks * (1 - k)) })], DT);
      const r = book.get(1)!;
      const s = solve(brandish(r.gait.pose(), r.p, r.prog, r.gait.phase));
      return s.pos[J.ARM_L][2] - s.pos[J.ARM_R][2];
    };
    // Wound up to the left, then through to the right, and the other way from the right.
    expect(turned(CUT.LEFT, 0.22)).toBeGreaterThan(0.04);
    expect(turned(CUT.LEFT, 0.6)).toBeLessThan(-0.06);
    expect(turned(CUT.RIGHT, 0.22)).toBeLessThan(-0.04);
    expect(turned(CUT.RIGHT, 0.6)).toBeGreaterThan(0.06);
  });

  it('leaves a ribbon of light behind the blade through the cut only, which fades after it', () => {
    const book = new Map<number, Runner>();
    animate(book, [blade({ cut: CUT.LEFT })], DT);
    const r = book.get(1)!;
    const marks: number[] = [];
    for (let i = 0; i < CUTS[CUT.LEFT].ticks; i++) {
      animate(book, [blade({ cut: CUT.LEFT, swing: CUTS[CUT.LEFT].ticks - i })], DT);
      soldier([], r, GREEN, 1);
      marks.push(r.trail.count);
    }
    expect(marks[1]).toBe(0);
    expect(marks[12]).toBeGreaterThan(3);
    // The cut is over at 0.6 of the swing (tick 20): the ribbon fades in about 0.15 s, and is gone.
    expect(marks[20]).toBeGreaterThan(0);
    expect(marks[31]).toBe(0);
    // A runner with the gun never makes one.
    const gunner = new Map<number, Runner>();
    animate(gunner, [man({ ammo: 30, swing: 5, cut: CUT.LEFT })], DT);
    soldier([], gunner.get(1)!, GREEN, 1);
    expect(gunner.get(1)!.trail.count).toBe(0);
  });

  it('eases the swing between the snapshots: it runs on with the time, never far ahead of the count', () => {
    const book = new Map<number, Runner>();
    const t = CUTS[CUT.SLASH].ticks;
    animate(book, [blade({ cut: CUT.SLASH })], DT);
    expect(book.get(1)!.prog).toBe(-1);
    animate(book, [blade({ cut: CUT.SLASH, swing: t - 6 })], DT);
    const r = book.get(1)!;
    expect(r.prog).toBeCloseTo(6 / t, 6);
    // Snapshots every second tick, frames at 144 Hz: it moves on between them, stays within two ticks of the count.
    for (let i = 0; i < 10; i++) {
      animate(book, [blade({ cut: CUT.SLASH, swing: t - 6 })], 1 / 144);
      expect(r.prog).toBeLessThanOrEqual(8 / t + 1e-9);
    }
    expect(r.prog).toBeGreaterThan(6 / t);
    animate(book, [blade({ cut: CUT.SLASH, swing: 0 })], DT);
    expect(r.prog).toBe(-1);
  });

  it('keeps the vertices finite and the unit normals in every cut, move and level', () => {
    for (const cut of [0, 1, 2, 3]) {
      for (const o of [{}, { vz: -9 }, { yaw: 2.2, pitch: 0.6 }, { mode: MODE.SLIDE, vz: -8 }]) {
        for (const lod of [0, 1]) {
          const { out } = frames(cut, o, lod);
          for (const v of [out[3], out[10], out[20]]) {
            expect(v.length % (3 * STRIDE)).toBe(0);
            for (let i = 0; i < v.length; i += STRIDE) {
              expect(v.slice(i, i + STRIDE).every(Number.isFinite)).toBe(true);
              expect(Math.hypot(v[i + 3], v[i + 4], v[i + 5])).toBeCloseTo(1);
            }
          }
        }
      }
    }
    // 32 frames of skinning: past vitest's 5 s on a busy CI runner.
  }, 30_000);
});

describe('a runner the rail gun’s bolt puts down', () => {
  it('comes apart over FRY seconds from the moment he goes down, and only when fried', () => {
    const down = (left: number, fry = true) =>
      fried({ ...STILL, fried: fry, down: left } as PlayerState);
    expect(down(DOWN_TICKS)).toBe(0);
    expect(down(DOWN_TICKS - (FRY * TICK_HZ) / 2)).toBeCloseTo(0.5, 6);
    expect(down(1)).toBe(1);
    expect(down(DOWN_TICKS / 2, false)).toBe(0);
    expect(down(0)).toBe(0);
  });

  it('glows, drifts up and thins to nothing', () => {
    const tris = 400;
    const make = () =>
      Array.from({ length: tris * 3 }, () => [0, 1, 0, 0, 1, 0, 0.5, 0.2, -1, 0.1]).flat();
    const whole = make();
    dissolve(whole, 0, 0);
    expect(whole).toEqual(make());
    const half = [1, 2, 3, ...make()];
    dissolve(half, 3, 0.5);
    // The vertices before `from` are not touched.
    expect(half.slice(0, 3)).toEqual([1, 2, 3]);
    const n = (half.length - 3) / (3 * STRIDE);
    expect(n).toBeGreaterThan(tris * 0.4);
    expect(n).toBeLessThan(tris * 0.6);
    for (let o = 3; o < half.length; o += STRIDE) {
      expect(half[o + 8]).toBe(-2);
      expect(half[o + 1]).toBeGreaterThanOrEqual(1);
    }
    const gone = make();
    dissolve(gone, 0, 1);
    expect(gone).toHaveLength(0);
  });
});

describe('a runner with the rail gun', () => {
  it('puts it away on a wall-run, and takes it back while its bolt goes out', () => {
    for (const zapping of [false, true]) {
      const r = hold({
        mode: MODE.WALLRUN,
        ground: false,
        y: 1.2,
        wall: SIDE.EAST,
        vz: -8,
        rail: 100,
        railed: true,
        zapping,
      });
      const out: number[] = [];
      soldier(out, r, [0.1, 0.8, 0.2], 3);
      const shine = out.filter((v, i) => i % STRIDE == 8 && v == SHINE).length;
      expect(shine > 0).toBe(zapping);
      const { s } = stance(r);
      const [at] = foregrip(s.pos[J.HAND_R], s.rot[J.HAND_R]);
      expect(Math.hypot(...s.pos[J.HAND_L].map((v, i) => v - at[i])) < 0.1).toBe(zapping);
    }
  });

  it('holds it in both hands, the left round the front grip, standing, running and looking up or down', () => {
    for (const [vz, pitch] of [
      [0, 0],
      [0, -0.5],
      [0, 0.5],
      [-6, 0],
      [-9, 0],
    ]) {
      const p = {
        id: 1,
        x: 0,
        y: 0,
        z: 0,
        vy: 0,
        yaw: 0,
        ground: true,
        ...STILL,
        vz,
        pitch,
        rail: 100,
        railed: true,
      } as PlayerState;
      const book = new Map<number, Runner>();
      for (let i = 0; i < 60; i++) {
        animate(book, [p], 1 / 60);
      }
      const { s } = stance(book.get(p.id)!);
      const [at] = foregrip(s.pos[J.HAND_R], s.rot[J.HAND_R]);
      const q = s.rot[J.HAND_L];
      const [fing, x] = [turn(q, [0, -1, 0]), turn(q, [1, 0, 0])];
      const palm = [0, 1, 2].map(i => s.pos[J.HAND_L][i] + fing[i] * 0.078 + x[i] * 0.022);
      expect(Math.hypot(...palm.map((v, i) => v - at[i]))).toBeLessThan(0.01);
    }
  });
});
