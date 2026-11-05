import { describe, expect, it } from 'vitest';
import { DASH_COOLDOWN, PLAYER_H, PLAYER_R } from '../shared/constants';
import { STILL } from '../shared/physics';
import { MODE, SIDE, TEX } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { build } from '../shared/world';
import type { WorldDef } from '../shared/world';
import { STRIDE } from './mesh';
import { animate, createRunner, soldier } from './soldier';
import type { Runner } from './soldier';
import { palette } from './skin';

const DT = 1 / 60;
const DASH_BURST = DASH_COOLDOWN - 2;
const [, , , SKIN, , , SOLE] = palette([0.1, 0.8, 0.2]);
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

  it('stays under 3100 vertices near and about 40% of that far, in every move, as whole triangles', () => {
    for (const o of MOVES) {
      const [near, far] = [1, 0].map(lod => draw(o, lod).length / STRIDE);
      expect(near).toBeLessThan(3100);
      expect(near).toBeGreaterThan(2000);
      expect(far).toBeLessThan(near * 0.45);
      expect(near % 3).toBe(0);
      expect(far % 3).toBe(0);
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

  it('turns with its yaw: the shades, at the front of the face, go where it looks', () => {
    const shades = (yaw: number) =>
      rows(draw({ yaw })).filter(p => p[1] > 1 + 1.55 && p[4] + p[5] + p[6] < 0.15);
    const [a, b] = [shades(0), shades(Math.PI / 2)];
    const mean = (v: number[][], i: number) => v.reduce((s, p) => s + p[i], 0) / v.length;
    expect(a.length).toBeGreaterThan(10);
    expect(mean(a, 2) + 3).toBeLessThan(-0.05);
    expect(Math.abs(mean(a, 0) - 5)).toBeLessThan(0.03);
    expect(mean(b, 0) - 5).toBeLessThan(-0.05);
    expect(Math.abs(mean(b, 2) + 3)).toBeLessThan(0.03);
  });
  // C3 (docs/CHARACTERS.md) poses hang, climb and wall-run for real: the gait's stand-in poses
  // do not put the hands on the ledge or the sole on the wall yet.
  it.todo('draws the hands at the ledge in the world when hanging');
  it.todo('draws the sole on the wall in a wall-run');
});
