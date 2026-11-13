import { describe, expect, it } from 'vitest';
import { ROLE } from '../shared/kit';
import { mask } from './mask';
import {
  CUTS,
  DASH_COOLDOWN,
  DOWN_TICKS,
  PLAYER_H,
  PLAYER_R,
  PUNCH,
  TICK_HZ,
} from '../shared/constants';
import { STILL } from '../shared/physics';
import { CUT, LIMB, MODE, NOBODY, SIDE, TEX } from '../shared/types';
import type { PlayerState, Rover } from '../shared/types';
import { build } from '../shared/world';
import type { WorldDef } from '../shared/world';
import {
  MUZZLE,
  REAR,
  RIFLE_HOLD,
  aimed,
  button,
  foregrip,
  axes as frameOf,
  grip,
  gun,
  railgun,
  rifle,
  tip,
} from './gun';
import { BEHIND, axes } from './katana';
import { FIST, KATANA_LEFT, inv } from './body';
import { SCALE, SHELL } from './helmet';
import { GLOSS, SHINE, STRIDE, add, basis } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, REST, solve, turn } from './rig';
import {
  FRY,
  GRIN,
  animate,
  brandish,
  createRunner,
  dissolve,
  fried,
  seatOf,
  soldier,
  stance,
} from './soldier';
import type { Runner } from './soldier';
import { PACK, pack } from './pack';
import { palette, shaved } from './skin';
import { CH, lookOf, toneOf } from './features';
import { POSE } from './expression';

const DT = 1 / 60;
const DASH_BURST = DASH_COOLDOWN - 2;
// The skin of the player 1, whom man() is.
const [, , , SKIN, , , SOLE, GLOVE] = palette(
  [0.1, 0.8, 0.2],
  undefined,
  undefined,
  false,
  toneOf(1),
);
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
  it('puts a grimace on a runner who loses hp, for 0.4 s', () => {
    const book = new Map<number, Runner>();
    animate(book, [man({ hp: 100 })], DT);
    animate(book, [man({ hp: 100 })], DT);
    expect(book.get(1)!.hurt).toBe(0);
    animate(book, [man({ hp: 80 })], DT);
    expect(book.get(1)!.hurt).toBe(0.4);
    for (let i = 0; i < 30; i++) {
      animate(book, [man({ hp: 80 })], DT);
    }
    expect(book.get(1)!.hurt).toBe(0);
  });

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

  it('stays under 12000 vertices near and about a quarter of that far, in every move, as whole triangles', () => {
    for (const o of MOVES) {
      const [near, far] = [1, 0].map(lod => draw(o, lod).length / STRIDE);
      expect(near).toBeLessThan(12000);
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
    // The eyes' specks glow too, dash or not, and the spare's top at the pouch's mouth.
    const speck = (p: number[]) => p[4] == 1.3 || p[4] == 0.25;
    const glow = dash.filter(p => p[3] == -2 && !speck(p));
    expect(glow.length).toBeGreaterThan(15);
    expect(dash.length - glow.length).toBe(plain);
    expect(draw({ vz: -14 }).length / STRIDE).toBe(plain);
    expect(rows(draw({ vz: -14 })).every(p => p[3] == -1 || speck(p))).toBe(true);
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
      // In its guard, the knees bent and the trunk leaning forward: a little under PLAYER_H.
      expect(Math.max(...v.map(p => p[1]))).toBeGreaterThan(1 + PLAYER_H - 0.14);
      expect(Math.max(...v.map(p => p[1]))).toBeLessThanOrEqual(1 + PLAYER_H + 1e-6);
      // All but the arms of his bare-handed guard, held out before him: the lead hand reaches
      // up to 35 cm past the cylinder (a wall he stands against does not stop it).
      const far = Math.max(...v.map(p => Math.hypot(p[0] - 5, p[2] + 3)));
      expect(far).toBeLessThan(PLAYER_R + 0.35);
      // And the feet of his long stance, some centimetres past it.
      const legs = v.filter(p => p[1] < 1 + 1 || p[1] > 1 + 1.5);
      const wide = Math.max(...legs.map(p => Math.hypot(p[0] - 5, p[2] + 3)));
      expect(wide).toBeLessThan(PLAYER_R + 0.15);
    }
  });

  it('is a runner: the jacket in the colour, dark trousers, skin, hair and light shoes', () => {
    const v = rows(draw());
    const jacket = dyed(v, GREEN);
    expect(jacket.length).toBeGreaterThan(300);
    expect(Math.min(...jacket.map(p => p[1]))).toBeGreaterThan(1 + 0.84);
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
      // Each foot takes the wall in turn (the user, 2026-11-09), both on it for a moment, and over
      // the stride a shoe swings well off it.
      expect(dist.some(d => d.filter(x => x > 0.1).length > 20)).toBe(true);
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
      // The model, then its button, last.
      const knob: number[] = [];
      button(knob, 0, 0, 1, [1, 1, 1]);
      const first = v.length / STRIDE - (model.length + knob.length) / STRIDE;
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

  describe('in the middle guard (the user, 2026-11-10: stand like a samurai)', () => {
    const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    /** The angle between two directions, degrees. */
    const off = (a: number[], b: number[]) =>
      (Math.acos(Math.min(1, dot(a, b) / Math.hypot(...a) / Math.hypot(...b))) * 180) / Math.PI;
    /** The runner in the guard and his stance; `at` puts a point in his own frame: to his right, up from his feet, ahead. */
    const guard = (o: Partial<PlayerState> = {}) => {
      const r = hold(blade(o), 90);
      const { s } = stance(r);
      const [c, sn] = [Math.cos(r.p.yaw), Math.sin(r.p.yaw)];
      const at = (v: number[]) => {
        const [x, y, z] = sub(v, [r.p.x, r.p.y, r.p.z]);
        return [x * c - z * sn, y, -x * sn - z * c];
      };
      const hilt = grip(s.pos[J.HAND_R], s.rot[J.HAND_R]);
      const way = axes(s.rot[J.HAND_R])[2];
      return { s, at, hilt, way, dir: sub(at(add(hilt, way)), at(hilt)) };
    };

    it('stands with the right foot forward and the left heel off the floor, the feet a shoulder apart, the knees soft', () => {
      for (const yaw of [0, 2.2]) {
        const { s, at } = guard({ yaw });
        const [left, right] = [at(s.pos[J.FOOT_L]), at(s.pos[J.FOOT_R])];
        // Shoulder width: the shoulder joints are 38 cm apart.
        expect(right[0] - left[0]).toBeGreaterThan(0.28);
        expect(right[0] - left[0]).toBeLessThan(0.42);
        // About a foot's length ahead.
        expect(right[2] - left[2]).toBeGreaterThan(0.22);
        expect(right[2] - left[2]).toBeLessThan(0.35);
        // The left heel up on the ball of the foot, the toes of both on the floor.
        expect(left[1] - right[1]).toBeGreaterThan(0.025);
        expect(Math.abs(at(s.pos[J.TOE_L])[1] - at(s.pos[J.TOE_R])[1])).toBeLessThan(0.005);
        for (const j of [J.THIGH_L, J.THIGH_R]) {
          const knee = off(sub(s.pos[j], s.pos[j + 1]), sub(s.pos[j + 2], s.pos[j + 1]));
          expect(knee).toBeGreaterThan(130);
          expect(knee).toBeLessThan(165);
        }
      }
    });

    it('stands square and straight: the hips and the shoulders face the foe, the back upright', () => {
      const { s } = guard();
      for (const j of [J.PELVIS, J.CHEST]) {
        expect(off(turn(s.rot[j], [0, 0, -1]), [0, 0, -1])).toBeLessThan(8);
      }
      expect(off(turn(s.rot[J.CHEST], [0, 1, 0]), [0, 1, 0])).toBeLessThan(7);
      // The shoulders level and as far ahead as each other.
      const across = sub(s.pos[J.ARM_R], s.pos[J.ARM_L]);
      expect(Math.abs(across[1])).toBeLessThan(0.03);
      expect(Math.abs(across[2])).toBeLessThan(0.03);
    });

    it('holds the grip before the navel on the middle of the body, the right hand at the guard and the left at the pommel', () => {
      for (const vz of [0, -3, -6]) {
        const { s, at, hilt, way } = guard({ vz });
        const [x, y, z] = sub(at(hilt), at(s.pos[J.PELVIS]));
        expect(Math.abs(x)).toBeLessThan(0.06);
        // The navel is a hand over the hips' joint; a fist or two ahead of the belly, 13 cm ahead of the joint.
        expect(y).toBeGreaterThan(0.03);
        expect(y).toBeLessThan(0.2);
        expect(z).toBeGreaterThan(0.3);
        expect(z).toBeLessThan(0.48);
        // The left hand's hold, BEHIND the right's down the grip, toward the pommel.
        const q = s.rot[J.HAND_L];
        const [fing, back] = [turn(q, [0, -1, 0]), turn(q, [1, 0, 0])];
        const left = s.pos[J.HAND_L].map(
          (v, i) => v + fing[i] * KATANA_LEFT[0] + back[i] * KATANA_LEFT[1],
        );
        expect(dot(sub(hilt, left), way)).toBeCloseTo(BEHIND, 2);
        // Both elbows bent and down.
        for (const j of [J.ARM_L, J.ARM_R]) {
          const elbow = off(sub(s.pos[j], s.pos[j + 1]), sub(s.pos[j + 2], s.pos[j + 1]));
          expect(elbow).toBeGreaterThan(90);
          expect(elbow).toBeLessThan(140);
          expect(s.pos[j + 1][1]).toBeLessThan(s.pos[j][1] - 0.1);
        }
      }
    });

    it("points the blade ahead and up at a foe's throat, running or standing", () => {
      for (const vz of [0, -3, -6, -9]) {
        const { at, hilt, dir } = guard({ vz });
        // Some 28 degrees over the level, along the way he faces.
        const rise = (Math.atan2(dir[1], Math.hypot(dir[0], dir[2])) * 180) / Math.PI;
        expect(rise).toBeGreaterThan(20);
        expect(rise).toBeLessThan(35);
        expect(Math.abs(Math.atan2(dir[0], dir[2]))).toBeLessThan(0.1);
        // The point between a throat and the eyes of a man his height, a blade's length ahead.
        const out: number[] = [];
        const r = hold(blade({ vz }), 90);
        soldier(out, r, GREEN, 1);
        const point = tipOf(out, r.p);
        expect(point[1] - r.p.y).toBeGreaterThan(1.35);
        expect(point[1] - r.p.y).toBeLessThan(1.7);
        expect(r.p.z - point[2]).toBeGreaterThan(at(hilt)[2] + 0.8);
      }
    });
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
          i =>
            s.pos[J.HAND_L][i] +
            fing[i] * KATANA_LEFT[0] +
            back[i] * KATANA_LEFT[1] -
            (at[i] - BEHIND * ax[2][i]),
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
      // The runner faces -z: its right is +x. Wound up high on one side, finished low on the other.
      expect(s * (path[tick(0.24)][0] - 5)).toBeLessThan(-0.3);
      expect(s * (path[tick(0.6)][0] - 5)).toBeGreaterThan(0.3);
      expect(path[tick(0.6)][1]).toBeLessThan(path[tick(0.24)][1] - 0.5);
    }
    // The cut starts from the guard and ends in it, with no jump: the point at a throat's height, ahead.
    for (const q of [path[0], path.at(-1)!]) {
      expect(q[1]).toBeGreaterThan(1 + 1.35);
      expect(q[1]).toBeLessThan(1 + 1.7);
      expect(q[2]).toBeLessThan(-3 - 1.1);
    }
    // It eases out of the guard and back into it: the point goes centimetres a frame there.
    const step = (i: number) => Math.hypot(...path.at(i)!.map((c, k) => c - path.at(i - 1)![k]));
    [1, 2].forEach(i => expect(step(i)).toBeLessThan(0.3));
    [-1, -2, -3, -4, -5, -6].forEach(i => expect(step(i)).toBeLessThan(0.2));
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

  it('wears a helmet when asked, in the team colour, on the head, and not on a head that is cut off', () => {
    const r = hold({}, 5);
    const [bare, capped] = [[], []] as number[][];
    soldier(bare, r, [0.9, 0.1, 0.1], 1);
    soldier(capped, r, [0.9, 0.1, 0.1], 1, true);
    expect(capped.length).toBeGreaterThan(bare.length);
    // Every added vertex is near a joint: the helmet, and the space suit's pack, hose and armour
    // plates.
    const { pos } = solve(r.gait.pose());
    const off = (i: number, j: number) =>
      Math.hypot(...[0, 1, 2].map(k => capped[i + k] - pos[j][k]));
    for (let i = bare.length; i < capped.length; i += STRIDE) {
      expect(Math.min(...pos.map((_, j) => off(i, j)))).toBeLessThan(0.35);
    }
    // A head the katana took off wears no helmet and no hose: the body keeps its pack and armour.
    const cut = hold({ down: 200, hp: 0, lost: LIMB.HEAD }, 30);
    expect(cut.cut?.limb).toBe(LIMB.HEAD);
    const [a, b, suit] = [[], [], []] as number[][];
    soldier(a, cut, [0.9, 0.1, 0.1], 1);
    const sk = soldier(b, cut, [0.9, 0.1, 0.1], 1, true)!;
    pack(suit, sk.pos[J.CHEST], sk.rot[J.CHEST], [0.9, 0.1, 0.1], 1);
    // The armour is cut out of the stump's skin: it comes after it, so the rest is at least as much.
    expect(b.length).toBeGreaterThanOrEqual(a.length + suit.length);
  });
});

describe('the ninja', () => {
  it('wears his own armour on an armoured map, over the black suit, and the face guard', () => {
    const team = [0.15, 0.4, 1];
    const [marine, ninja, bare] = [[], [], []] as number[][];
    soldier(marine, hold({}, 5), team, 3, false, true);
    const r = hold({}, 5);
    r.look = { role: ROLE.NINJA };
    soldier(ninja, r, team, 3, false, true);
    soldier(bare, hold({}, 5), team, 3);
    const guard: number[] = [];
    mask(guard, [0, 0, 0], [0, 0, 0, 1]);
    // Fewer plates than the marine, but some: his vest, his bracers, his shin guards and his shoulder pads, in the team's colour.
    expect(ninja.length).toBeGreaterThan(bare.length + guard.length);
    expect(marine.length).toBeGreaterThan(ninja.length);
    // Heights from his feet.
    const plated = (v: number[], lo: number, hi: number) => {
      let [n, feet] = [0, Infinity];
      for (let i = 0; i < v.length; i += STRIDE) {
        feet = Math.min(feet, v[i + 1]);
      }
      for (let i = 0; i < v.length; i += STRIDE) {
        const y = v[i + 1] - feet;
        // Glossy: a plate, not the suit's stripes.
        n += +(y > lo && y < hi && v[i + 8] == GLOSS && v[i + 6] == team[0]);
      }
      return n;
    };
    // Under the knee pads.
    expect(plated(ninja, 0.2, 0.3)).toBeGreaterThan(0);
    expect(plated(marine, 0.2, 0.3)).toBe(0);
    expect(plated(ninja, 1.25, 1.5)).toBeGreaterThan(0);
    // No plate on his thighs (his bracers hang lower than their tops), and none of the marine's belly plates' gloss on his back's sides.
    expect(plated(ninja, 0.6, 0.8)).toBe(0);
    expect(plated(marine, 0.6, 0.8)).toBeGreaterThan(0);
    // Black where the other wears his team's colour: far more of him is dark.
    const dark = (v: number[]) => {
      let n = 0;
      for (let i = 0; i < v.length; i += STRIDE) {
        n += +(v[i + 6] < 0.1 && v[i + 7] < 0.1 && v[i + 9] < 0.1);
      }
      return n / (v.length / STRIDE);
    };
    expect(dark(ninja)).toBeGreaterThan(0.35);
    expect(dark(ninja)).toBeGreaterThan(dark(bare) * 2);
  });
});

describe('armour without a helmet (Highline)', () => {
  it('wears plates in the team colour, no helmet, no pack, and no white', () => {
    const r = hold({}, 5);
    const team = [0.15, 0.4, 1];
    const [bare, armored, space] = [[], [], []] as number[][];
    soldier(bare, r, team, 3);
    soldier(armored, r, team, 3, false, true);
    soldier(space, r, team, 3, true);
    expect(armored.length).toBeGreaterThan(bare.length);
    // No helmet: nothing added over the head's top.
    const head = solve(r.gait.pose()).pos[J.HEAD];
    const top = (v: number[]) => {
      let m = -Infinity;
      for (let i = 0; i < v.length; i += STRIDE) {
        m = Math.max(m, v[i + 1]);
      }
      return m;
    };
    expect(top(armored)).toBeLessThan(head[1] + 0.25);
    expect(top(space)).toBeGreaterThan(top(armored));
    // The glossy plates in the team colour; the space suit's white.
    const glossy = (v: number[]) => {
      const c: number[][] = [];
      for (let i = 0; i < v.length; i += STRIDE) {
        if (v[i + 8] == GLOSS) {
          c.push([v[i + 6], v[i + 7], v[i + 9]]);
        }
      }
      return c;
    };
    expect(glossy(armored).some(([r0, g, b]) => b > r0 * 2 && b > g)).toBe(true);
    expect(glossy(armored).some(([r0, g, b]) => r0 > 0.8 && g > 0.8 && b > 0.8)).toBe(false);
    expect(glossy(space).some(([r0, g, b]) => r0 > 0.8 && g > 0.8 && b > 0.8)).toBe(true);
  });
});

describe('riding a rover', () => {
  const rover = (o: Partial<Rover> = {}): Rover => ({
    x: 5,
    y: 1.35,
    z: -3,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0.5,
    pitch: 0.1,
    roll: -0.2,
    wy: 0,
    wp: 0,
    wr: 0,
    steer: 0.3,
    driver: NOBODY,
    rider: NOBODY,
    ...o,
  });
  const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const rides = (o: Partial<PlayerState> = {}) => man({ mode: MODE.RIDE, ground: false, ...o });

  it('finds the seat of who rides by the ids of the rovers: the driver, the rider, nobody on foot or unknown', () => {
    const rs = [
      rover({ driver: 4, rider: 9 }),
      rover({ yaw: -1, steer: -0.1, driver: 1, rider: 2 }),
    ];
    expect(seatOf(rides({ id: 1 }), rs)).toEqual({
      yaw: -1,
      pitch: 0.1,
      roll: -0.2,
      steer: -0.1,
      s: 0,
    });
    expect(seatOf(rides({ id: 2 }), rs)).toEqual({
      yaw: -1,
      pitch: 0.1,
      roll: -0.2,
      steer: -0.1,
      s: 1,
    });
    expect(seatOf(rides({ id: 9 }), rs)).toEqual({
      yaw: 0.5,
      pitch: 0.1,
      roll: -0.2,
      steer: 0.3,
      s: 1,
    });
    expect(seatOf(rides({ id: 3 }), rs)).toBeUndefined();
    expect(seatOf(rides({ id: 1 }))).toBeUndefined();
    expect(seatOf(man({ id: 1 }), rs)).toBeUndefined();
  });

  it('seats a runner in his rover from the first frame, where his state is, facing the nose', () => {
    const book = new Map<number, Runner>();
    const p = rides({ yaw: 2 });
    animate(book, [p], DT, undefined, undefined, [rover({ rider: 1 })]);
    const r = book.get(1)!;
    expect(r.seat?.s).toBe(1);
    const { s, yaw } = stance(r);
    expect(yaw).toBeCloseTo(0.5, 6);
    // Seated: the head a metre over the seat point, not 1.7 m.
    expect(s.pos[J.HEAD][1] - p.y).toBeLessThan(1.05);
    expect(s.pos[J.HEAD][1] - p.y).toBeGreaterThan(0.7);
    expect(Math.hypot(s.pos[J.PELVIS][0] - p.x, s.pos[J.PELVIS][2] - p.z)).toBeLessThan(0.3);
    // Out of it, he is on his feet again.
    for (let i = 0; i < 60; i++) {
      animate(book, [man()], DT, undefined, undefined, [rover()]);
    }
    expect(book.get(1)!.seat).toBeUndefined();
    expect(stance(book.get(1)!).s.pos[J.HEAD][1] - 1).toBeGreaterThan(1.45);
  });

  it('keeps both hands of the driver on the yoke and his weapons away, while a rider holds his', () => {
    const draw = (o: Partial<PlayerState>, seat: Partial<Rover>) => {
      const book = new Map<number, Runner>();
      animate(book, [rides(o)], DT, undefined, undefined, [rover(seat)]);
      const out: number[] = [];
      const s = soldier(out, book.get(1)!, [0.1, 0.8, 0.2])!;
      return { n: out.length / STRIDE, s };
    };
    const bare = draw({}, { driver: 1 }).n;
    for (const o of [
      { ammo: 5 },
      { railed: true, rail: 3 },
      { rifled: true },
      { blade: true, wield: true },
    ]) {
      const driver = draw(o, { driver: 1 });
      expect(driver.n).toBe(bare);
      // On the grips, either side of the column.
      expect(dist(driver.s.pos[J.HAND_L], driver.s.pos[J.HAND_R])).toBeLessThan(0.45);
      expect(dist(driver.s.pos[J.HAND_L], driver.s.pos[J.HAND_R])).toBeGreaterThan(0.25);
      expect(draw(o, { rider: 1 }).n).toBeGreaterThan(bare + 50);
    }
  });

  it("holds a rider's gun out from his seated eye, not from where a standing one would be", () => {
    const book = new Map<number, Runner>();
    let p = rides({ ammo: 5, yaw: 0.5 });
    const rs = [rover({ rider: 1, pitch: 0, roll: 0 })];
    animate(book, [p], DT, undefined, undefined, rs);
    for (let i = 0; i < 20; i++) {
      p = { ...p, shots: p.shots + (i == 5 ? 1 : 0) };
      animate(book, [p], DT, undefined, undefined, rs);
    }
    const { s } = stance(book.get(1)!);
    const hand = s.pos[J.HAND_R][1] - p.y;
    expect(hand).toBeGreaterThan(0.6);
    expect(hand).toBeLessThan(1.05);
    // By the head, not over it.
    expect(hand).toBeLessThan(s.pos[J.HEAD][1] - p.y + 0.12);
  });
});

describe('a runner shouldering a long gun (the user, 2026-11-10: it hung across the belly)', () => {
  /** The rail gun and the laser rifle: what the state holds, the model, and the middle of its butt plate in it. */
  const GUNS = [
    {
      name: 'rail gun',
      kind: 2,
      o: { rail: 100, railed: true },
      model: railgun(1),
      butt: [0, 0.0747, 0.392],
    },
    {
      name: 'laser rifle',
      kind: 3,
      o: { rifle: 60, rifled: true },
      model: rifle(1),
      butt: [0, 0.036, 0.336],
    },
  ];
  const POSES: [string, Partial<PlayerState>][] = [
    ['standing', {}],
    ['turned', { yaw: 2.2 }],
    ['running', { vz: -6 }],
    ['crouched', { mode: MODE.CROUCH }],
    ['crouched and moving', { mode: MODE.CROUCH, vz: -3 }],
    ['looking up', { pitch: 0.6 }],
    ['looking far up', { pitch: 1.1 }],
    ['looking down', { pitch: -0.6 }],
    ['looking far down', { pitch: -1.1 }],
    ['in the air', { mode: MODE.AIR, ground: false, vy: 2 }],
  ];
  const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);
  const far = (a: number[], b: number[]) => Math.hypot(...sub(a, b));
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  /** The angle between two directions, radians. */
  const off = (a: number[], b: number[]) =>
    Math.acos(Math.min(1, dot(a, b) / Math.hypot(...a) / Math.hypot(...b)));
  /** The runner in the pose `o` through `n` more frames, firing on each when asked: his solved stance each frame. */
  const frames = (o: Partial<PlayerState>, fires: boolean, n = 24) => {
    const r = hold(o);
    const book = new Map([[1, r]]);
    return Array.from({ length: n }, (_, i) => {
      const p = { ...r.p, z: r.p.z + (o.vz ?? 0) * DT, shots: r.p.shots + +(fires && i % 6 == 0) };
      animate(book, [p], DT);
      return { p, s: stance(r).s };
    });
  };
  /** The gun in the right hand: a point of its model in the world, and its barrel's way. */
  const gunOf = (s: ReturnType<typeof solve>, kind: number) => {
    const q = s.rot[J.HAND_R];
    const [at, ax] = [grip(s.pos[J.HAND_R], q), frameOf(q)];
    const put = ([x, y, z]: number[]) =>
      at.map((v, i) => v + ax[0][i] * x + ax[1][i] * y - ax[2][i] * z);
    // The rail gun's barrel lies on the long axis, the rifle's along the model's forward.
    return { put, barrel: kind == 2 ? sub(tip(at, ax, 2), put(REAR)) : ax[2] };
  };
  /** `v` in the frame of joint `j`, from the point `o`. */
  const local = (s: ReturnType<typeof solve>, j: number, o: number[], v: number[]) =>
    turn(inv(s.rot[j]), sub(v, o) as Vec3);
  /**
   * Whether the point `v` is in the trunk, the helmet or the pack. The trunk in the chest's frame
   * from the middle of the shoulders at rest: as wide as them, from the hips to the top of the shoulders,
   * its front the armour's as drawn (15 cm ahead in the middle, 9 at the shoulder joints).
   */
  const inBody = (s: ReturnType<typeof solve>, v: number[]) => {
    // The shoulders' line at rest is 17 cm over the chest joint: an arm reaching out moves its own.
    const [x, y, z] = local(s, J.CHEST, add(s.pos[J.CHEST], turn(s.rot[J.CHEST], [0, 0.17, 0])), v);
    const trunk =
      Math.abs(x) < 0.2 &&
      y > -0.5 &&
      y < 0.08 &&
      z < 0.1 &&
      z > -0.075 - 0.075 * (1 - (x / 0.2) ** 2);
    const h = local(s, J.HEAD, s.pos[J.HEAD], v).map((a, i) => (a - SHELL.c[i]) / SCALE);
    const helmet = h.every((a, i) => Math.abs(a) < SHELL.r[i]) && h[1] > SHELL.rim - SHELL.c[1];
    const c = local(s, J.CHEST, s.pos[J.CHEST], v);
    return trunk || helmet || c.every((a, i) => Math.abs(a - PACK.c[i]) < PACK.r[i]);
  };
  /** Where the rig's rest puts the shoulder joint `j`: on its collarbone, unturned from the chest. */
  const socket = (s: ReturnType<typeof solve>, j: number) =>
    add(s.pos[j - 1], turn(s.rot[J.CHEST], REST[j]));
  /** The checks of a shouldered gun in the stance `s`, its barrel meant along `way`. */
  const shouldered = (s: ReturnType<typeof solve>, g: (typeof GUNS)[number], way: number[]) => {
    const { put, barrel } = gunOf(s, g.kind);
    // The butt plate in the hollow of the right shoulder, a hand's width from the joint at most.
    expect(far(put(g.butt), s.pos[J.ARM_R])).toBeLessThan(0.18);
    expect(off(barrel, way)).toBeLessThan(0.06);
    // The right hand is on the grip, which the gun is drawn from: the arm reaches it, not stretched.
    expect(far(s.pos[J.HAND_R], s.pos[J.ARM_R])).toBeLessThan(0.54);
    // The left is round the front grip, the rifle's handguard in its palm.
    const [at] = foregrip(s.pos[J.HAND_R], s.rot[J.HAND_R], g.kind);
    const q = s.rot[J.HAND_L];
    const [fing, x] = [turn(q, [0, -1, 0]), turn(q, [1, 0, 0])];
    const [reach, palm] = g.kind == 3 ? RIFLE_HOLD : FIST;
    expect(
      far(
        s.pos[J.HAND_L].map((v, i) => v + fing[i] * reach + x[i] * palm),
        at,
      ),
    ).toBeLessThan(0.01);
    // Both elbows down: under the shoulder, or under the hand when it aims up over it.
    for (const j of [J.ARM_L, J.ARM_R]) {
      expect(s.pos[j + 1][1]).toBeLessThan(Math.max(s.pos[j][1], s.pos[j + 2][1]));
      // No arm stretches to its grip (the user, 2026-11-10): the shoulder is where the rig has
      // it, the collarbone not turned, the bones are their length and the elbow is bent.
      expect(far(s.pos[j], socket(s, j))).toBeLessThan(0.005);
      expect(far(s.pos[j], s.pos[j + 1])).toBeCloseTo(Math.hypot(...REST[j + 1]), 6);
      expect(far(s.pos[j + 1], s.pos[j + 2])).toBeCloseTo(Math.hypot(...REST[j + 2]), 6);
      const bend = off(sub(s.pos[j], s.pos[j + 1]), sub(s.pos[j + 2], s.pos[j + 1]));
      expect(bend).toBeGreaterThan(1.3);
      expect(bend).toBeLessThan(2.35);
    }
    // The butt in the pocket: before the joint, against the chest plate, a little inside it.
    const [bx, by, bz] = local(s, J.CHEST, s.pos[J.ARM_R], put(g.butt));
    expect(Math.abs(bx + 0.025)).toBeLessThan(0.03);
    expect(Math.abs(by + 0.01)).toBeLessThan(0.03);
    expect(bz).toBeLessThan(-0.1);
    expect(bz).toBeGreaterThan(-0.2);
    // Nothing of the gun in the trunk, the helmet or the pack.
    const inside = rows(g.model).filter(v => inBody(s, put(v))).length;
    expect(inside).toBe(0);
  };

  for (const g of GUNS) {
    for (const [name, o] of POSES) {
      for (const fires of [false, true]) {
        it(`holds the ${g.name} ${name}${fires ? ', firing' : ''}: the butt in the shoulder, the barrel along the look, a hand on each grip, clear of the body`, () => {
          for (const { p, s } of frames({ ...o, ...g.o }, fires)) {
            shouldered(s, g, basis(p.yaw, p.pitch)[2]);
          }
        });
      }
    }

    it(`carries the ${g.name} at the low ready in a sprint, the butt still in the shoulder, and brings it up to fire`, () => {
      for (const { p, s } of frames({ vz: -9, ...g.o }, false)) {
        // The barrel down and across to the left of the look.
        shouldered(s, g, basis(p.yaw + 0.35, -0.6)[2]);
      }
      for (const { p, s } of frames({ vz: -9, ...g.o }, true).slice(1)) {
        shouldered(s, g, basis(p.yaw, p.pitch)[2]);
      }
    });

    it(`follows the look with the ${g.name}, not the last shot: fired at the floor, then looking up`, () => {
      const book = new Map<number, Runner>();
      const at = (i: number) => man({ ...g.o, pitch: i < 30 ? -0.7 : 0.4, shots: Math.min(i, 30) });
      for (let i = 0; i < 120; i++) {
        animate(book, [at(i)], DT);
      }
      const { barrel } = gunOf(stance(book.get(1)!).s, g.kind);
      expect(off(barrel, basis(0, 0.4)[2])).toBeLessThan(0.06);
    });

    it(`keeps the muzzle of the ${g.name} as drawn, from the feet, for its shots to leave from`, () => {
      const r = hold({ ...g.o, yaw: 0.7, pitch: 0.2 });
      const s = soldier([], r, [0.1, 0.8, 0.2])!;
      const q = s.rot[J.HAND_R];
      const m = tip(grip(s.pos[J.HAND_R], q), frameOf(q), g.kind);
      expect(far(r.tip!, sub(m, [r.p.x, r.p.y, r.p.z]))).toBeLessThan(1e-9);
      // None with the gun, or with no gun in hand.
      const armed = hold({ ammo: 30 });
      soldier([], armed, [0.1, 0.8, 0.2]);
      expect(armed.tip).toBeUndefined();
    });
  }
});

describe('a runner’s face (expression.ts): what he does shows on it', () => {
  const GREEN = [0.1, 0.8, 0.2];
  /** Frames of the states `ps`, each animated and drawn as the renderer does: the runner of player 1 after them. */
  const play = (book: Map<number, Runner>, ps: PlayerState[], n = 1, lod = 1) => {
    for (let i = 0; i < n; i++) {
      animate(book, ps, DT);
      for (const p of ps) {
        soldier([], book.get(p.id)!, GREEN, lod);
      }
    }
    return book.get(1)!;
  };
  /** The pose's own channels are all at least `share` of the way in. */
  const wears = (r: Runner, pose: number[][], share = 0.7) =>
    pose.every(([ch, v]) => ch == CH.BLINK || r.face.w[ch] >= v * share - 1e-6);

  it('is his own: the traits of his id, his skin, and no length to the hair of a shaved head', () => {
    const book = new Map<number, Runner>();
    const ids = Array.from({ length: 40 }, (_, i) => i);
    animate(
      book,
      ids.map(id => man({ id })),
      DT,
    );
    for (const id of ids) {
      const { w } = book.get(id)!.face;
      const look = lookOf(id);
      expect(w[CH.WIDTH]).toBe(look[CH.WIDTH]);
      expect(w[CH.ASYM]).toBe(look[CH.ASYM]);
      expect(w[CH.HAIR]).toBe(shaved(id) ? 0 : look[CH.HAIR]);
    }
    expect(ids.some(id => shaved(id))).toBe(true);
    // Two players, two heads; the same player twice, the same head.
    const head = (id: number) => {
      const out: number[] = [];
      soldier(out, createRunner(man({ id })), GREEN, 3);
      return rows(out).filter(p => p[1] > 1 + 1.6);
    };
    expect(head(3)).toEqual(head(3));
    const [a, b] = [head(3), head(4)];
    expect(
      a.some((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1], p[2] - b[i][2]) > 0.002),
    ).toBe(true);
    // The skin's tone is in the colours he is drawn with.
    const tone = toneOf(3);
    expect(a.some(p => p[4] == tone[0] && p[5] == tone[1] && p[6] == tone[2])).toBe(true);
  });

  it('is at rest standing, strains in a sprint and on a ledge, is set aiming, shouts in a dash and in a cut', () => {
    const book = new Map<number, Runner>();
    let r = play(book, [man()], 60);
    expect(r.face.k.every(k => k < 0.01)).toBe(true);
    expect(r.face.w[CH.JAW]).toBeLessThan(0.05);
    // A sprint, then a hang: effort.
    r = play(book, [man({ vz: -9 })], 90);
    expect(
      wears(
        r,
        POSE.EFFORT.filter(([ch]) => ch != CH.JAW),
      ),
    ).toBe(true);
    r = play(book, [man()], 240);
    expect(r.face.k[0]).toBeLessThan(0.05);
    r = play(book, [man(HANGS)], 90);
    expect(r.face.k[0]).toBeGreaterThan(0.9);
    // A shot: the gun arm comes up and the face is set, for as long as he aims.
    const still = new Map<number, Runner>();
    play(still, [man({ ammo: 5 })], 30);
    r = play(still, [man({ ammo: 4, shots: 1 })], 12);
    expect(wears(r, POSE.FOCUS)).toBe(true);
    r = play(still, [man({ ammo: 4, shots: 1 })], 180);
    expect(r.face.w[CH.SQUINT]).toBeLessThan(0.2);
    // A dash: a shout, at once, and gone soon after.
    r = play(still, [man({ dash: DASH_BURST })], 6);
    expect(r.face.w[CH.JAW]).toBeGreaterThan(0.6);
    r = play(still, [man()], 60);
    expect(r.face.w[CH.JAW]).toBeLessThan(0.05);
    // A katana's cut.
    const cut = { blade: true, wield: true, cut: CUT.RIGHT, swing: CUTS[CUT.RIGHT].ticks };
    play(still, [man({ blade: true, wield: true })], 5);
    r = play(still, [man(cut)], 6);
    expect(r.prog).toBeGreaterThanOrEqual(0);
    expect(r.face.w[CH.JAW]).toBeGreaterThan(0.6);
    expect(r.face.w[CH.BROW_DOWN]).toBeGreaterThan(0.6);
  });

  it('winces when hit, for under a second, and grimaces down with the eyes shut', () => {
    const book = new Map<number, Runner>();
    play(book, [man({ hp: 5 })], 30);
    let r = play(book, [man({ hp: 4 })], 4);
    expect(r.hurt).toBeGreaterThan(0);
    expect(wears(r, POSE.WINCE, 0.6)).toBe(true);
    expect(r.face.w[CH.BLINK]).toBeGreaterThan(0.5);
    r = play(book, [man({ hp: 4 })], 90);
    expect(r.face.w[CH.GRIT]).toBeLessThan(0.05);
    r = play(book, [man({ hp: 0, down: DOWN_TICKS })], 40);
    expect(wears(r, POSE.DOWN, 0.9)).toBe(true);
    expect(r.face.w[CH.BLINK]).toBeGreaterThan(0.97);
    expect(r.face.w[CH.LOOK_X]).toBeCloseTo(0, 2);
  });

  it('grins for a moment at a foe he has put down, and when his team captures (GRIN seconds)', () => {
    const book = new Map<number, Runner>();
    play(book, [man({ hits: 2 }), man({ id: 2, x: 8 })], 10);
    // His hit lands as the other goes down.
    let r = play(book, [man({ hits: 3 }), man({ id: 2, x: 8, hp: 0, down: DOWN_TICKS })]);
    expect(r.grin).toBeCloseTo(GRIN, 5);
    expect(book.get(2)!.grin).toBe(0);
    r = play(book, [man({ hits: 3 }), man({ id: 2, x: 8, hp: 0, down: DOWN_TICKS - 1 })], 20);
    expect(wears(r, POSE.GRIN)).toBe(true);
    r = play(book, [man({ hits: 3 }), man({ id: 2, x: 8 })], Math.ceil((GRIN + 2) / DT));
    expect(r.grin).toBe(0);
    expect(r.face.w[CH.SMILE]).toBeLessThan(0.15);
    // A hit that puts nobody down is no grin.
    r = play(book, [man({ hits: 4 }), man({ id: 2, x: 8, hp: 3 })], 3);
    expect(r.grin).toBe(0);
    // The renderer's cheer() sets the same clock (a capture).
    r.grin = GRIN;
    r = play(book, [man({ hits: 4 }), man({ id: 2, x: 8 })], 20);
    expect(r.face.w[CH.SMILE]).toBeGreaterThan(0.7);
  });

  it('keeps the eyes on the aim when the head is not: they turn in their sockets, the same side as the look', () => {
    // Looking up past where the neck takes the head, and to a side of a body that has not turned yet.
    const gaze = (o: Partial<PlayerState>) => {
      const book = new Map<number, Runner>();
      const r = play(book, [man({ ammo: 5, shots: 1, ...o })], 30);
      const s = stance(r).s;
      const look = turn(inv(s.rot[J.HEAD]), basis(o.yaw ?? 0, o.pitch ?? 0)[2]);
      return {
        w: r.face.w,
        gx: Math.atan2(look[0], -look[2]),
        gy: Math.atan2(look[1], Math.hypot(look[0], look[2])),
      };
    };
    for (const o of [{ pitch: 1.2 }, { pitch: -1.2 }, {}]) {
      const { w, gx, gy } = gaze(o);
      // Where the eyes are is where the aim is from the head, as far as they turn (0.6 and 0.4 rad), less a small glance.
      expect(Math.abs(w[CH.LOOK_X] - Math.max(-1, Math.min(1, gx / 0.6)))).toBeLessThan(0.25);
      expect(Math.abs(w[CH.LOOK_Y] - Math.max(-1, Math.min(1, gy / 0.4)))).toBeLessThan(0.25);
      expect(Math.hypot(w[CH.LOOK_X], w[CH.LOOK_Y])).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it('moves nothing but the head: the body of a runner with any face is the body he had', () => {
    const body = (w: (r: Runner) => void) => {
      const r = createRunner(man());
      w(r);
      r.face.update = () => {};
      const out: number[] = [];
      soldier(out, r, GREEN, 3);
      return rows(out).filter(p => p[1] < 1 + 1.35);
    };
    const plain = body(() => {});
    expect(
      body(r => {
        for (const [ch, v] of POSE.SHOUT) {
          r.face.w[ch] = v;
        }
      }),
    ).toEqual(plain);
  });
});

describe('a runner who punches (the user, 2026-11-11: hit with the fists)', () => {
  const GREEN = [0.1, 0.8, 0.2];
  /** The runner after standing bare-handed, then the frames of a swing run down a tick a frame. */
  const swing = (o: Partial<PlayerState> = {}) => {
    const book = new Map<number, Runner>();
    for (let i = 0; i < 90; i++) {
      animate(book, [man(o)], DT);
    }
    const guard = stance(book.get(1)!).s;
    const frames = [];
    for (let k = PUNCH.ticks; k >= 0; k--) {
      animate(book, [man({ ...o, swing: k })], DT);
      frames.push(stance(book.get(1)!).s);
    }
    return { book, guard, frames };
  };
  /** How far ahead of the chest (the runner faces -z) a joint is. */
  const ahead = (s: ReturnType<typeof stance>['s'], j: number) =>
    -(s.pos[j][2] - s.pos[J.CHEST][2]);

  it('drives the rear fist straight out at the strike, draws the lead one back to the hip, and is back in his guard after', () => {
    const { book, guard, frames } = swing();
    const strike = frames[PUNCH.strike + 1];
    // The left fist: from half way out in the guard to an arm's length ahead, at the chest's height.
    expect(ahead(strike, J.HAND_L)).toBeGreaterThan(ahead(guard, J.HAND_L) + 0.2);
    expect(ahead(strike, J.HAND_L)).toBeGreaterThan(0.5);
    expect(Math.abs(strike.pos[J.HAND_L][1] - strike.pos[J.ARM_L][1])).toBeLessThan(0.22);
    // The right one comes back from ahead of him to his side.
    expect(ahead(strike, J.HAND_R)).toBeLessThan(ahead(guard, J.HAND_R) - 0.3);
    expect(strike.pos[J.HAND_R][1]).toBeLessThan(strike.pos[J.ARM_R][1] - 0.15);
    // No joint jumps on the way: under 9 cm a frame, the fist at its fastest.
    frames.forEach((s, i) => {
      const was = i ? frames[i - 1] : guard;
      s.pos.forEach((p, j) =>
        expect(Math.hypot(...p.map((v, k) => v - was.pos[j][k]))).toBeLessThan(0.12),
      );
    });
    // The feet do not leave the floor for it.
    expect(strike.pos[J.FOOT_L][1]).toBeCloseTo(guard.pos[J.FOOT_L][1], 2);
    // Half a second later he is in his guard again.
    for (let i = 0; i < 30; i++) {
      animate(book, [man()], DT);
    }
    const back = stance(book.get(1)!).s;
    expect(Math.abs(ahead(back, J.HAND_L) - ahead(guard, J.HAND_L))).toBeLessThan(0.03);
    expect(book.get(1)!.jab).toBeLessThan(0.01);
  });

  it('shouts with it, and throws nothing with a weapon in hand or down', () => {
    const { book } = swing();
    // The face of a cut: the jaw open (soldier() moves the face).
    const r = book.get(1)!;
    for (let k = PUNCH.ticks; k > PUNCH.ticks - 8; k--) {
      animate(book, [man({ swing: k })], DT);
      soldier([], r, GREEN, 1);
    }
    expect(r.face.w[CH.JAW]).toBeGreaterThan(0.5);
    for (const o of [{ ammo: 3 }, { hp: 0, down: DOWN_TICKS }]) {
      const armed = swing(o);
      expect(armed.book.get(1)!.jab).toBe(0);
    }
    // Drawn at every level without a hole: as many vertices as standing.
    const count = (s: Partial<PlayerState>) => {
      const out: number[] = [];
      soldier(out, createRunner(man(s)), GREEN, 1);
      return out.length;
    };
    expect(count({ swing: PUNCH.ticks - PUNCH.strike })).toBe(count({}));
  });
});
