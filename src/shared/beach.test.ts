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
  DECKS,
  DEPTH,
  EDGE,
  ENGINES,
  FLATS,
  FRAME,
  FURROW,
  HOLD,
  HULL,
  LAYOUT,
  LINES,
  POD,
  RINGS,
  ROCKS,
  SHIP,
  TRUNKS,
  WING,
  ZED,
  at,
  section,
  walked,
} from './beach';
import { EYE, FLAG_H, FLAG_REACH, PLAYER_H, PLAYER_R, SNAP_EVERY, STEP_H } from './constants';
import { TEAM_TINT } from './map';
import { MAPS } from './maps';
import { rockMid, rockOf } from './moon';
import { floorAt, move, spawn } from './physics';
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
/** The boxes of the wreck, the debris and the camps, told by LAYOUT.pieces: grey boxes the level draws, until hulk.ts draws the ship on them. */
const solid = brushes.filter(b =>
  LAYOUT.pieces.some(
    p => p.min.every((v, k) => v === b.min[k]) && p.max.every((v, k) => v === b.max[k]),
  ),
);
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
  it("is the beach level: full gravity, the beach scenery, Highline's armour and no helmet, a high warm sun, a light haze", () => {
    expect(MAPS.landfall).toBe(BEACH);
    expect(BEACH.name).toBe('Landfall');
    expect(BEACH.gravity ?? 1).toBe(1);
    expect(BEACH.scenery).toBe('beach');
    expect(BEACH.helmets ?? false).toBe(false);
    expect(BEACH.armor).toBe(true);
    expect(BEACH.rovers ?? []).toHaveLength(0);
    expect(Math.hypot(...BEACH.sun.dir)).toBeCloseTo(1, 2);
    expect(BEACH.sun.dir[1]).toBeGreaterThan(0.7);
    expect(BEACH.fog![3]).toBeLessThan(0.003);
  });

  it('has brushes with min below max, known textures and tints, under 1,100 of them, six in ten the ghosts of rocks and trunks', () => {
    expect(brushes.length).toBeGreaterThan(300);
    expect(brushes.length).toBeLessThan(1100);
    expect(solid.length).toBeLessThan(420);
    expect(brushes.filter(b => b.ghost).length).toBeGreaterThan(0.55 * brushes.length);
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

  it('floats nothing but the hull over its floors, the wings, the tarpaulins and what is on the water: every other brush has its foot in the ground', () => {
    const up = [
      'skin',
      'deck',
      'fairing',
      'crate',
      'wingpiece',
      'rail',
      'shelter',
      'float',
      'raft',
    ];
    let stood = 0;
    for (const [i, b] of solid.entries()) {
      const [x, z] = [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2];
      const kind = LAYOUT.pieces.find(p =>
        p.min.every((v, k) => v === b.min[k] && p.max[k] === b.max[k]),
      )!.kind;
      const onHull = Math.abs(z - MID) < HULL.r && HULL.sections.some(s => x > s[0] && x < s[1]);
      if (!up.includes(kind) && !(kind === 'crate' && onHull)) {
        expect(b.min[1], `brush ${i} at ${x}, ${z}`).toBeLessThan(ground(world, x, z));
        expect(b.max[1], `brush ${i} at ${x}, ${z}`).toBeGreaterThan(ground(world, x, z));
        stood++;
      }
    }
    expect(stood).toBeGreaterThan(40);
    // Each section's keel is in the ground or under the water.
    for (const [n, [x0, x1]] of HULL.sections.entries()) {
      expect(HULL.axis[n] - HULL.r).toBeLessThan(Math.max(ground(world, (x0 + x1) / 2, MID), 0));
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
      'skin',
      'deck',
      'fairing',
      'wingpiece',
      'rail',
      'fallen',
      'heap',
      'frame',
      'raft',
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
    // Every box of the wreck is a piece, and the level draws them all: grey boxes, until hulk.ts draws the ship on them.
    expect(solid.every(b => !b.ghost)).toBe(true);
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

/** The pieces of a kind on a section of the hull (0 the tail, 1 the middle, 2 the nose). */
const part = (n: number, kind: string) =>
  pieces(kind, false).filter(
    p =>
      p.min[0] >= HULL.sections[n][0] &&
      p.max[0] <= HULL.sections[n][1] &&
      Math.abs((p.min[2] + p.max[2]) / 2 - MID) < 12,
  );
/** The floors of a section, bottom up: its floor, its two decks and its back. */
const floors = (n: number) => [SHIP[n].floor, ...DECKS].map(h => HULL.axis[n] + h);
const free = (x: number, y: number, z: number, h = PLAYER_H) =>
  !brushes.some(b => meets(b, x, y, z, h));
const W = { sprint: false };

describe('LANDFALL, the wreck', () => {
  it('is three sections of hull on the centre line, each level, its back 12 m over the ground it lies in', () => {
    const want = [-0.9, 1.25, 2.5];
    for (const [n, [x0, x1]] of HULL.sections.entries()) {
      const c = HULL.axis[n];
      expect(c - (HULL.r - HULL.sunk)).toBeCloseTo(want[n], 0);
      // The sand or the bed clear of the furrow, at the section's middle.
      const [x, z] = [(x0 + x1) / 2, MID + 28];
      expect(Math.abs(c + HULL.r - (2 * HULL.r - HULL.sunk) - at(x, z))).toBeLessThan(0.6);
      // Built from end to end, the nose as far as the wall in the trees: the rest of it is drawn only.
      const { cut } = SHIP[n];
      expect(cut[0][0]).toBe(x0);
      expect(cut.at(-1)![1]).toBe(Math.min(x1, EDGE.east + 2));
      for (let k = 1; k < cut.length; k++) {
        expect(cut[k][0]).toBe(cut[k - 1][1]);
      }
      expect(Math.max(...part(n, 'deck').map(p => p.max[1]))).toBe(c + HULL.r);
    }
    // The tail tapers to the stern and the nose to the trees; the middle is whole.
    expect(SHIP.map(s => s.cut.map(c => c[2]))).toEqual([[0.7, 0.76, 0.9, 1], [1], [1, 0.85]]);
  });

  it("has a round section: 7 m at the belt, a keel under it, a flat back 2.5 m either side of the line, within 0.3 m of the blockout's", () => {
    expect([-7, 0, 7, 8].map(section)).toEqual([0, HULL.r, HULL.spine, HULL.spine]);
    for (const [h, w] of [
      [-6, 4.1],
      [-4, 5.98],
      [-2, 6.76],
      [2.5, 6.69],
      [5, 5.51],
      [6, 4.49],
      [6.5, 3.6],
    ]) {
      expect(Math.abs(section(h) - w), `at ${h}`).toBeLessThan(0.3);
    }
    for (let h = -7; h < 7; h += 0.25) {
      expect(section(h + 0.25) > section(h), `at ${h}`).toBe(h < 0);
    }
    expect(RINGS).toEqual(LINES.map(h => [h, section(h)]));
    expect(LINES.at(-1)).toBe(HULL.r);
    expect(DECKS.every(h => LINES.includes(h))).toBe(true);
  });

  it('is a shell of boxes on that section, mirrored: each box of skin within 0.55 m of it and as thick as the skin, the stern solid', () => {
    for (const [n, { cut }] of SHIP.entries()) {
      const c = HULL.axis[n];
      const skin = part(n, 'skin');
      expect(skin.length).toBeGreaterThan(20);
      for (const p of skin) {
        const [, , s, solid] = cut.find(([a, b]) => p.min[0] >= a && p.max[0] <= b)!;
        const [near, out] = [p.min[2] - MID, p.max[2] - MID].map(Math.abs).sort((a, b) => a - b);
        if (solid) {
          expect(p.min[2] + p.max[2]).toBe(ZED);
          continue;
        }
        for (const y of [p.min[1], p.max[1]]) {
          expect(Math.abs(out - s * section(y - c)), `${p.min}`).toBeLessThan(0.55);
        }
        expect(out - near).toBeGreaterThanOrEqual(HULL.skin - 1e-9);
        expect(out - near).toBeLessThan(HULL.skin + 1.3);
      }
      // The back: flat, the spine either side of the line where the section is whole.
      const back = part(n, 'deck').filter(p => p.max[1] === c + HULL.r);
      expect(Math.max(...back.map(p => p.max[2] - MID))).toBe(HULL.spine);
    }
    // Over the belt each box of skin stands in from the one under it by less than 0.75 m, and from
    // 5 m up they are half a metre high: stairs to the back, not a shoulder to be left on.
    const up = LINES.filter(h => h >= 0);
    const wide = up.slice(1).map((b, k) => section((up[k] + b) / 2));
    for (let k = 2; k < wide.length - 1; k++) {
      expect(wide[k - 1] - wide[k]).toBeLessThan(0.75);
      expect(wide[k - 1] - wide[k]).toBeGreaterThan(0);
    }
    for (const h of [5.5, 6, 6.5, 7]) {
      expect(LINES).toContain(h - 0.5);
    }
  });

  it('gives no hold to climb it from the sand: its flanks widen up to the belt, and jumps at them fall back', () => {
    for (let k = 1; LINES[k] <= 0; k++) {
      expect(section(LINES[k])).toBeGreaterThan(section(LINES[k - 1]));
    }
    // A jump and a second one against the flank, clear of the tears: back on the sand.
    for (const [x, z] of [
      [46, MID + 9],
      [62, MID + 12.5],
      [73, MID + 9],
      [83, MID + 10.5],
      [93, MID + 9.5],
    ]) {
      const s = red().put(x, ground(world, x, z), z, NORTH);
      const y0 = s.p.y;
      for (let k = 0; k < 240; k++) {
        s.step(KEY.FORWARD | (k % 24 < 2 ? KEY.JUMP : 0), NORTH);
        expect(s.p.y).toBeLessThan(y0 + 2.7);
      }
      expect(s.p.z).toBeGreaterThan(MID + 5);
      expect(s.modes.has(MODE.HANG)).toBe(false);
    }
  });

  it('has a back to walk on each section past the holes in it, and steps of skin down its shoulders to the fairing', () => {
    for (const [n, [x0, x1]] of HULL.sections.entries()) {
      const y = HULL.axis[n] + HULL.r;
      const from = Math.min(x1 - 1, EDGE.east - 2);
      // Along the rim left beside each hole.
      const s = red().put(from, y, MID + 1.9, WEST);
      s.goTo(x0 + 2, MID + 1.9, { sprint: true });
      expect(s.p.x).toBeLessThan(x0 + 2.5);
      expect(s.p.y).toBe(Math.fround(y));
      expect(s.modes).toEqual(new Set([MODE.GROUND]));
    }
    // Off the middle's back over the wing's root, at a crouch: four steps of half a metre, then
    // onto the fairing's ledge under them, unhurt.
    const s = red().put(60, HULL.axis[1] + HULL.r, MID, SOUTH);
    const seen: number[] = [];
    for (let k = 0; k < 400 && s.p.z < MID + 9; k++) {
      s.step(KEY.FORWARD | KEY.CROUCH, SOUTH);
      if (s.p.ground && seen.at(-1) !== s.p.y) {
        seen.push(s.p.y);
      }
    }
    expect(seen).toEqual([13.25, 12.75, 12.25, 11.75, 11.25, 8.5]);
    expect(s.ev & EV.RESPAWN).toBe(0);
    expect(s.hard).toBeLessThan(12);
    // And back up from the ledge: the two boxes of skin over it are a jump each, then the steps.
    const up = red().put(60, 8.5, MID + 9, NORTH);
    for (let k = 0; k < 480 && up.p.y < 13.25; k++) {
      up.step(KEY.FORWARD | (up.p.ground && k % 5 === 0 ? KEY.JUMP : 0), NORTH);
    }
    expect(up.p.y).toBe(13.25);
    expect(up.modes.has(MODE.HANG)).toBe(false);
  });

  it('is hollow: a floor and two decks in each section under its back, a body standing anywhere on them, 2.9 m of room at least', () => {
    expect(floors(1)).toEqual([HOLD.floor, 4.5, 8.5, 13.25]);
    expect(floors(0)).toEqual([-0.75, 2.25, 6.25, 11]);
    expect(floors(2)).toEqual([2.5, 5.75, 9.75, 14.5]);
    // The tail's floor is awash: under the water, in a runner's depth.
    expect(floors(0)[0]).toBeLessThan(FRAME.water);
    expect(floors(0)[0]).toBeGreaterThan(DEPTH + 0.5);
    for (const [n, { cut, holes, crates }] of SHIP.entries()) {
      const ys = floors(n);
      const whole = cut.filter(c => c[2] === 1);
      const [x0, x1] = [whole[0][0], Math.min(whole.at(-1)![1], EDGE.east)];
      let stood = 0;
      for (let k = 0; k < 3; k++) {
        expect(ys[k + 1] - ys[k]).toBeGreaterThanOrEqual(3);
        for (let x = x0 + 0.75; x < x1 - 1; x += 1.5) {
          for (const v of [-3.5, -1.75, 0, 1.75, 3.5]) {
            const hole = holes.some(
              ([d, a, b, half]) =>
                d === k - 1 && x > a - 0.5 && x < b + 0.5 && Math.abs(v) < half + 0.5,
            );
            const crate = crates.some(
              ([a, d]) => d === k - 1 && x > a - 0.5 && x < a + 2 && Math.abs(v) < 1.2,
            );
            if (!hole && !crate) {
              const room = k < 2 ? ys[k + 1] - ys[k] - 0.3 : 2.5;
              expect(
                free(x, ys[k], MID + v, room - 1e-3),
                `section ${n}, ${x}, ${ys[k]}, ${v}`,
              ).toBe(true);
              const floor = floorAt(world, x, MID + v, ys[k] + 0.1);
              expect(floor >= ys[k] && floor < ys[k] + 0.8, `${n}, ${x}, ${v}: ${floor}`).toBe(
                true,
              );
              stood++;
            }
          }
        }
      }
      expect(stood).toBeGreaterThan(50);
    }
    // The hold as it was: its floor, 9 m wide inside, and over the sand under it.
    expect(HOLD.half).toBeCloseTo(section(SHIP[1].floor) - HULL.skin, 1);
    expect(free(59, HOLD.floor, MID + HOLD.half - 0.45)).toBe(true);
    expect(free(52, HOLD.floor, MID + HOLD.half + 0.45)).toBe(false);
    expect(HOLD.ceil - HOLD.floor).toBe(HOLD.lintel);
    for (let x = 45; x < 74; x += 1) {
      expect(ground(world, x, MID)).toBeLessThan(HOLD.floor);
    }
  });

  it('is open at its broken ends on every level, onto the two gaps, and shut at the stern', () => {
    const [tail, mid, nose] = HULL.sections;
    for (const [n, x, open] of [
      [0, tail[0] + 0.5, false],
      [0, tail[1] - 0.5, true],
      [1, mid[0] + 0.5, true],
      [1, mid[1] - 0.5, true],
      [2, nose[0] + 0.5, true],
    ] as const) {
      const ys = floors(n);
      // (The middle's gallery is torn away at its west end: the deck under it shows there.)
      for (const y of n === 1 && x < 48 ? [ys[0], ys[1]] : ys.slice(0, 3)) {
        const up = Math.max(y, ground(world, x, MID));
        expect(free(x, up, MID), `section ${n} at ${x}, ${y}`).toBe(open);
        if (open) {
          expect(free(x + (x < HULL.sections[n][0] + 1 ? -1 : 1), up, MID)).toBe(true);
        }
      }
    }
    // From the sand of each gap the hold's floor is a jump or a pull up; from the east gap the nose's too.
    expect(HOLD.floor - ground(world, 43.5, MID)).toBeLessThan(2.4);
    expect(HOLD.floor - ground(world, 74.5, MID)).toBeLessThan(1.2);
    expect(floors(2)[0] - ground(world, 81.5, MID)).toBeLessThan(2.4);
    expect(Math.abs(floors(0)[0] - ground(world, 36.5, MID))).toBeLessThan(STEP_H);
  });

  it('is torn in both flanks at the height of a deck: each tear a way through the skin for a body, the hold with its two doors', () => {
    expect(SHIP.map(s => s.tears.length)).toEqual([2, 3, 1]);
    for (const [n, { tears, floor }] of SHIP.entries()) {
      const c = HULL.axis[n];
      for (const [x0, x1, h0, h1] of tears) {
        expect(x1 - x0).toBeGreaterThanOrEqual(3);
        expect(h1 - h0).toBeGreaterThan(PLAYER_H + 0.6);
        expect([floor, ...DECKS]).toContain(h0);
        expect(LINES).toContain(h1);
        for (const side of [1, -1]) {
          for (let v = 4; v <= 7.5; v += 0.25) {
            for (const x of [x0 + 0.45, (x0 + x1) / 2, x1 - 0.45]) {
              expect(free(x, c + h0, MID + side * v), `${x}, ${c + h0}, ${v}`).toBe(true);
            }
          }
          // The skin either side of it.
          expect(free(x0 - 0.5, c + h0, MID + side * section(h0))).toBe(false);
        }
      }
    }
    // The doors of the hold, and the sand before each within a step of its floor.
    expect(HOLD.door).toEqual([57.5, 60.5, SHIP[1].floor, LINES[1]]);
    for (const side of [1, -1]) {
      const out = ground(world, 59, MID + side * 7);
      expect(HOLD.floor - out).toBeGreaterThan(0);
      expect(HOLD.floor - out).toBeLessThanOrEqual(STEP_H);
    }
    // A container against the middle's flank under the tear of its lower deck, and a float under the tail's.
    const [box] = pieces('container').filter(p => p.min[2] < MID + 8);
    expect(box.max[1]).toBeGreaterThan(4.5 - 1.2);
    expect(box.max[1] - ground(world, 51, MID + 11)).toBeLessThan(2.8);
    expect(pieces('float').filter(p => p.min[2] < MID + 8)).toHaveLength(1);
  });

  it('has holes in its floors, offset from one level to the next, a crate under the edge of each to climb by', () => {
    for (const [n, { holes, crates }] of SHIP.entries()) {
      const [x0, x1] = HULL.sections[n];
      expect(holes.map(h => h[0]).sort()).toEqual(n === 1 ? [0, 0, 1, 1, 2, 2] : [0, 1, 2]);
      for (const [d, a, b, half] of holes) {
        expect(a).toBeGreaterThanOrEqual(x0);
        expect(b).toBeLessThanOrEqual(x1);
        expect(b - a).toBeGreaterThanOrEqual(3);
        expect(half).toBeGreaterThanOrEqual(2);
        // Nothing under it but the level below: a body falls through, and none of the next level's is over it,
        // but where the middle's west end is torn through its gallery and its back.
        const y = HULL.axis[n] + DECKS[d];
        expect(free((a + b) / 2, y - 1, MID, 2)).toBe(true);
        for (const [e, p, q] of holes) {
          expect(e !== d + 1 || q <= a || p >= b || p === x0, `${n}: ${a} and ${p}`).toBe(true);
        }
      }
      // One crate a level, on the line, under the end of a hole of the floor above.
      expect(crates.map(c => c[1])).toEqual([-1, 0, 1]);
      const ys = floors(n);
      for (const [x, d] of crates) {
        const [p] = part(n, 'crate').filter(q => q.min[0] === x);
        expect(p.min[1]).toBe(ys[d + 1]);
        expect(p.max[1] - p.min[1]).toBeCloseTo([1, 1.4, 2][d + 1], 9);
        expect(p.min[2] + p.max[2]).toBe(ZED);
        const over = holes.filter(([e, a, b]) => e === d + 1 && a < x && b > x + 1.5);
        expect(over).toHaveLength(1);
        expect(Math.min(x - over[0][1], over[0][2] - x - 1.5)).toBeLessThan(0.31);
        // The hands reach the edge from it (GRAB_MAX of 2.4 m after a jump of 1.2 m), and the body hangs clear of it (HANG_H of 2 m).
        const up = ys[d + 2] - p.max[1];
        expect(up).toBeLessThan(3.4);
        expect(up).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('has a fairing along each flank from the belt to the upper deck: on the middle section a ledge 4.4 m wide under the wing, into the gallery', () => {
    for (const [n, { fair }] of SHIP.entries()) {
      const c = HULL.axis[n];
      const mine = part(n, 'fairing');
      expect(mine).toHaveLength(4 * fair.length);
      expect(Math.max(...mine.map(p => p.max[1]))).toBe(c + DECKS[1]);
      expect(Math.min(...mine.map(p => p.min[1]))).toBe(c);
      expect(Math.max(...mine.map(p => p.max[2] - MID))).toBeCloseTo(
        HULL.r + Math.max(...fair.map(f => f[2])),
        9,
      );
    }
    // Thinner on the tail and on the nose.
    expect(SHIP.map(s => Math.max(...s.fair.map(f => f[2])))).toEqual([3, 4.4, 2.7]);
    // The ledge: walked from end to end, and through the tear onto the gallery, level.
    const s = red().put(56, 8.5, MID + 9, EAST);
    s.goTo(70, MID + 9.5, { sprint: true });
    s.goTo(67.5, MID + 3, { sprint: true });
    expect(s.p.z).toBeLessThan(MID + 3.5);
    expect(s.p.y).toBe(8.5);
    expect(s.modes).toEqual(new Set([MODE.GROUND]));
  });

  it("lays red's wing from the ledge down to the sand in three pieces, swept and tapered, two breaks of 3.6 m in it and two rails through each", () => {
    const rows = pieces('wingpiece').sort((a, b) => a.min[2] - b.min[2]);
    const lip = MID + HULL.r + 4.4;
    const groups: (typeof rows)[] = [[]];
    for (const p of rows) {
      if (groups.at(-1)!.length && p.min[2] - groups.at(-1)!.at(-1)!.max[2] > 1e-6) {
        groups.push([]);
      }
      groups.at(-1)!.push(p);
    }
    expect(groups.map(l => l.length)).toEqual([8, 8, 9]);
    // The first piece is attached: against the fairing's lip, level with its ledge, as wide as the root.
    expect(rows[0].min[2]).toBe(lip);
    expect(rows[0].max[1]).toBe(8.5);
    expect(Math.abs(rows[0].min[0] - WING.root[0])).toBeLessThan(0.5);
    expect(Math.abs(rows[0].max[0] - WING.root[1])).toBeLessThan(0.5);
    // The tip: on the sand, a step up from it, a third as wide.
    const tip = rows.at(-1)!;
    expect(tip.max[2]).toBeCloseTo(lip + WING.span * 47.5 + 4, 9);
    expect(tip.max[1] - ground(world, 55, tip.max[2] + 0.5)).toBeLessThanOrEqual(STEP_H);
    expect(tip.max[1] - ground(world, 55, tip.max[2] + 0.5)).toBeGreaterThan(0);
    expect(tip.max[0] - tip.min[0]).toBeLessThan(4);
    for (const [n, l] of groups.entries()) {
      const [, , , y0, y1] = WING.pieces[n];
      expect(l[0].max[1]).toBeCloseTo(y0, 9);
      expect(l.at(-1)!.max[1]).toBeCloseTo(y1, 9);
      for (let k = 1; k < l.length; k++) {
        const drop = l[k - 1].max[1] - l[k].max[1];
        expect(drop).toBeGreaterThan(0.15);
        expect(drop).toBeLessThan(STEP_H);
        // The outline: no row over 1.5 m out of the last at either edge.
        expect(Math.abs(l[k].min[0] - l[k - 1].min[0])).toBeLessThan(1.5);
        expect(Math.abs(l[k].max[0] - l[k - 1].max[0])).toBeLessThan(1.8);
      }
      // Swept: the trailing edge's rows start further east as the wing runs out.
      expect(l.at(-1)!.min[0]).toBeGreaterThan(l[0].min[0]);
    }
    // The breaks, and the rails through them: 0.45 m wide, level with the lower lip, a step from the other.
    const rails = pieces('rail').sort((a, b) => a.min[2] - b.min[2]);
    expect(rails).toHaveLength(4);
    for (const [n, [a, b]] of [
      [groups[0].at(-1)!, groups[1][0]],
      [groups[1].at(-1)!, groups[2][0]],
    ].entries()) {
      expect(b.min[2] - a.max[2]).toBeCloseTo(3.6, 1);
      expect(Math.abs(a.max[1] - b.max[1])).toBeLessThan(STEP_H);
      for (const [k, r] of rails.slice(2 * n, 2 * n + 2).entries()) {
        expect(r.min[2]).toBeCloseTo(a.max[2], 9);
        expect(r.max[2]).toBeCloseTo(b.min[2], 9);
        expect(r.max[0] - r.min[0]).toBeCloseTo(0.45, 9);
        expect((r.min[0] + r.max[0]) / 2).toBeCloseTo(WING.rails[k], 9);
        expect(r.max[1]).toBe(Math.min(a.max[1], b.max[1]));
        for (const p of [a, b]) {
          expect(r.min[0]).toBeGreaterThan(p.min[0] + 0.4);
          expect(r.max[0]).toBeLessThan(p.max[0] - 0.4);
        }
      }
    }
    // Nobody is caught under it: where a body does not fit, it is solid to the ground.
    for (const p of rows) {
      const room =
        p.min[1] - Math.max(ground(world, p.min[0], p.min[2]), ground(world, 56, p.min[2]));
      expect(room < 0 || room >= PLAYER_H + 0.3, `row at z ${p.min[2]}`).toBe(true);
    }
    // The outline is the map's: every row between its two edges at its span, less its shear.
    for (const l of [WING.lead, WING.trail]) {
      expect(l[0][1]).toBe(0);
      expect(l.at(-1)).toEqual([54, 47.5]);
    }
  });

  it('has an engine fallen on the sand beside the wreck near the waterline, askew, not walked through, and one awash in the lagoon off the tail', () => {
    const [[x, z, r, l, skew], [x2, z2]] = ENGINES;
    const strips = pieces('fallen').sort((a, b) => a.min[0] - b.min[0]);
    expect(strips).toHaveLength(6);
    expect(x - FRAME.shore).toBeLessThan(10);
    expect(z - MID).toBeGreaterThan(HULL.r + 10);
    // 15 m of it along x and 12 m along z: 19 m long at 38 degrees.
    expect(strips.at(-1)!.max[0] - strips[0].min[0]).toBeCloseTo(l * 0.788, 0);
    expect(skew).toBeCloseTo(Math.tan((38 * Math.PI) / 180), 2);
    for (const [k, p] of strips.entries()) {
      expect((p.min[2] + p.max[2]) / 2).toBeCloseTo(z + skew * ((p.min[0] + p.max[0]) / 2 - x), 9);
      expect(p.max[2] - p.min[2]).toBeCloseTo(2 * r + 0.4, 9);
      expect(p.max[1] - ground(world, p.min[0], p.min[2])).toBeGreaterThan(3);
      expect(k === 0 || p.min[0] === strips[k - 1].max[0]).toBe(true);
    }
    // Run at from the camp's side and from the hull's: stopped by it.
    for (const [from, yaw] of [
      [z + 8, NORTH],
      [z - 8, SOUTH],
    ]) {
      const s = red().put(x, ground(world, x, from), from, yaw);
      s.run(180, KEY.FORWARD | KEY.SPRINT, yaw);
      expect(Math.abs(s.p.z - z)).toBeGreaterThan(r);
      expect((s.p.z - z) * (from - z)).toBeGreaterThan(0);
    }
    expect(x2).toBeLessThan(HULL.sections[0][0]);
    expect(ground(world, x2, z2)).toBeLessThan(DEPTH - 1);
    expect(pieces('engine')[0].max[1]).toBeGreaterThan(1);
  });
});

/** The ways across on the sand, each from red's spawn to the centre line. */
const WAYS = {
  // Through the gap by the trees, between the heap of ribs and the nose.
  east: [g(66, 179), g(66, 165), g(75, 128), g(80.7, 113), g(80.7, MID)],
  // Between the fallen engine and the wing, then through the gap at the waterline, wading the flooded furrow.
  west: [g(55, 179), g(47.5, 152), g(48.2, 134), g(43, 114), g(42.75, MID)],
  // Under the wing to the door, and into the hold.
  hold: [g(55, 179), g(47.5, 152), g(48.2, 134), g(59, 118), g(59, 108), go(59, MID, HOLD.floor)],
};
/** The high road, red's half: up the wing from the spawn to the fairing's ledge, a jump over each break. */
const WING_UP = [
  g(66, 179),
  g(62, 160),
  g(55, 155),
  go(55, 152, 1.6),
  go(55.5, 141.2, 3.3, false),
  leap([55.5, 140.9], [55.5, 136], 3.6, W),
  go(55.5, 126.8, 6.8, false),
  leap([55.5, 126.4], [55.5, 121.5], 6.4, W),
  go(62, 112, 8.5),
];
/** And down it from the ledge to the sand. */
const WING_DOWN = [
  go(55.5, 121.7, 6.4, false),
  leap([55.5, 121.9], [55.5, 126.5], 6.8, W),
  go(55.5, 136.1, 3.6, false),
  leap([55.5, 136.4], [55.5, 141], 3.3, W),
  go(55, 152, 1.6),
  g(55, 156),
  g(62, 160),
];
/** From the ledge through the tear into the gallery, to the centre line. */
const GALLERY = [go(67.5, 108.5, 8.5), go(67.5, MID, 8.5)];
/** The whole of it: red's wing, the gallery, blue's wing. */
const HIGH = [...WING_UP, ...GALLERY, ...blue([GALLERY[0], go(62, 111, 8.5), ...WING_DOWN])];
/** The same on a rail over each break, with no jump: from the spawn to the centre line. */
const RAIL = [
  ...WING_UP.slice(0, 4),
  go(53.5, 141, 3.3),
  go(53.5, 136.4, 3.6, false),
  go(53.5, 126.4, 6.8),
  go(53.5, 122, 6.4, false),
  go(62, 112, 8.5),
  ...GALLERY,
];
/** Round the tail: wade to the first float, then jump by jump to the raft on the line; and on from the raft, the same jumps the other way. */
const LAGOON = {
  out: [
    g(55, 179),
    g(40, 150),
    g(26, 118),
    g(23.2, 117.5, false),
    leap([23, 117.5], [20, 117.5], 0.35, W),
    leap([16.4, 117.2], [12, 114.8], 0.5, W),
    leap([10.3, 114], [6, 112.5], 1.4, W),
    go(4, 108.8, 1.4, false),
    leap([3.5, 107.7], [3, 102], 0.4, W),
  ],
  in: [
    go(3, 97, 0.4),
    leap([3, 103.5], [3.5, 108.5], 1.4, W),
    leap([6.5, 112.5], [11, 114.5], 0.5, W),
    leap([12.6, 115], [17, 117.3], 0.35, W),
    go(21, 117.5, 0.35, false),
    g(26, 118),
  ],
};
/** Inside the middle section, from the hold up to the back: a crate and a pull up through a hole at each level. */
const CLIMB = [
  leap([53.9, MID], [55, MID], 2.25, W),
  go(54.5, MID, 2.25, false),
  leap([55.1, MID], [57.5, MID], 4.5, W),
  go(59.8, MID, 4.5, false),
  leap([60.3, MID], [61.5, MID], 5.9, W),
  go(62, MID, 5.9, false),
  leap([61.6, MID], [59, MID], 8.5, W),
  go(59.5, 101.5, 8.5, false),
  go(57, 101.8, 8.5, false),
  leap([57, 101.2], [57, MID], 10.5, W),
  go(56.6, MID, 10.5, false),
  leap([57.1, MID], [59.5, MID], 13.25, W),
];

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

  it('takes the high road: up the wing with a jump over each break, along the ledge, through the gallery and down the other wing', () => {
    const s = red();
    const f = fly(s, HIGH);
    expect(f.failed).toBeUndefined();
    expect(s.p.z).toBeLessThan(45);
    expect(s.p.y).toBeCloseTo(walked(62, 160), 2);
    expect(s.ev & EV.JUMP).toBeTruthy();
    expect(s.ev & EV.RESPAWN).toBe(0);
    expect(s.modes).toEqual(new Set([MODE.GROUND, MODE.AIR]));
    expect(f.seconds).toBeLessThan(30);
    expect(s.hard).toBeLessThan(12);
  });

  it('crosses each break of the wing on a rail with no jump, both ways; off a lip without one, a runner falls short', () => {
    const s = red();
    const f = fly(s, across(RAIL));
    expect(f.failed).toBeUndefined();
    expect(s.p.z).toBeLessThan(25);
    expect(s.ev & (EV.JUMP | EV.RESPAWN)).toBe(0);
    expect(s.modes).toEqual(new Set([MODE.GROUND]));
    expect(f.seconds).toBeLessThan(30);
    // Sprinting off each lip between the rails, up the wing and down it: not onto the next piece on his feet.
    for (const [z, y, yaw] of [
      [144, 2.66, NORTH],
      [130, 5.43, NORTH],
      [118, 7, SOUTH],
      [132, 4.97, SOUTH],
    ]) {
      const t = red()
        .put(55.75, y + 0.5, z, yaw)
        .settle();
      const y0 = t.p.y;
      t.until(p => !p.ground, KEY.FORWARD | KEY.SPRINT, yaw, 200);
      t.until(p => p.ground, KEY.FORWARD | KEY.SPRINT, yaw, 200);
      expect(t.modes.has(MODE.HANG) || t.p.y < y0 - 2, `from ${z}`).toBe(true);
    }
  });

  it("climbs from the gallery onto the hull's back by a crate and a hole, and drops from the back into the gallery by the same hole", () => {
    const s = red().put(67.5, 8.5, MID);
    // Round the gallery's hole to the crate under the back's.
    const f = fly(s, [
      go(66.5, 104.5, 8.5, false),
      go(59.5, 104.5, 8.5, false),
      ...CLIMB.slice(-5),
    ]);
    expect(f.failed).toBeUndefined();
    expect(s.modes.has(MODE.CLIMB)).toBe(true);
    // Along the back and back: off the hole's east edge, onto the crate or the gallery's floor, unhurt.
    expect(fly(s, [go(64, MID, 13.25)]).failed).toBeUndefined();
    s.goTo(57, MID);
    s.until(p => p.ground, 0, WEST);
    expect([8.5, 10.5]).toContain(s.p.y);
    expect(s.p.x).toBeGreaterThan(53);
    // And off its west edge at a crouch: 4.75 m down onto the floor.
    const t = red().put(50, 13.25, MID, EAST);
    t.until(p => !p.ground, KEY.FORWARD | KEY.CROUCH, EAST, 300);
    t.until(p => p.ground, 0, EAST);
    expect(t.p.y).toBe(8.5);
    expect(t.hard).toBeLessThan(15);
    expect(t.hard).toBeGreaterThan(12);
    // From there out by the blue tear, onto blue's ledge.
    expect(
      fly(t, blue([go(62, MID + 4, 8.5), go(67.5, 108.5, 8.5), go(62, 111, 8.5)])).failed,
    ).toBeUndefined();
  });

  it('zigzags through the middle section: from the hold up to the back by the three holes, and down by them', () => {
    const s = red().put(52.5, HOLD.floor, MID);
    const f = fly(s, CLIMB);
    expect(f.failed).toBeUndefined();
    expect(s.p.y).toBe(13.25);
    expect(f.seconds).toBeLessThan(9);
    // Down: the back's hole, the gallery's, the deck's, each further along than the last.
    const t = red().put(62, 13.25, MID);
    const d = fly(t, [
      go(56.5, MID, 8.5, false),
      go(55, 102, 8.5, false),
      go(59.5, 102, 8.5, false),
      go(61, 102, 4.5, false),
      go(57, 102, 4.5, false),
      go(55.5, 102, HOLD.floor, false),
      go(59, MID, HOLD.floor),
      go(59, MID - 8, 1),
    ]);
    expect(d.failed).toBeUndefined();
    expect(t.ev & (EV.JUMP | EV.RESPAWN)).toBe(0);
    expect(t.hard).toBeLessThan(15);
  });

  it('crosses on the lower deck of the middle section: up a container and in by the red tear, out by the blue one', () => {
    const [box] = pieces('container').filter(p => p.min[2] < MID + 8);
    const s = red();
    const f = fly(s, [
      ...WAYS.hold.slice(0, 3),
      g(51, 113),
      leap([51, 111], [51, 109], box.max[1], W),
      leap([51, 108.6], [51, 105.5], 4.5, W),
      go(49.5, MID, 4.5),
      go(49.5, 94, 4.5),
      go(51, 91.4, box.max[1], false),
      g(48.5, 88),
      ...blue(WAYS.hold.slice(0, 3).reverse()),
    ]);
    expect(f.failed).toBeUndefined();
    expect(s.p.z).toBeLessThan(25);
    expect(s.ev & EV.RESPAWN).toBe(0);
    expect(f.seconds).toBeLessThan(26);
    expect(s.hard).toBeLessThan(12);
  });

  it('crosses on the lower deck of the nose and of the tail, tear to tear, and climbs each from its floor to its back', () => {
    // The nose: a pull up from the sand, across west of the hole, and down.
    const n = red().put(85.8, ground(world, 85.8, 112), 112);
    expect(
      fly(n, [leap([85.8, 108.8], [85.8, 105], 5.75, W), go(85.8, 94, 5.75)]).failed,
    ).toBeUndefined();
    n.goTo(85.8, 88, { sprint: true });
    n.settle();
    expect(n.p.z).toBeLessThan(89);
    expect(n.p.y).toBeLessThan(4.5);
    expect(n.hard).toBeLessThan(10);
    // From the east gap: onto its floor, then a crate and a hole at each level.
    const up = red().put(80, ground(world, 80, MID), MID);
    const f = fly(up, [
      leap([81.3, MID], [84, MID], 2.5, W),
      go(87, MID, 2.5, false),
      leap([87.9, MID], [89, MID], 3.5, W),
      go(88.5, MID, 3.5, false),
      leap([89.1, MID], [92, MID], 5.75, W),
      go(91, 102, 5.75, false),
      go(86, 102, 5.75, false),
      go(84, 101.8, 5.75, false),
      leap([84, 101.2], [84, MID], 7.15, W),
      go(83.5, MID, 7.15, false),
      leap([84.1, MID], [87, MID], 9.75, W),
      go(88.4, 101.6, 9.75, false),
      leap([88.4, 101.2], [88.4, MID], 11.75, W),
      go(89, MID, 11.75, false),
      leap([88.4, MID], [86, MID], 14.5, W),
    ]);
    expect(f.failed).toBeUndefined();
    expect(f.seconds).toBeLessThan(12);
    // The tail: from the float under its tear, across the deck, and down into the lagoon, in his depth.
    const [float] = pieces('float').filter(p => p.min[2] < MID + 8);
    const t = red().put(24.5, float.max[1], 109);
    expect(
      fly(t, [leap([24.5, 108.4], [24.5, 105], 2.25, W), go(22.5, 94.5, 2.25)]).failed,
    ).toBeUndefined();
    t.goTo(22.5, 90);
    t.settle();
    expect(t.ev & EV.RESPAWN).toBe(0);
    expect(t.p.y).toBeLessThan(0);
    // From the west gap: along its floor awash, then a crate and a hole at each level.
    const w = red().put(40, ground(world, 40, 103), 103);
    const c = fly(w, [
      go(22, 102, -0.75, false),
      go(17.5, MID, -0.75, false),
      leap([17.8, MID], [19, MID], 0.25, W),
      go(18.5, MID, 0.25, false),
      leap([19.1, MID], [22, MID], 2.25, W),
      go(24, 102, 2.25, false),
      go(27, 101.8, 2.25, false),
      go(27, MID, 2.25, false),
      leap([26.2, MID], [25, MID], 3.65, W),
      go(25.5, MID, 3.65, false),
      leap([24.9, MID], [22, MID], 6.25, W),
      go(20, 101.5, 6.25, false),
      go(17.5, 101.6, 6.25, false),
      leap([17.5, 101.2], [17.5, MID], 8.25, W),
      go(17.1, MID, 8.25, false),
      leap([17.6, MID], [20, MID], 11, W),
    ]);
    expect(c.failed).toBeUndefined();
    expect(w.ev & EV.RESPAWN).toBe(0);
    expect(w.low).toBeGreaterThan(DEPTH + 0.4);
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
    const [f0, f1] = pieces('float').filter(p => p.min[2] > MID + 8);
    const [engine] = pieces('engine');
    const [raft] = pieces('raft', false);
    expect(f0.min[0] - f1.max[0]).toBe(3);
    expect(f1.min[0] - engine.max[0]).toBe(3);
    expect(engine.max[1] - f1.max[1]).toBeCloseTo(0.9, 9);
    expect(engine.min[2] - raft.max[2]).toBe(3.5);
    for (const p of [f1, engine, raft]) {
      expect(ground(world, p.max[0], p.max[2])).toBeLessThan(DEPTH);
    }
    // The first float is aground in the shallows: reached on foot, past the fallen engine's tail.
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

  it('has a line of debris to run from the camp to the wing: a panel, a container, the landing gear, a second container, each a jump from the last', () => {
    const [panel] = pieces('panel').filter(p => p.min[0] === 67);
    const [last, container] = pieces('container')
      .filter(p => p.min[0] > 60 && p.max[0] < 72)
      .sort((a, b) => a.min[2] - b.min[2]);
    const [gear] = pieces('gear');
    const tops = [panel, container, gear, last].map(p => p.max[1]);
    // The first three about a metre over the last, 2 to 3 m on; then level, toward the wing.
    for (let k = 1; k < 3; k++) {
      expect(tops[k] - tops[k - 1]).toBeGreaterThan(0.8);
      expect(tops[k] - tops[k - 1]).toBeLessThan(1.3);
    }
    expect(Math.abs(tops[3] - tops[2])).toBeLessThan(0.5);
    expect(panel.min[2] - container.max[2]).toBeCloseTo(2.5, 9);
    expect(container.min[2] - gear.max[2]).toBeCloseTo(3, 9);
    expect(gear.min[2] - last.max[2]).toBeCloseTo(2.6, 9);
    const s = red();
    const f = fly(s, [
      g(66, 179),
      g(68.75, 166, false),
      leap([68.75, 164], [68.75, 161.3], tops[0], W),
      leap([69.6, 159.9], [69.8, 155.5], tops[1], W),
      leap([69.8, 151.4], [69.8, 146.8], tops[2], W),
      leap([69, 146], [66, 142], tops[3], W),
      go(65.5, 141.5, tops[3], false),
      // And off it onto the wing's last piece, at its lip over the second break.
      leap([64.6, 141.5], [59, 141.5], 3.3, W),
    ]);
    expect(f.failed).toBeUndefined();
    expect(s.p.y - ground(world, s.p.x, s.p.z)).toBeGreaterThan(1.8);
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
    // From four spawns, then from inside the hull: the hold, the gallery, the nose's and the tail's lower decks.
    for (const [seed, team, spawnAt, ...at] of [
      [1, 0, 0],
      [2, 0, 4],
      [3, 1, 7],
      [4, 1, 2],
      [5, 0, 0, 59, HOLD.floor, MID],
      [6, 1, 0, 70, 8.5, MID],
      [7, 0, 0, 93, 5.75, MID],
      [8, 1, 0, 30, 2.25, MID],
    ]) {
      let r = seed;
      const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
      const sim = new Sim(spawn(0, world, spawnAt, team), world);
      if (at.length) {
        sim.put(at[0], at[1], at[2]);
      }
      let keys = 0;
      let yaw = sim.p.yaw;
      let turn = 0;
      for (let k = 0; k < (at.length ? 6000 : 12000); k++) {
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

  it('leaves no runner stuck on the wreck or in it: from every top a body stands on, a few seconds of running and jumping get him 4 m away', () => {
    const kinds = [
      'skin',
      'deck',
      'fairing',
      'crate',
      'wingpiece',
      'rail',
      'fallen',
      'frame',
      'heap',
    ];
    let tried = 0;
    for (const p of LAYOUT.pieces.filter(q => kinds.includes(q.kind))) {
      for (let x = p.min[0] + 0.2; x < Math.min(p.max[0], EDGE.east - 0.5); x += 2.9) {
        const z = (p.min[2] + p.max[2]) / 2;
        if (
          brushes.some(b => meets(b, x, p.max[1], z, PLAYER_H)) ||
          ground(world, x, z) > p.max[1]
        ) {
          continue;
        }
        tried++;
        let r = Math.round(x * 31 + z * 17 + p.max[1] * 7) + 1;
        const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
        const s = red().put(x, p.max[1], z, rnd() * 6.28);
        let yaw = s.p.yaw;
        let out = false;
        for (let k = 0; k < 1500 && !out; k++) {
          if (k % 40 === 0) {
            yaw = rnd() * 6.28;
          }
          const q = s.step(KEY.FORWARD | (rnd() < 0.08 ? KEY.JUMP : 0), yaw);
          out = Math.hypot(q.x - x, q.z - z) > 4 || (q.ev & EV.RESPAWN) !== 0;
        }
        expect(out, `from ${x}, ${p.max[1]}, ${z} on a ${p.kind}`).toBe(true);
      }
    }
    expect(tried).toBeGreaterThan(300);
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

  it("has red take the high road, take blue's flag by its pod and carry it home through the gallery to score", () => {
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
    const there = [...HIGH, go(base[0], base[2] + 3, CAMP), go(base[0], base[2], base[1], false)];
    expect(fly(s, there).failed).toBeUndefined();
    const carried = s.inputs.length;
    const home = teams[0].base;
    const back = [
      go(base[0], base[2] + 3, CAMP),
      ...blue([...WING_UP.slice(1), ...GALLERY]),
      GALLERY[0],
      go(62, 111, 8.5),
      ...WING_DOWN,
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
