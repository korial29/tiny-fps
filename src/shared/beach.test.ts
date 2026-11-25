import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { problems } from '../../test/pickups';
import { EAST, NORTH, SOUTH, Sim, WEST } from '../../test/pilot';
import { checksum, nodes } from '../../test/relief';
import { fly, go, leap, mirror } from '../../test/routes';
import type { Leg } from '../../test/routes';
import { palette, MAX_TINTS } from '../client/render';
import {
  BEACH,
  CAMP,
  CELL,
  DEPTH,
  EDGE,
  ENGINES,
  FLATS,
  FRAME,
  FURROW,
  HOLD,
  HULL,
  LAYOUT,
  POD,
  RINGS,
  ROCKS,
  TRUNKS,
  WING,
  ZED,
  at,
  walked,
} from './beach';
import { EYE, FLAG_H, FLAG_REACH, PLAYER_H, PLAYER_R, SNAP_EVERY, STEP_H } from './constants';
import { TEAM_TINT } from './map';
import { MAPS } from './maps';
import { rockMid, rockOf } from './moon';
import { move, spawn } from './physics';
import { decodeSnapshot, encodeInput } from './protocol';
import { ground } from './relief';
import { Room } from './room';
import { EV, FLAG, KEY, MODE, TEAM, TEX } from './types';
import type { Conn, PlayerState, Snapshot } from './types';
import { build } from './world';
import type { Brush } from './world';

const world = build(BEACH);
const relief = world.relief!;
const { brushes, teams } = BEACH;
const solid = brushes.filter(b => !b.ghost);
const MID = ZED / 2;

const twin = (b: Brush): Brush => ({
  ...b,
  min: [b.min[0], b.min[1], ZED - b.max[2]],
  max: [b.max[0], b.max[1], ZED - b.min[2]],
});
const same = (a: Brush, b: Brush) =>
  [0, 1, 2].every(
    k => Math.abs(a.min[k] - b.min[k]) < 1e-9 && Math.abs(a.max[k] - b.max[k]) < 1e-9,
  ) &&
  a.top === b.top &&
  a.side === b.side &&
  !a.ghost === !b.ghost;
const tinted = (a: Brush, b: Brush) =>
  a.tint === b.tint ||
  (a.tint === TEAM_TINT[0] && b.tint === TEAM_TINT[1]) ||
  (a.tint === TEAM_TINT[1] && b.tint === TEAM_TINT[0]);
const meets = (b: Brush, x: number, y: number, z: number, h: number) =>
  b.min[0] < x + PLAYER_R &&
  b.max[0] > x - PLAYER_R &&
  b.min[2] < z + PLAYER_R &&
  b.max[2] > z - PLAYER_R &&
  b.min[1] < y + h &&
  b.max[1] > y + 1e-6;
const flipped = ([x, y, z]: number[]) => [x, y, ZED - z];
const pieces = (kind: string, red = true) =>
  LAYOUT.pieces.filter(p => p.kind === kind && (!red || p.min[2] + p.max[2] >= ZED));

/** Red's player on its spawn n. */
const red = (n = 4) => new Sim(spawn(0, world, n, TEAM.RED), world);
/** A run over the sand to a point, to end on the ground there. */
const g = (x: number, z: number, sprint = true): Leg => go(x, z, walked(x, z), sprint);
const blue = (l: Leg[]) => l.map(q => mirror(q, ZED));
/** Out by the legs to the centre line, then on by their mirror, backwards, into blue's half. */
const across = (l: Leg[]) => [...l, ...blue(l.slice(0, -1).reverse())];
const inArea = (p: PlayerState) =>
  p.x < EDGE.east + 1e-3 &&
  p.x > -15 &&
  p.z > EDGE.cape - 1e-3 &&
  p.z < ZED - EDGE.cape + 1e-3 &&
  p.y >= DEPTH - 1e-3;

describe('LANDFALL', () => {
  it('is the beach level: full gravity, the beach scenery, no helmet, a high warm sun, a light haze', () => {
    expect(MAPS.landfall).toBe(BEACH);
    expect(BEACH.name).toBe('Landfall');
    expect(BEACH.gravity ?? 1).toBe(1);
    expect(BEACH.scenery).toBe('beach');
    expect(BEACH.helmets ?? false).toBe(false);
    expect(BEACH.rovers ?? []).toHaveLength(0);
    expect(Math.hypot(...BEACH.sun.dir)).toBeCloseTo(1, 2);
    expect(BEACH.sun.dir[1]).toBeGreaterThan(0.7);
    expect(BEACH.fog![3]).toBeLessThan(0.003);
  });

  it('has brushes with min below max, known textures and tints, under 900 of them, three in four the ghosts of rocks and trunks', () => {
    expect(brushes.length).toBeGreaterThan(300);
    expect(brushes.length).toBeLessThan(900);
    expect(solid.length).toBeLessThan(200);
    const tex: number[] = Object.values(TEX);
    for (const [i, b] of brushes.entries()) {
      for (let a = 0; a < 3; a++) {
        expect(b.min[a], `brush ${i}, axis ${a}`).toBeLessThan(b.max[a]);
      }
      expect(tex).toContain(b.top);
      expect(tex).toContain(b.side);
      expect(b.tint?.every(c => c >= 0 && c <= 1) ?? true).toBe(true);
    }
    expect(palette(world).length).toBeLessThanOrEqual(MAX_TINTS);
  });

  it('keeps the drawn brushes out of each other: touching is fine, overlapping is not', () => {
    for (const [i, a] of solid.entries()) {
      for (const [j, b] of solid.entries()) {
        const overlap = [0, 1, 2].every(
          k => a.min[k] < b.max[k] - 1e-9 && b.min[k] < a.max[k] - 1e-9,
        );
        expect(i === j || !overlap, `brushes ${a.min}..${a.max} and ${b.min}..${b.max}`).toBe(true);
      }
    }
  });

  it('floats nothing but the tarpaulins, the wing and what is on the water: every other brush has its foot in the ground', () => {
    for (const [i, b] of solid.entries()) {
      const [x, z] = [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2];
      const onHull = Math.abs(z - MID) < HULL.r && HULL.sections.some(s => x > s[0] && x < s[1]);
      const afloat = b.max[1] < 0.6 && x < FRAME.shore;
      const roof = b.max[1] - b.min[1] < 1.3 && b.min[1] > walked(x, z) + 2;
      if (!onHull && !afloat && !roof) {
        expect(b.min[1], `brush ${i} at ${x}, ${z}`).toBeLessThan(ground(world, x, z));
        expect(b.max[1], `brush ${i} at ${x}, ${z}`).toBeGreaterThan(ground(world, x, z));
      }
    }
  });
});

describe('LANDFALL, symmetry', () => {
  it('has a mirror twin for every brush across the line z = 100, the blue accents for the red', () => {
    const red = brushes.filter(b => b.tint === TEAM_TINT[0]);
    const blue = brushes.filter(b => b.tint === TEAM_TINT[1]);
    expect(red.length).toBeGreaterThanOrEqual(5);
    expect(red.length).toBe(blue.length);
    expect(red.every(b => b.min[2] > MID + 15)).toBe(true);
    for (const [i, b] of brushes.entries()) {
      const t = twin(b);
      expect(
        brushes.some(o => same(o, t) && tinted(o, b)),
        `brush ${i}`,
      ).toBe(true);
    }
  });

  it('mirrors the bases, the spawns, the racks and the packs, the blue spawns facing back', () => {
    const [r, b] = teams;
    for (const k of ['base', 'rack', 'blade', 'rifle', 'rail'] as const) {
      expect(b[k]).toEqual(flipped(r[k]!));
    }
    expect(b.spawns).toEqual(r.spawns.map(([x, y, z]) => [x, y, ZED - z, Math.PI]));
    expect(r.spawns.every(s => s[3] === 0 && s[2] > POD[1])).toBe(true);
    for (const l of [BEACH.packs!, BEACH.ammo!, BEACH.cells!, BEACH.vests!]) {
      for (const p of l) {
        expect(l).toContainEqual(flipped(p));
      }
    }
  });

  it('lists what the scenery draws on the boxes: every piece a brush, both halves, each kind there', () => {
    for (const kind of [
      'hull',
      'hold',
      'heap',
      'frame',
      'raft',
      'wing',
      'nacelle',
      'engine',
      'float',
      'pod',
      'dais',
      'crate',
      'shelter',
      'panel',
      'container',
      'gear',
    ]) {
      expect(pieces(kind, false).length, kind).toBeGreaterThan(0);
    }
    for (const p of LAYOUT.pieces) {
      expect(
        solid.some(b => same(b, { ...b, min: p.min, max: p.max })),
        `${p.kind} at ${p.min}`,
      ).toBe(true);
      expect(
        LAYOUT.pieces.some(
          q =>
            q.kind === p.kind && same({ ...solid[0], ...q }, twin({ ...solid[0], ...p } as Brush)),
        ),
      ).toBe(true);
    }
    // Every drawn brush is a piece: nothing is left for the artist to guess.
    expect(LAYOUT.pieces).toHaveLength(solid.length);
    expect(LAYOUT.hull).toEqual(HULL.sections.map(([x0, x1], n) => [x0, x1, HULL.axis[n]]));
    expect(LAYOUT.crags).toHaveLength(2 * ROCKS.length);
  });
});

describe('LANDFALL, the sand and the seabed', () => {
  it('is a 4 m lattice round the beach, with no hole, bound by an ellipse the play area is inside', () => {
    expect(relief.cell).toBe(CELL);
    expect(relief.hole).toEqual([0, 0, 0, 0]);
    expect(relief.pits).toHaveLength(0);
    const [cx, cz, a, b] = relief.bound;
    for (const x of [-15, EDGE.east]) {
      for (const z of [0, ZED]) {
        expect(Math.hypot((x - cx) / a, (z - cz) / b)).toBeLessThan(1);
      }
    }
    // No ground is missing anywhere a runner can be, nor under the wreck.
    for (let x = -15; x <= EDGE.east; x += 2.5) {
      for (let z = 0; z <= ZED; z += 2.5) {
        expect(ground(world, x, z)).toBeGreaterThan(-10);
      }
    }
    // walked() is what the physics reads.
    for (let k = 0; k < 400; k++) {
      const [x, z] = [-20 + ((k * 37) % 127) + 0.31, ((k * 53) % 199) + 0.77];
      expect(walked(x, z)).toBeCloseTo(ground(world, x, z), 9);
    }
  });

  it('meets the water at x 30, rises to 2.5 m at the trees and falls to 3 m under it at x 0, and on', () => {
    // Clear of the furrow and of the camp.
    for (const z of [128, 144, 72, 56]) {
      expect(at(FRAME.shore, z)).toBe(FRAME.water);
      expect(at(FRAME.sea, z)).toBeCloseTo(-3, 6);
      expect(at(-20, z)).toBeCloseTo(-5, 6);
      expect(Math.abs(at(FRAME.trees, z) - 2.5)).toBeLessThan(0.5);
      for (let x = -28; x < FRAME.shore; x += CELL) {
        expect(at(x, z)).toBeLessThan(at(x + CELL, z));
      }
      // Wet sand first, level across the beach; the dunes come from mid beach up.
      for (let x = FRAME.shore; x <= 44; x += CELL) {
        expect(at(x, z)).toBeCloseTo((2.5 * (x - FRAME.shore)) / 60, 9);
      }
    }
    const dunes = nodes(relief)
      .filter(([x, z]) => x > 60 && x < FRAME.trees && Math.abs(Math.abs(z - MID) - 36) < 8)
      .map(([x, , h]) => h - (2.5 * (x - FRAME.shore)) / 60);
    expect(Math.max(...dunes)).toBeGreaterThan(0.25);
    expect(Math.max(...dunes)).toBeLessThan(0.6);
    expect(Math.min(...dunes)).toBeLessThan(-0.15);
    expect(Math.min(...dunes)).toBeGreaterThan(-0.5);
  });

  it('is the same on both sides of the centre line, node for node', () => {
    for (const [x, z, h] of nodes(relief)) {
      expect(h).toBe(Math.fround(at(x, ZED - z)));
      expect(h).toBe(Math.fround(at(x, z)));
    }
  });

  it('builds the same lattice on every engine: no Math.sin, cos, pow or ** in it, its bits pinned', () => {
    const src = readFileSync(new URL('beach.ts', import.meta.url), 'utf8').replace(
      /\/\*[^]*?\*\/|\/\/.*/g,
      '',
    );
    expect(
      src.match(/\*\*|Math\.(?!imul|sqrt|abs|min|max|floor|ceil|round|fround|PI)\w+/g) ?? [],
    ).toEqual([]);
    expect(at(61.5, 143.25)).toBe(at(61.5, 143.25));
    expect(checksum(relief)).toBe(2340211168);
  });

  it('is never steeper than 30 degrees, node to node', () => {
    const { nx, nz, h } = relief;
    let steep = 0;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const n = i + j * nx;
        steep = Math.max(steep, Math.abs(h[n + 1] - h[n]), Math.abs(h[n + nx] - h[n]));
      }
    }
    expect(steep / CELL).toBeLessThan(0.577);
    expect(steep / CELL).toBeGreaterThan(0.3);
  });

  it('has the furrow the nose ploughed on the centre line, from the waterline to the nose, a bank of sand on each side', () => {
    for (const x of [48, 76, 80, 88, 96]) {
      const beach = at(x, MID + 28);
      expect(at(x, MID), `x ${x}`).toBeLessThan(beach - 0.3);
      expect(at(x, MID + 12), `x ${x}`).toBeGreaterThan(beach + 0.3);
      expect(at(x, MID + 12)).toBeGreaterThan(at(x, MID + 20));
      expect(at(x, MID + 8)).toBeGreaterThan(at(x, MID + 4));
    }
    // In the open gaps it is all there: FURROW deep, the banks FURROW high.
    const [deep, high] = FURROW;
    expect(at(76, MID) - (2.5 * 46) / 60).toBeCloseTo(-deep, 1);
    expect(at(76, MID + 12) - at(76, MID + 28)).toBeGreaterThan(high - 0.5);
    // The first gap's is under water, to wade through: never out of depth.
    expect(at(40, MID)).toBeLessThan(-0.5);
    expect(at(40, MID)).toBeGreaterThan(DEPTH + 0.4);
    // None in the lagoon; the sand the nose pushed up is before it, behind the trees.
    expect(at(24, MID)).toBeCloseTo(-0.6, 9);
    expect(at(108, MID)).toBeGreaterThan(at(108, MID + 28) + 1);
  });

  it('is exactly level where the game needs it: the camp, the tip of the wing, the way in to the hold', () => {
    for (const [x0, z0, x1, z1, y] of FLATS) {
      for (let x = x0 - 1.5; x <= x1 + 1.5; x += 0.5) {
        for (let z = z0 - 1.5; z <= z1 + 1.5; z += 0.5) {
          expect(ground(world, x, z), `${x}, ${z}`).toBe(Math.fround(y));
          expect(ground(world, x, ZED - z), `${x}, ${ZED - z}`).toBe(Math.fround(y));
        }
      }
    }
    expect(FLATS.at(-1)![4]).toBe(CAMP);
  });
});

describe('LANDFALL, the water', () => {
  it('has no rule of its own: the kill floor is 1.4 m under the surface, a standing eye still over it', () => {
    expect(BEACH.floor).toBe(DEPTH);
    expect(DEPTH + EYE).toBeGreaterThan(FRAME.water + 0.15);
    expect(DEPTH).toBeLessThan(FRAME.water - 1);
  });

  it('is waded 14 m out from the waterline all along the beach, and too deep from there west', () => {
    for (let z = EDGE.cape + 2; z <= ZED - EDGE.cape - 2; z += 2) {
      // The tail lies in it.
      if (Math.abs(z - MID) < HULL.r + 2) {
        continue;
      }
      for (let x = -15; x <= FRAME.shore; x += 0.5) {
        const y = ground(world, x, z);
        expect(y < DEPTH, `${x}, ${z}`).toBe(x < 16);
        expect(x > 16.5 ? y : 0).toBeGreaterThan(DEPTH);
      }
    }
  });

  it('puts a runner who walks out to sea back at a spawn where the bed passes the depth, and not before', () => {
    for (const z of [122, 132, 150, 170, 180, 70, 40]) {
      const s = red().put(FRAME.shore, 0, z, WEST);
      let last = s.p.x;
      const n = s.until(
        p => (p.ev & EV.RESPAWN) !== 0,
        (p: PlayerState) => ((last = p.x), KEY.FORWARD),
        WEST,
        400,
      );
      expect(n, `z ${z}`).toBeGreaterThan(100);
      expect(last).toBeGreaterThan(15.8);
      expect(last).toBeLessThan(16.1);
      expect(s.low).toBeGreaterThan(DEPTH - 0.02);
      expect(s.modes).toEqual(new Set([MODE.GROUND]));
      // Back at a spawn of his team, on the sand.
      expect(teams[0].spawns.some(([x, , v]) => x === s.p.x && v === s.p.z)).toBe(true);
    }
  });

  it('keeps everything a runner is given above the water: the spawns, the bases, the racks and the packs', () => {
    const all = [
      ...teams.flatMap(t => [t.base, t.rack!, t.blade!, t.rifle!, t.rail!, ...t.spawns]),
      ...BEACH.packs!,
      ...BEACH.ammo!,
      ...BEACH.cells!,
      ...BEACH.vests!,
    ];
    for (const p of all) {
      expect(p[1]).toBeGreaterThan(FRAME.water + 0.3);
    }
  });
});

describe('LANDFALL, camps, racks and packs', () => {
  it('has eight spawns a side on the level sand of the camp, with room for a body, apart, standing still', () => {
    for (const [team, { spawns }] of teams.entries()) {
      expect(spawns).toHaveLength(8);
      for (const [n, [x, y, z]] of spawns.entries()) {
        expect(y).toBe(CAMP);
        for (const [u, v] of [
          [0, 0],
          [1.5, 0],
          [-1.5, 0],
          [0, 1.5],
          [0, -1.5],
        ]) {
          expect(ground(world, x + u, z + v), `team ${team}, spawn ${n}`).toBe(y);
        }
        expect(
          brushes.some(b => meets(b, x, y, z, PLAYER_H)),
          `team ${team}, spawn ${n}: room`,
        ).toBe(false);
        for (const [m, [u, , v]] of spawns.entries()) {
          expect(m === n || Math.hypot(u - x, v - z) >= 2, `spawns ${n} and ${m}`).toBe(true);
        }
        const p = spawn(0, world, n, team);
        move(p, { seq: 0, keys: 0, yaw: p.yaw, pitch: 0 }, world, team);
        expect(p).toEqual({ ...spawn(0, world, n, team), t: 1 });
      }
    }
  });

  it("stands each flag on a step in its team's colour by the pod, the ring and the pole clear", () => {
    for (const [team, { base, spawns }] of teams.entries()) {
      const [x, y, z] = base;
      const dais = brushes.filter(
        b => b.max[1] === y && b.min[0] < x && x < b.max[0] && b.min[2] < z && z < b.max[2],
      );
      expect(dais).toHaveLength(1);
      expect(dais[0].tint).toBe(TEAM_TINT[team]);
      // A step up from the camp's sand, walked onto.
      expect(y - CAMP).toBeLessThanOrEqual(STEP_H);
      expect(ground(world, x, z)).toBe(CAMP);
      for (const b of brushes) {
        expect(meets(b, x, y, z, FLAG_H)).toBe(false);
        const [dx, dz] = [
          Math.max(b.min[0] - x, 0, x - b.max[0]),
          Math.max(b.min[2] - z, 0, z - b.max[2]),
        ];
        expect(Math.hypot(dx, dz) >= FLAG_REACH || b.max[1] <= y || b.min[1] >= y + PLAYER_H).toBe(
          true,
        );
      }
      const side = team ? ZED - POD[1] : POD[1];
      expect(Math.hypot(x - POD[0], z - side)).toBeLessThan(POD[2] + 5);
      for (const [u, , v] of spawns) {
        expect(Math.hypot(u - x, v - z)).toBeLessThan(25);
        expect(Math.hypot(u - x, v - z)).toBeGreaterThan(8);
      }
    }
  });

  it('stands each rack and pack on a top clear of brushes, off the flag bases', () => {
    expect(problems(BEACH)).toEqual([]);
  });

  it("has Highline's share of packs: twelve of health, twenty of ammo, eleven cells and three armours, a few on every way", () => {
    expect(BEACH.packs).toHaveLength(12);
    expect(BEACH.ammo).toHaveLength(20);
    expect(BEACH.cells).toHaveLength(11);
    expect(BEACH.vests).toHaveLength(3);
    const onLine = (l: number[][]) => l.filter(p => p[2] === MID).length;
    expect([BEACH.packs!, BEACH.ammo!, BEACH.cells!, BEACH.vests!].map(onLine)).toEqual([
      2, 2, 1, 1,
    ]);
    const all = [...BEACH.packs!, ...BEACH.ammo!, ...BEACH.cells!, ...BEACH.vests!];
    // In the lagoon, on the strand, by the trees, in the hold and on the hull.
    expect(all.filter(p => p[0] < FRAME.shore).length).toBeGreaterThanOrEqual(8);
    expect(all.filter(p => p[0] > 76).length).toBeGreaterThanOrEqual(8);
    expect(all.filter(p => p[1] === HOLD.floor)).toHaveLength(3);
    expect(all.filter(p => p[1] > HULL.axis[1]).length).toBe(3);
  });

  it('puts the basic weapons in the camp, on crates a step high under a tarpaulin, the rifle by the trees and the rail by the water', () => {
    const [{ rack, blade, rifle, rail, spawns }] = teams;
    for (const r of [rack!, blade!]) {
      expect(r[1] - CAMP).toBeLessThanOrEqual(STEP_H);
      expect(Math.min(...spawns.map(([x, , z]) => Math.hypot(x - r[0], z - r[2])))).toBeLessThan(8);
      expect(
        pieces('shelter').some(
          p => p.min[0] < r[0] && p.max[0] > r[0] && p.min[1] > r[1] + PLAYER_H,
        ),
      ).toBe(true);
    }
    expect(rifle![0]).toBeGreaterThan(80);
    expect(rail![0]).toBeLessThan(36);
    expect(Math.abs(rifle![2] - rail![2])).toBeGreaterThan(15);
    for (const r of [rifle!, rail!]) {
      expect(r[2] - MID).toBeGreaterThan(25);
      expect(POD[1] - r[2]).toBeGreaterThan(20);
    }
  });
});

describe('LANDFALL, the wreck', () => {
  it('is three sections of hull on the centre line, each level, its back 12 m over the ground it lies in', () => {
    const want = [-0.9, 1.25, 2.5];
    for (const [n, [x0, x1]] of HULL.sections.entries()) {
      const c = HULL.axis[n];
      expect(c - (HULL.r - HULL.sunk)).toBeCloseTo(want[n], 0);
      // The sand or the bed clear of the furrow, at the section's middle.
      const [x, z] = [(x0 + x1) / 2, MID + 28];
      expect(Math.abs(c + HULL.r - (2 * HULL.r - HULL.sunk) - at(x, z))).toBeLessThan(0.6);
      const mine = pieces('hull', false).filter(p => p.min[0] === x0 && p.max[0] === x1);
      expect(mine).toHaveLength(n === 1 ? 3 : 4);
      // Stacked boxes in a circle of radius 7 round the axis: no corner over 1.7 m out of it (the
      // flat back's and the foot's), each on the line.
      for (const p of mine) {
        expect(p.min[2] + p.max[2]).toBe(ZED);
        const half = p.max[2] - MID;
        const out = [p.min[1], p.max[1]]
          .filter(y => y > c - HULL.r + HULL.sunk)
          .map(y => Math.hypot(y - c, half) - HULL.r);
        expect(Math.max(...out, -9)).toBeLessThan(1.7);
      }
      expect(Math.max(...mine.map(p => p.max[1]))).toBe(c + HULL.r);
    }
    expect(RINGS.at(-1)).toEqual([HULL.r, 0]);
  });

  it('gives no hold to climb it from the sand: its flanks widen up to the axis, the first ledge 7.5 m up', () => {
    for (let k = 1; k < 3; k++) {
      expect(RINGS[k][1] > RINGS[k - 1][1]).toBe(k < 2);
    }
    expect(RINGS[2][0] + HULL.r - HULL.sunk).toBe(7.5);
    // A jump and a second one against the flank, from the bank and from the door: back on the sand.
    for (const [x, z] of [
      [50, MID + 9],
      [66, MID + 9],
      [53, MID + 8],
      [86, MID + 9],
    ]) {
      const s = red().put(x, ground(world, x, z), z, NORTH);
      const y0 = s.p.y;
      for (let k = 0; k < 240; k++) {
        s.step(KEY.FORWARD | (k % 24 < 2 ? KEY.JUMP : 0), NORTH);
        expect(s.p.y).toBeLessThan(y0 + 2.6);
      }
      expect(s.p.z).toBeGreaterThan(MID + RINGS[0][1]);
    }
  });

  it('has a back to walk on each section, 5 m wide, and shoulders to come down by', () => {
    for (const [n, [x0, x1]] of HULL.sections.entries()) {
      const y = HULL.axis[n] + HULL.r;
      const from = Math.min(x1 - 1, EDGE.east - 2);
      const s = red().put(from, y, MID + 1.5, WEST);
      s.goTo(x0 + 1, MID - 1.5, { sprint: true });
      expect(s.p.x).toBeLessThan(x0 + 1.5);
      expect(s.p.y).toBe(Math.fround(y));
      expect(s.modes).toEqual(new Set([MODE.GROUND]));
    }
    // Off the middle's back east of red's wing, at a crouch: onto the shoulder 2 m under it, then down to the sand, unhurt.
    const s = red().put(72, HULL.axis[1] + HULL.r, MID, SOUTH);
    const seen: number[] = [];
    for (let k = 0; k < 400 && s.p.z < MID + 9; k++) {
      s.step(KEY.FORWARD | KEY.CROUCH, SOUTH);
      if (s.p.ground && seen.at(-1) !== s.p.y) {
        seen.push(s.p.y);
      }
    }
    expect(seen.slice(0, 2)).toEqual([13.25, 11.25]);
    expect(s.ev & EV.RESPAWN).toBe(0);
    expect(s.hard).toBeLessThan(20);
  });

  it('is hollow in the middle: a hold 3 m high in three rooms, a door on each side, room for a body all the way', () => {
    const { floor, ceil, half, x, door, lintel, walls, way } = HOLD;
    expect(ceil - floor).toBe(3);
    expect(lintel).toBeGreaterThan(PLAYER_H + 0.4);
    const free = (u: number, v: number) => !brushes.some(b => meets(b, u, floor, v, PLAYER_H));
    // The rooms, clear of the walls.
    for (let u = x[0] + 0.5; u <= x[1] - 0.5; u += 0.5) {
      const wall = walls.some(([a, b]) => u > a - 0.5 && u < b + 0.5);
      for (let v = MID - half + 0.5; v <= MID + half - 0.5; v += 0.5) {
        expect(free(u, v), `${u}, ${v}`).toBe(!wall || Math.abs(v - MID) <= way / 2 - 0.4);
        expect(ground(world, u, v)).toBeLessThan(floor);
      }
    }
    // The doors, through the flank to the sand, and the sand before each within a step of the floor.
    for (const side of [1, -1]) {
      for (let v = half; v <= RINGS[1][1] + 2; v += 0.25) {
        expect(free((door[0] + door[1]) / 2, MID + side * v)).toBe(true);
        expect(free(door[0] + 0.5, MID + side * v)).toBe(true);
        expect(free(door[0] - 0.5, MID + side * v)).toBe(v > RINGS[0][1] + 0.4);
      }
      const out = ground(world, 59, MID + side * (RINGS[0][1] + 0.5));
      expect(floor - out).toBeGreaterThan(0);
      expect(floor - out).toBeLessThanOrEqual(STEP_H);
    }
    // Shut everywhere else: no way in by the broken ends.
    for (const u of [HULL.sections[1][0] - 0.5, HULL.sections[1][1] + 0.5]) {
      for (let v = -5; v <= 5; v += 0.5) {
        expect(free(u + (u < 50 ? 1 : -1), MID + v)).toBe(false);
      }
    }
  });

  it("lays red's wing as a ramp from the sand to the hull's back: 26 steps under a step high, as wide as the wing", () => {
    const steps = pieces('wing').sort((a, b) => b.min[2] - a.min[2]);
    expect(steps).toHaveLength(26);
    expect(steps[0].max[2]).toBe(WING.tip[2]);
    expect([steps[0].min[0], steps[0].max[0]].map(Math.round)).toEqual(WING.tip.slice(0, 2));
    expect(steps[0].max[1] - ground(world, 61, WING.tip[2] + 0.5)).toBeLessThanOrEqual(STEP_H);
    const last = steps.at(-1)!;
    expect(last.max[1]).toBe(HULL.axis[1] + HULL.r);
    expect(last.min[2]).toBe(MID + RINGS[3][1]);
    expect([last.min[0], last.max[0]]).toEqual(WING.root);
    for (let k = 1; k < steps.length; k++) {
      const rise = steps[k].max[1] - steps[k - 1].max[1];
      expect(rise).toBeGreaterThan(0.3);
      expect(rise).toBeLessThan(STEP_H);
      expect(steps[k].max[2]).toBeCloseTo(steps[k - 1].min[2], 9);
      expect(steps[k].max[0] - steps[k].min[0]).toBeGreaterThanOrEqual(10);
    }
    // Nobody is caught under it: where a body does not fit, it is solid to the ground.
    for (const p of steps.filter(q => q.min[2] > MID + HULL.r)) {
      const room =
        p.min[1] - Math.max(ground(world, p.min[0], p.min[2]), ground(world, 61, p.min[2]));
      expect(room < 0 || room >= PLAYER_H + 0.3, `step at z ${p.min[2]}`).toBe(true);
    }
  });

  it('has an engine on the sand to run through, by the wing, and one awash in the lagoon off the tail', () => {
    const [[x, z, r, l], [x2, z2]] = ENGINES;
    const s = red().put(x, ground(world, x, z + l / 2 + 2), z + l / 2 + 2, NORTH);
    s.run(120, KEY.FORWARD | KEY.SPRINT, NORTH);
    expect(s.p.z).toBeLessThan(z - l / 2 - 1);
    expect(Math.abs(s.p.x - x)).toBeLessThan(0.01);
    expect(s.modes).toEqual(new Set([MODE.GROUND]));
    // A roof over his head on the way.
    expect(pieces('nacelle').filter(p => p.min[0] < x && p.max[0] > x)).toHaveLength(1);
    expect(Math.abs(x - WING.tip[1])).toBeLessThan(2 * r + 2);
    expect(x2).toBeLessThan(HULL.sections[0][0]);
    expect(ground(world, x2, z2)).toBeLessThan(DEPTH - 1);
    expect(pieces('engine')[0].max[1]).toBeGreaterThan(1);
  });
});

/** The ways across, each from red's spawn to the centre line. */
const WAYS = {
  // Through the gap by the trees, between the heap of ribs and the nose.
  east: [g(66, 179), g(66, 165), g(75, 128), g(80.7, 113), g(80.7, MID)],
  // Through the gap at the waterline, wading the flooded furrow between the heap and the middle section.
  west: [g(55, 179), g(48, 150), g(42.75, 114), g(42.75, MID)],
  // Under the wing to the door, and into the hold.
  hold: [g(55, 179), g(46, 152), g(52, 136), g(59, 118), g(59, 108), go(59, MID, HOLD.floor)],
  // Up the wing.
  wing: [g(66, 179), g(61, 153), go(60, 149, 1.6), go(59, MID, HULL.axis[1] + HULL.r)],
};
/** Round the tail: wade to the first float, then jump by jump to the raft on the line; and on from the raft, the same jumps the other way. */
const LAGOON = {
  out: [
    g(55, 179),
    g(40, 150),
    g(26, 118),
    g(23.2, 117.5, false),
    leap([23, 117.5], [20, 117.5], 0.35, { sprint: false }),
    leap([16.4, 117.2], [12, 114.8], 0.5, { sprint: false }),
    leap([10.3, 114], [6, 112.5], 1.4, { sprint: false }),
    go(4, 108.8, 1.4, false),
    leap([3.5, 107.7], [3, 102], 0.4, { sprint: false }),
  ],
  in: [
    go(3, 97, 0.4),
    leap([3, 103.5], [3.5, 108.5], 1.4, { sprint: false }),
    leap([6.5, 112.5], [11, 114.5], 0.5, { sprint: false }),
    leap([12.6, 115], [17, 117.3], 0.35, { sprint: false }),
    go(21, 117.5, 0.35, false),
    g(26, 118),
  ],
};

describe('LANDFALL, the ways across, flown with the real physics', () => {
  it('walks through each gap between the sections, round the heap of ribs, with no jump', () => {
    for (const way of [WAYS.east, WAYS.west]) {
      const s = red();
      const f = fly(s, across(way));
      expect(f.failed).toBeUndefined();
      expect(s.p.z).toBeLessThan(25);
      expect(s.ev & (EV.JUMP | EV.RESPAWN)).toBe(0);
      expect(s.modes).toEqual(new Set([MODE.GROUND]));
      expect(f.seconds).toBeGreaterThan(18);
      expect(f.seconds).toBeLessThan(24);
    }
    // The west one is waded: knee to waist deep, never out of depth.
    const s = red();
    fly(s, across(WAYS.west));
    expect(s.low).toBeLessThan(-0.6);
    expect(s.low).toBeGreaterThan(DEPTH + 0.4);
    // Each gap is 8 m of open furrow with a heap in its middle and a frame against one end.
    for (const [n, x] of [40, 78].entries()) {
      expect(HULL.sections[n + 1][0] - HULL.sections[n][1]).toBe(8);
      expect(pieces('heap', false)[n].min[0]).toBe(x - 1.5);
    }
    expect(pieces('frame', false)).toHaveLength(4);
  });

  it('walks through the hold: in by the red door under the wing, out by the blue one', () => {
    const s = red();
    const f = fly(s, across(WAYS.hold));
    expect(f.failed).toBeUndefined();
    expect(s.p.z).toBeLessThan(25);
    expect(s.ev & (EV.JUMP | EV.RESPAWN)).toBe(0);
    expect(s.modes).toEqual(new Set([MODE.GROUND]));
    expect(f.seconds).toBeLessThan(26);
  });

  it('runs up the wing, over the back and down the other wing: the fastest way, 12 m up', () => {
    const s = red();
    const f = fly(s, across(WAYS.wing));
    expect(f.failed).toBeUndefined();
    expect(s.p.z).toBeLessThan(25);
    expect(s.ev & (EV.JUMP | EV.RESPAWN)).toBe(0);
    expect(f.seconds).toBeLessThan(20);
    expect(s.hard).toBeLessThan(12);
  });

  it('goes round the tail through the lagoon: three jumps from float to engine to raft, and three more', () => {
    const s = red();
    const f = fly(s, [...LAGOON.out, ...blue(LAGOON.in)]);
    expect(f.failed).toBeUndefined();
    expect(s.p.z).toBeLessThan(MID - 15);
    expect(s.p.x).toBeGreaterThan(24);
    expect(s.ev & EV.RESPAWN).toBe(0);
    expect(s.low).toBeGreaterThan(DEPTH + 0.5);
    expect(f.seconds).toBeLessThan(24);
    // The gaps: 3 m of water from the first float to the second, 3 m on to the engine and 0.9 m
    // up, 3.5 m from the engine down to the raft; the bed under all of it out of depth.
    const [f0, f1] = pieces('float');
    const [engine] = pieces('engine');
    const [raft] = pieces('raft', false);
    expect(f0.min[0] - f1.max[0]).toBe(3);
    expect(f1.min[0] - engine.max[0]).toBe(3);
    expect(engine.max[1] - f1.max[1]).toBeCloseTo(0.9, 9);
    expect(engine.min[2] - raft.max[2]).toBe(3.5);
    for (const p of [f1, engine, raft]) {
      expect(ground(world, p.max[0], p.max[2])).toBeLessThan(DEPTH);
    }
    // The first float is aground in the shallows: reached on foot.
    expect(ground(world, f0.max[0], f0.max[2])).toBeGreaterThan(-1);
  });

  it('is not walked: off a float without a jump, a runner is in the lagoon and back at a spawn', () => {
    for (const [x, z, yaw] of [
      [17, 117.5, WEST],
      [11, 114.5, WEST],
      [4, 110, NORTH],
    ]) {
      const s = red().put(x, 0.5, z, yaw);
      s.settle();
      const n = s.until(p => (p.ev & EV.RESPAWN) !== 0, KEY.FORWARD, yaw, 200);
      expect(n, `from ${x}, ${z}`).toBeGreaterThan(0);
      expect(s.ev & EV.JUMP).toBe(0);
    }
  });

  it('has a line of debris to run from the camp to the wing: a panel, a container, the landing gear, the nacelle, each a jump from the last', () => {
    const [panel] = pieces('panel');
    const [container] = pieces('container');
    const [gear] = pieces('gear');
    const roof = pieces('nacelle')[2];
    const tops = [panel, container, gear, roof].map(p => p.max[1]);
    // Each about a metre over the last, 2 to 3 m on.
    for (let k = 1; k < tops.length; k++) {
      expect(tops[k] - tops[k - 1]).toBeGreaterThan(0.8);
      expect(tops[k] - tops[k - 1]).toBeLessThan(1.3);
    }
    expect(panel.min[2] - container.max[2]).toBeCloseTo(2.5, 9);
    expect(container.min[2] - gear.max[2]).toBeCloseTo(3, 9);
    expect(gear.min[2] - roof.max[2]).toBeCloseTo(2.6, 9);
    const s = red();
    const f = fly(s, [
      g(66, 179),
      g(68.75, 166, false),
      leap([68.75, 164], [68.75, 161.3], tops[0], { sprint: false }),
      leap([69.6, 159.9], [69.8, 155.5], tops[1], { sprint: false }),
      leap([69.8, 151.4], [69.8, 146.8], tops[2], { sprint: false }),
      leap([69.9, 146], [70, 141], tops[3], { sprint: false }),
      go(70, 137, tops[3], false),
    ]);
    expect(f.failed).toBeUndefined();
    // And off the roof onto the wing, a third of the way up it.
    fly(s, [leap([69, 136.5], [64.5, 133.5], 0, { sprint: false })]);
    expect(pieces('wing').some(p => Math.fround(p.max[1]) === s.p.y)).toBe(true);
    expect(s.p.y - ground(world, s.p.x, s.p.z)).toBeGreaterThan(3);
    expect(s.ev & EV.RESPAWN).toBe(0);
    expect(s.hard).toBeLessThan(12);
  });
});

describe('LANDFALL, the edges', () => {
  it('makes each first palm and each headland rock solid where it is listed, as ghosts: the scenery draws them', () => {
    expect(TRUNKS.length).toBeGreaterThan(15);
    for (const [x, z, r] of TRUNKS) {
      expect(x).toBeGreaterThanOrEqual(FRAME.trees);
      expect(x).toBeLessThan(EDGE.east - 1);
      expect(z).toBeGreaterThan(MID + HULL.r + 1);
      for (const side of [z, ZED - z]) {
        const mine = brushes.filter(
          b =>
            b.ghost &&
            Math.abs((b.min[0] + b.max[0]) / 2 - x) < 1e-9 &&
            Math.abs((b.min[2] + b.max[2]) / 2 - side) < 1e-9,
        );
        expect(mine).toHaveLength(1);
        expect(mine[0].max[0] - mine[0].min[0]).toBeCloseTo(2 * r, 9);
        expect(mine[0].min[1]).toBeLessThan(ground(world, x, side));
        expect(mine[0].max[1]).toBeGreaterThan(ground(world, x, side) + 6);
      }
    }
    // The rocks: every box inside what rockOf() draws (its corners within 0.5 m of it), and a ghost.
    for (const [n, c] of LAYOUT.crags.entries()) {
      const far = n >= ROCKS.length;
      expect([c.at[0], far ? ZED - c.at[2] : c.at[2], c.R, c.H, c.s]).toEqual(
        ROCKS[n % ROCKS.length],
      );
      // (The height of red's: the lattice's triangles are not mirrored, the rocks are.)
      expect(c.at[1]).toBe(walked(c.at[0], far ? ZED - c.at[2] : c.at[2]));
      expect(c.parts.length).toBeGreaterThan(8);
      expect(c.parts.length).toBeLessThan(50);
      const { reach } = rockOf(c.s, c.R, c.H);
      const mid = c.at[1] + rockMid(c.H);
      for (const [x0, y0, z0, x1, y1, z1] of c.parts) {
        expect(
          brushes.some(b => b.ghost && same(b, { ...b, min: [x0, y0, z0], max: [x1, y1, z1] })),
        ).toBe(true);
        for (const x of [x0, x1]) {
          for (const y of [Math.max(y0, c.at[1] - 0.5), y1]) {
            for (const z of [z0, z1]) {
              const d = [x - c.at[0], y - mid, (far ? -1 : 1) * (z - c.at[2])];
              const l = Math.hypot(...d);
              expect(l - reach([d[0] / l, d[1] / l, d[2] / l])).toBeLessThan(0.5);
            }
          }
        }
      }
    }
  });

  it('is closed by three walls nobody sees, 40 m high: behind the first palms and in each headland', () => {
    const walls = brushes.filter(b => b.ghost && b.max[1] === 40);
    expect(walls).toHaveLength(3);
    expect(
      walls.filter(b => b.min[0] === EDGE.east && b.min[2] <= 0 && b.max[2] >= ZED),
    ).toHaveLength(1);
    expect(walls.filter(b => b.min[2] === ZED - EDGE.cape && b.min[0] < -40)).toHaveLength(1);
    expect(EDGE.east).toBeGreaterThan(Math.max(...TRUNKS.map(t => t[0] + t[2])) + 1);
    expect(EDGE.east).toBeLessThan(FRAME.east);
  });

  it('lets no runner out: sprinting and jumping at the trees, the headlands and the sea from all along them', () => {
    const runs: [number, number, number][] = [];
    for (let z = 12; z <= 188; z += 16) {
      runs.push([88, z, EAST], [20, z, WEST]);
    }
    for (let x = 18; x <= 92; x += 6) {
      runs.push([x, 180, SOUTH], [x, 20, NORTH]);
    }
    for (const [x, z, yaw] of runs) {
      const s = red().put(x, ground(world, x, z), z, yaw);
      for (let k = 0; k < 420; k++) {
        const p = s.step(KEY.FORWARD | KEY.SPRINT | (k % 30 < 2 ? KEY.JUMP : 0), yaw);
        expect(inArea(p), `from ${x}, ${z}, step ${k}: ${p.x}, ${p.y}, ${p.z}`).toBe(true);
      }
      // Stopped by a trunk, the wall or a rock, or drowned: not far from where he was heading.
      expect(yaw === WEST ? s.ev & EV.RESPAWN : 1).toBeTruthy();
    }
    // Off the nose's back, the highest place there is, and off the lagoon's engine toward the open sea.
    const top = HULL.axis[2] + HULL.r;
    for (const [x, y, z, yaw] of [
      [84, top, MID, EAST],
      [84, top, MID + 1, (EAST + SOUTH) / 2],
      [6, 1.4, 112, WEST],
    ]) {
      const s = red().put(x, y, z, yaw);
      for (let k = 0; k < 300; k++) {
        const keys = KEY.FORWARD | KEY.SPRINT | (k % 40 < 2 ? KEY.JUMP : 0);
        expect(inArea(s.step(keys, yaw))).toBe(true);
      }
    }
  });
});

describe('LANDFALL, random play', () => {
  it('never puts a player in a brush, under the sand or out of the beach, whatever is pressed', () => {
    const inside = (p: PlayerState) =>
      brushes.some(
        b =>
          p.x > b.min[0] + 1e-3 &&
          p.x < b.max[0] - 1e-3 &&
          p.z > b.min[2] + 1e-3 &&
          p.z < b.max[2] - 1e-3 &&
          p.y > b.min[1] + 1e-3 &&
          p.y < b.max[1] - 1e-3,
      );
    let landed = 0;
    let wet = 0;
    for (const [seed, team, spawnAt] of [
      [1, 0, 0],
      [2, 0, 4],
      [3, 1, 7],
      [4, 1, 2],
    ]) {
      let r = seed;
      const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
      const sim = new Sim(spawn(0, world, spawnAt, team), world);
      let keys = 0;
      let yaw = sim.p.yaw;
      let turn = 0;
      for (let k = 0; k < 12000; k++) {
        if (k % 8 === 0) {
          keys =
            (rnd() < 0.85 ? 1 : 0) | (Math.floor(rnd() * 256) & ~1 & (rnd() < 0.5 ? 0xff : 0x1c));
          turn = (rnd() - 0.5) * 0.15;
          if (rnd() < 0.05) {
            yaw += (rnd() - 0.5) * 6;
          }
        }
        yaw += turn;
        const p = sim.step(keys, yaw);
        const label = `seed ${seed}, step ${k}: ${p.x}, ${p.y}, ${p.z}`;
        for (const v of [p.x, p.y, p.z, p.vx, p.vy, p.vz]) {
          expect(Number.isFinite(v), label).toBe(true);
        }
        expect(inside(p), label).toBe(false);
        expect(inArea(p), label).toBe(true);
        expect(p.y, label).toBeGreaterThanOrEqual(ground(world, p.x, p.z) - 1e-3);
        landed += p.ev & EV.LAND ? 1 : 0;
        wet += p.y < FRAME.water ? 1 : 0;
      }
    }
    expect(landed).toBeGreaterThan(50);
    expect(wet).toBeGreaterThan(0);
  });
});

describe('LANDFALL, capture the flag, end to end through a room', () => {
  const peer = () => {
    const c: Conn & { bins: ArrayBuffer[] } = {
      bins: [],
      send: d => typeof d !== 'string' && c.bins.push(d),
    };
    return c;
  };
  const snap = (c: { bins: ArrayBuffer[] }): Snapshot => decodeSnapshot(c.bins.at(-1)!)!;

  it("has red run up the wing, take blue's flag by its pod and carry it home over the hull to score", () => {
    const room = new Room({ map: 'landfall' });
    const c = peer();
    room.connect(c);
    room.receive(c, JSON.stringify({ t: 'join', name: 'Ann' }));
    for (let k = 0; k < SNAP_EVERY; k++) {
      room.tick();
    }
    // Fly it on a sim from the spawn the room gave, then send the room the same inputs.
    const me = snap(c).players[0];
    const n = teams[0].spawns.findIndex(([x, , z]) => x === me.x && z === me.z);
    expect(n).toBeGreaterThanOrEqual(0);
    const s = red(n);
    const base = teams[1].base;
    const there = [
      ...across(WAYS.wing),
      go(base[0], base[2] + 3, CAMP),
      go(base[0], base[2], base[1], false),
    ];
    expect(fly(s, there).failed).toBeUndefined();
    const carried = s.inputs.length;
    const home = teams[0].base;
    const back = [
      go(base[0], base[2] + 3, CAMP),
      ...blue(WAYS.wing.slice(1)),
      ...WAYS.wing.slice(1, -1).reverse(),
      go(home[0], home[2] - 3, CAMP),
      go(home[0], home[2], home[1], false),
    ];
    expect(fly(s, back).failed).toBeUndefined();

    let took = false;
    let dropped = false;
    for (const [k, step] of s.inputs.entries()) {
      room.receive(c, encodeInput({ seq: k & 0xffff, ...step }));
      room.tick();
      if (k === carried) {
        for (let j = 0; j < SNAP_EVERY; j++) {
          room.tick();
        }
        const f = snap(c).flags[TEAM.BLUE];
        took = f.state === FLAG.CARRIED && f.by === 0;
      }
      dropped ||= snap(c).flags.some(f => f.state === FLAG.DROPPED);
    }
    expect(took).toBe(true);
    expect(dropped).toBe(false);
    for (let j = 0; j < SNAP_EVERY; j++) {
      room.tick();
    }
    const end = snap(c);
    // The room and the sim stand in the same place, and the capture is scored.
    expect(end.players[0].x).toBe(Math.fround(s.p.x));
    expect(end.players[0].z).toBe(Math.fround(s.p.z));
    expect(end.score).toEqual([1, 0]);
    expect(end.flags.map(f => f.state)).toEqual([FLAG.HOME, FLAG.HOME]);
  });

  it('leaves a carrier who goes under a last ground in his depth, in the shallows: where ctf.ts drops his flag, as for a fall', () => {
    const s = red().put(20, ground(world, 20, 140), 140, WEST);
    let last = [s.p.x, s.p.y];
    s.until(
      p => (p.ev & EV.RESPAWN) !== 0,
      (p: PlayerState) => ((last = p.ground ? [p.x, p.y] : last), KEY.FORWARD),
      WEST,
      300,
    );
    expect(s.ev & EV.RESPAWN).toBeTruthy();
    expect(last[1]).toBeGreaterThanOrEqual(DEPTH);
    expect(last[0]).toBeGreaterThan(15.8);
  });
});
