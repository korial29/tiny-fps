import { describe, expect, it } from 'vitest';
import {
  CUTS,
  DASH_COOLDOWN,
  DOWN_TICKS,
  PLAYER_H,
  PLAYER_R,
  BLOW,
  PUNCH,
  PUNCHES,
} from '../shared/constants';
import { STILL } from '../shared/physics';
import { CUT, MODE, SIDE, TEX } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { build } from '../shared/world';
import type { WorldDef } from '../shared/world';
import { MUZZLE, REAR, RIFLE_CURL, aimed, button, grip, gun, tip } from './gun';
import { axes } from './katana';
import { inv } from './body';
import type { Solved } from './body';
import { STRIDE, basis, dot, sub } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, turn } from './rig';
import { GRIN, animate, createRunner, grasp, soldier, stance } from './soldier';
import type { Runner } from './soldier';
import { palette, shaved } from './skin';
import { CH, lookOf, toneOf } from './features';
import { POSE } from './expression';
import { EMBER } from './cigar';

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

  it('angers a runner who is hit or tackled, for 4 s', () => {
    const book = new Map<number, Runner>();
    animate(book, [man({ hp: 100 })], DT);
    animate(book, [man({ hp: 100 })], DT);
    expect(book.get(1)!.mad).toBe(0);
    animate(book, [man({ hp: 80 })], DT);
    expect(book.get(1)!.mad).toBe(4);
    for (let i = 0; i < 250; i++) {
      animate(book, [man({ hp: 80 })], DT);
    }
    expect(book.get(1)!.mad).toBe(0);
    animate(book, [man({ hp: 80, stun: 40 })], DT);
    expect(book.get(1)!.mad).toBe(4);
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
    const speck = (p: number[]) => p[4] == 1.3 || p[4] == 0.25 || p[4] == EMBER[0];
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

  describe('hands', () => {
    /** The bare fingertips of the hand on the wrist `j`: the skin within a hand's length of it. */
    const tips = (v: number[], s: Solved, j: number) =>
      dyed(rows(v), SKIN).filter(p => Math.hypot(...sub(p.slice(0, 3) as Vec3, s.pos[j])) < 0.22);
    const drawn = (r: Runner, lod: number, helmets = false) => {
      const out: number[] = [];
      const s = soldier(out, r, GREEN, lod, helmets)!;
      return { out, s };
    };

    it('have four fingers and a thumb, bare at their tips, near and close; far, mittens', () => {
      const r = hold({});
      for (const lod of [0, 1, 3]) {
        const { out, s } = drawn(r, lod);
        for (const j of [J.HAND_L, J.HAND_R]) {
          const t = tips(out, s, j);
          if (lod) {
            expect(t.length).toBeGreaterThan(100);
          } else {
            expect(t.length).toBe(0);
          }
        }
      }
    });

    it('in a space suit, have gloves over the tips too', () => {
      const { out, s } = drawn(hold({}), 3, true);
      expect(tips(out, s, J.HAND_R).length).toBe(0);
    });

    it('close round the katana’s grip, near and close', () => {
      const r = hold({ blade: true, wield: true });
      for (const lod of [1, 3]) {
        const { out, s } = drawn(r, lod);
        const hilt = grip(s.pos[J.HAND_R], s.rot[J.HAND_R]);
        const way = axes(s.rot[J.HAND_R])[2];
        const t = tips(out, s, J.HAND_R);
        expect(t.length).toBeGreaterThan(100);
        const off = t
          .map(p => {
            const d = sub(p.slice(0, 3) as Vec3, hilt);
            return Math.hypot(...sub(d, way.map(v => v * dot(d, way)) as Vec3));
          })
          .sort((a, b) => a - b);
        // Round the grip, 2.5 cm thick, the fingers 2 cm: an open hand reaches 12 cm and more off it.
        expect(off[off.length >> 1]).toBeLessThan(0.035);
        expect(off[off.length - 1]).toBeLessThan(0.06);
      }
    });

    it('are fists with nothing in them and open in the air', () => {
      const reach = (o: Partial<PlayerState>) => {
        const { out, s } = drawn(hold(o), 3);
        return Math.max(
          ...tips(out, s, J.HAND_R).map(p =>
            Math.hypot(...sub(p.slice(0, 3) as Vec3, s.pos[J.HAND_R])),
          ),
        );
      };
      expect(reach({})).toBeLessThan(0.13);
      expect(reach({ mode: MODE.AIR, ground: false, vy: 5, vz: -6 })).toBeGreaterThan(0.16);
    });

    it('close round what they hold, flat on a ledge, limp lying down', () => {
      expect(grasp(man())).toEqual([1, 1]);
      expect(grasp(man({ blade: true, wield: true }))).toEqual([0.9, 0.9]);
      expect(grasp(man({ ammo: 5 }))[1]).toBe(0.9);
      expect(grasp(man({ ammo: 5 }))[0]).toBeLessThan(0.9);
      expect(grasp(man({ rifled: true, ammo: 5 }))).toEqual([RIFLE_CURL, 0.9]);
      expect(grasp(man({ ...HANGS }))).toEqual([0.1, 0.1]);
      expect(grasp(man({ down: 100, hp: 0 }))).toEqual([0.3, 0.3]);
    });
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

describe('a runner’s blows (the user, 2026-11-13: jab, cross, hook, lunge; the one hit flinches)', () => {
  /** The runner after standing bare-handed, then the pose at the strike of the blow `b`. */
  const at = (b: number) => {
    const book = new Map<number, Runner>();
    for (let i = 0; i < 90; i++) {
      animate(book, [man()], DT);
    }
    const guard = stance(book.get(1)!).s;
    let s = guard;
    for (let k = PUNCHES[b].ticks; k >= PUNCHES[b].ticks - PUNCHES[b].strike - 1; k--) {
      animate(book, [man({ cut: b, swing: k })], DT);
      s = stance(book.get(1)!).s;
    }
    return { guard, s };
  };
  const ahead = (s: ReturnType<typeof stance>['s'], j: number) =>
    -(s.pos[j][2] - s.pos[J.CHEST][2]);

  it('strikes with the left for a jab and a hook, the right for a cross and a lunge, the lunge furthest', () => {
    const [jab, cross, hook, lunge] = [BLOW.JAB, BLOW.CROSS, BLOW.HOOK, BLOW.LUNGE].map(at);
    expect(ahead(jab.s, J.HAND_L)).toBeGreaterThan(ahead(jab.s, J.HAND_R) + 0.3);
    expect(ahead(cross.s, J.HAND_R)).toBeGreaterThan(ahead(cross.s, J.HAND_L) + 0.3);
    expect(ahead(cross.s, J.HAND_R)).toBeGreaterThan(0.5);
    expect(ahead(lunge.s, J.HAND_R)).toBeGreaterThan(ahead(cross.s, J.HAND_R));
    // The hook's fist comes round: ahead of him and across his middle, its elbow out as wide as
    // the shoulder, the fist at the shoulder's height.
    const x = (j: number) => hook.s.pos[j][0] - hook.s.pos[J.CHEST][0];
    expect(ahead(hook.s, J.HAND_L)).toBeGreaterThan(0.25);
    expect(x(J.FOREARM_L)).toBeLessThan(x(J.ARM_L) + 0.05);
    expect(x(J.HAND_L)).toBeGreaterThan(x(J.FOREARM_L) + 0.15);
    expect(Math.abs(hook.s.pos[J.HAND_L][1] - hook.s.pos[J.ARM_L][1])).toBeLessThan(0.1);
  });

  it('throws back the head of the nearest he reaches when the host counts a blow, and nobody else', () => {
    const world = build({
      brushes: [{ min: [-20, 0, -20], max: [20, 1, 20], top: TEX.TILE, side: TEX.BRICK }],
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
    });
    const book = new Map<number, Runner>();
    // He faces -z; one a metre ahead facing him, one behind him.
    const puncher = (hits: number) => man({ id: 1, x: 0, z: 0, cut: BLOW.CROSS, swing: 12, hits });
    const near = man({ id: 2, x: 0, z: -1.2, yaw: Math.PI });
    const behind = man({ id: 3, x: 0, z: 1.2 });
    for (let i = 0; i < 30; i++) {
      animate(book, [puncher(0), near, behind], DT, world);
    }
    expect(book.get(2)!.flinch).toBe(0);
    const head = stance(book.get(2)!).s.pos[J.HEAD];
    animate(book, [puncher(1), near, behind], DT, world);
    expect(book.get(2)!.flinch).toBeGreaterThan(0.9);
    expect(book.get(3)!.flinch).toBe(0);
    // A few frames on, his head is thrown back (toward -z, away from the blow); then it comes back.
    for (let i = 0; i < 4; i++) {
      animate(book, [puncher(1), near, behind], DT, world);
    }
    expect(stance(book.get(2)!).s.pos[J.HEAD][2]).toBeLessThan(head[2] - 0.02);
    const tipped = stance(book.get(2)!).s.rot[J.HEAD];
    for (let i = 0; i < 40; i++) {
      animate(book, [puncher(1), near, behind], DT, world);
    }
    expect(book.get(2)!.flinch).toBe(0);
    expect(stance(book.get(2)!).s.rot[J.HEAD]).not.toEqual(tipped);
  });
});
