import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { problems } from '../../test/pickups';
import { EAST, NORTH, SOUTH, Sim, WEST, toward } from '../../test/pilot';
import { checksum, nodes, off, reach, squares } from '../../test/relief';
import { flying, rest, rover, run } from '../../test/slope';
import { level, palette, MAX_TINTS } from '../client/render';
import {
  DASH_SPEED,
  FLAG_H,
  FLAG_REACH,
  GRAVITY,
  JUMP_SPEED,
  PLAYER_H,
  PLAYER_R,
  RULES,
  RUN_SPEED,
  SPRINT_SPEED,
  STEP_H,
  TICK_HZ,
} from './constants';
import { Ctf } from './ctf';
import { TEAM_TINT } from './map';
import {
  FLATS,
  HOLLOW,
  LAYOUT,
  LIP,
  MOON,
  MOUND,
  MOUNDS,
  PIT_FLOOR,
  PIT_R,
  PIT_S,
  WEST_GAP,
  ZED,
  rockOf,
} from './moon';
import { move, spawn } from './physics';
import { ground } from './relief';
import { EV, FLAG, KEY, MODE, TEAM, TEX } from './types';
import { build, hidden, ray } from './world';
import type { Brush, WorldDef } from './world';

const world = build(MOON);
const { brushes, teams } = MOON;

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
  a.side === b.side;
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

/** The rille: open to the kill floor between these two z. */
const [RILLE0, RILLE1] = [132, 148];
/** The jumps at half gravity: height, hang time and the flat reach of a run, a sprint and a dash's extra. */
const HALF = GRAVITY / 2;
const APEX = JUMP_SPEED ** 2 / (2 * HALF);
const HANG = (2 * JUMP_SPEED) / HALF;
const RUN_JUMP = RUN_SPEED * HANG;
const SPRINT_JUMP = SPRINT_SPEED * HANG;
const DASH_BONUS = ((DASH_SPEED - SPRINT_SPEED) * 10) / TICK_HZ;

describe('MOON', () => {
  it('is Tranquility: half gravity, the moon scenery, helmets, a near black sky and a hard white sun', () => {
    expect(MOON.name).toBe('Tranquility');
    expect(MOON.gravity).toBe(0.5);
    expect(MOON.scenery).toBe('moon');
    expect(MOON.helmets).toBe(true);
    expect(MOON.fog).toBeUndefined();
    expect(Math.hypot(...MOON.sun.dir)).toBeCloseTo(1, 3);
    expect(MOON.sun.dir[1]).toBeGreaterThan(0.3);
    expect(Math.max(...MOON.sun.color)).toBeGreaterThan(2.5);
    expect(Math.max(...MOON.sky[0], ...MOON.sky[1])).toBeLessThan(0.05);
    // Under the pits' floors.
    expect(MOON.floor).toBe(-26);
  });

  it('has brushes with min below max, known textures and tints, under 640 of them', () => {
    expect(brushes.length).toBeGreaterThan(60);
    // Room for a base with an inside (its walls are brushes too) and for the lips of the rille, in strips half a metre deep.
    // And one or two boxes inside a rock.
    // And the three pits' walls, floors and steps.
    expect(brushes.length).toBeLessThan(640);
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

  it('is regolith and rock with a white, metal and steel base and team colours near each flag', () => {
    const stone = brushes.filter(b => b.top === TEX.STONE).length;
    // Counted, not a share: the base's walls would dilute it.
    expect(stone).toBeGreaterThan(12);
    const count = (id: number) => brushes.filter(b => b.top === id || b.side === id).length;
    expect(count(TEX.CONCRETE)).toBeGreaterThan(20);
    expect(count(TEX.METAL)).toBeGreaterThanOrEqual(4);
    expect(count(TEX.STEEL)).toBeGreaterThanOrEqual(4);
    expect(count(TEX.BRICK) + count(TEX.WOOD) + count(TEX.LAVA)).toBe(0);
    const red = brushes.filter(b => b.tint === TEAM_TINT[0]);
    const blue = brushes.filter(b => b.tint === TEAM_TINT[1]);
    expect(red.length).toBeGreaterThanOrEqual(3);
    expect(red.length).toBe(blue.length);
    expect(red.every(b => b.min[2] > ZED / 2 + 15)).toBe(true);
    expect(blue.every(b => b.max[2] < ZED / 2 - 15)).toBe(true);
  });

  it('keeps brushes out of each other: touching is fine, overlapping is not', () => {
    for (const [i, a] of brushes.entries()) {
      for (const [j, b] of brushes.entries()) {
        const overlap = [0, 1, 2].every(
          k => a.min[k] < b.max[k] - 1e-9 && b.min[k] < a.max[k] - 1e-9,
        );
        // The two crossed boxes of a ghost octagon overlap by design.
        expect(i === j || !overlap || (a.ghost && b.ghost), `brushes ${i} and ${j}`).toBe(true);
      }
    }
  });

  it('leaves no crack a player could stand in and not get out of', () => {
    for (const [i, a] of brushes.entries()) {
      for (const [j, b] of brushes.entries()) {
        if (i >= j) {
          continue;
        }
        const [y0, y1] = [Math.max(a.min[1], b.min[1]), Math.min(a.max[1], b.max[1])];
        for (const [x, y] of [
          [0, 2],
          [2, 0],
        ]) {
          const gap = Math.max(a.min[x] - b.max[x], b.min[x] - a.max[x]);
          const [lo, hi] = [Math.max(a.min[y], b.min[y]), Math.min(a.max[y], b.max[y])];
          if (gap < 1e-9 || gap > 2 * PLAYER_R + 0.1 || hi - lo < 1e-9 || y1 - y0 < 0.5) {
            continue;
          }
          const from = Math.min(a.max[x], b.max[x]);
          const filled = brushes.some(
            (c, k) =>
              k !== i &&
              k !== j &&
              c.min[x] < from + gap &&
              c.max[x] > from &&
              c.min[y] < hi &&
              c.max[y] > lo &&
              c.min[1] < y1 &&
              c.max[1] > y0,
          );
          expect(filled, `brushes ${i} and ${j}: a ${gap} m crack`).toBe(true);
        }
      }
    }
  });
});

describe('MOON, symmetry', () => {
  it('has a mirror twin for every brush across the line z = 140, the blue accents for the red', () => {
    for (const [i, b] of brushes.entries()) {
      const t = twin(b);
      expect(
        brushes.some(c => same(c, t) && tinted(b, c)),
        `brush ${i} at ${b.min} to ${b.max}`,
      ).toBe(true);
    }
  });

  it('mirrors the bases, the spawns and the racks, the blue ones facing back', () => {
    const [red, blue] = teams;
    expect(blue.base).toEqual([red.base[0], red.base[1], ZED - red.base[2]]);
    const key = (s: number[]) => s.map(v => Math.round(v * 1e6)).join();
    const mirrored = red.spawns.map(([x, y, z, yaw]) => [x, y, ZED - z, yaw + Math.PI]);
    expect(blue.spawns.map(s => key(s)).sort()).toEqual(mirrored.map(s => key(s)).sort());
    expect(red.spawns.every(s => s[3] === 0)).toBe(true);
    for (const k of ['rack', 'blade', 'rail', 'rifle'] as const) {
      expect(blue[k]).toEqual([red[k]![0], red[k]![1], ZED - red[k]![2]]);
    }
    expect(Math.hypot(red.base[0] - blue.base[0], red.base[2] - blue.base[2])).toBeGreaterThan(60);
  });

  it('mirrors the packs, with one of each pair on each side of the rille', () => {
    const lists = [MOON.packs!, MOON.ammo!, MOON.cells!];
    for (const l of lists) {
      for (const [x, y, z] of l) {
        expect(
          l.some(q => q[0] === x && q[1] === y && q[2] === ZED - z),
          `a twin of ${x}, ${y}, ${z}`,
        ).toBe(true);
      }
    }
    // Health 4 (one in the dome), ammo 3, rail cells 2 in a half, and by the rille two of each pack and one cell.
    const half = (l: number[][]) => l.filter(p => p[2] > ZED / 2);
    expect(half(MOON.packs!)).toHaveLength(5);
    expect(half(MOON.ammo!)).toHaveLength(4);
    expect(half(MOON.cells!)).toHaveLength(2);
    expect(MOON.cells).toHaveLength(5);
    // The packs by the rille are 22 m from the line, behind the mounds' feet.
    const rille = (l: number[][]) => l.filter(p => Math.abs(p[2] - ZED / 2) < 25);
    expect(rille(MOON.packs!)).toHaveLength(2);
    expect(rille(MOON.ammo!)).toHaveLength(2);
    expect(rille(MOON.cells!)).toHaveLength(1);
  });
});

describe('MOON, bases and spawns', () => {
  it('has eight spawns a side behind the dome, on the floor, with room, apart, standing still', () => {
    for (const [team, { spawns }] of teams.entries()) {
      expect(spawns).toHaveLength(8);
      for (const [n, [x, y, z]] of spawns.entries()) {
        expect(x).toBeGreaterThanOrEqual(56);
        expect(x).toBeLessThanOrEqual(104);
        expect(Math.abs(z - ZED / 2)).toBeGreaterThan(125);
        expect(
          brushes.some(
            b => b.min[0] < x && x < b.max[0] && b.min[2] < z && z < b.max[2] && b.max[1] === y,
          ),
          `team ${team}, spawn ${n}: a top at ${y}`,
        ).toBe(true);
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

  it("stands each flag on a red or blue dais in its dome's hall, the ring and the pole clear", () => {
    for (const [
      team,
      {
        base: [x, y, z],
      },
    ] of teams.entries()) {
      const r = FLAG_REACH;
      const top = brushes.find(
        b =>
          b.max[1] === y &&
          b.min[0] <= x - r &&
          b.max[0] >= x + r &&
          b.min[2] <= z - r &&
          b.max[2] >= z + r,
      );
      expect(top, `team ${team}: a top under the whole ring`).toBeDefined();
      expect(top!.tint).toBe(TEAM_TINT[team]);
      expect(
        brushes.some(
          b =>
            b.min[0] < x + r &&
            b.max[0] > x - r &&
            b.min[2] < z + r &&
            b.max[2] > z - r &&
            b.min[1] < y + FLAG_H &&
            b.max[1] > y + 1e-6,
        ),
        `team ${team}: room`,
      ).toBe(false);
      // In the hall, 2 m from the dome's centre toward the door; a ghost, drawn indoors.
      expect([x, z - (team ? ZED - 236 : 236)]).toEqual([80, team ? 2 : -2]);
      expect(top!.ghost).toBe(true);
      // Under the dome's roof: nothing between it and the sky but the dome.
      expect(ray(world, [x, y + 1.5, z], [0, 1, 0], 100)).toBeLessThan(10);
    }
  });

  it("scores a capture in the hall: a red carrier walks in by the door to his flag's dais", () => {
    const ctf = new Ctf(world, RULES);
    const s = Sim.at(world).put(80, 1, ZED - 234);
    const [bx, by, bz] = teams[1].spawns[0];
    const b = Sim.at(world).put(bx, by, bz);
    const runners = [
      { id: 0, team: TEAM.RED, state: s.p },
      { id: 1, team: TEAM.BLUE, state: b.p },
    ];
    runners.forEach(r => ctf.join(r.id, r.team, r.state));
    ctf.tick(runners);
    expect(ctf.flags[TEAM.BLUE].state).toBe(FLAG.CARRIED);
    // Ahead of red's door, then in along the middle of the hall.
    s.put(80, 0, 205, SOUTH);
    let at = 0;
    const steps = s.until(
      p => {
        ctf.tick(runners);
        at ||= ctf.score[TEAM.RED] && p.z;
        return at > 0;
      },
      KEY.FORWARD,
      p => toward(p.x, p.z, 80, 234),
    );
    expect(steps).toBeGreaterThan(0);
    expect(ctf.score).toEqual([1, 0]);
    expect(ctf.flags.map(f => f.state)).toEqual([FLAG.HOME, FLAG.HOME]);
    // Scored on the dais, past the door (z 216.2), not outside.
    expect(at).toBeGreaterThan(234 - FLAG_REACH - 0.2);
    expect(s.p.y).toBeCloseTo(1, 3);
  });
});

describe('MOON, racks and packs', () => {
  it('stands each rack and pack on a top clear of brushes, off the flag bases', () => {
    expect(problems(MOON)).toEqual([]);
  });

  it('stands the four racks 2.5 m apart on the plinth, 1.5 m up, behind the dome', () => {
    for (const [team, t] of teams.entries()) {
      const racks = [t.rifle!, t.rail!, t.rack!, t.blade!];
      for (const [k, r] of racks.entries()) {
        expect(r[1]).toBe(1.5);
        expect(
          brushes.some(
            b =>
              b.max[1] === 1.5 &&
              b.min[0] < r[0] &&
              r[0] < b.max[0] &&
              b.min[2] < r[2] &&
              r[2] < b.max[2],
          ),
        ).toBe(true);
        if (k) {
          expect(r[0] - racks[k - 1][0]).toBeCloseTo(2.5, 6);
        }
      }
      // Between the spawns' rows and the dome's back (z 258).
      expect(team ? ZED - racks[0][2] : racks[0][2]).toBeGreaterThan(258);
    }
  });

  it('stands every pack on the floor, a tier, a module, a tube or a stone: no pack on the landing pad', () => {
    for (const [x, y, z] of [...MOON.packs!, ...MOON.ammo!, ...MOON.cells!]) {
      expect(y === 0 || y === 5 || y === 3.5).toBe(true);
      expect(x).toBeGreaterThan(20);
      expect(z).toBeGreaterThan(0);
    }
  });
});

/** The highest top under (x, z) at or above y0, or -Infinity: what a falling player lands on. */
const topAt = (x: number, z: number) =>
  Math.max(
    -Infinity,
    ...brushes
      .filter(b => b.min[0] < x && x < b.max[0] && b.min[2] < z && z < b.max[2])
      .map(b => b.max[1]),
  );

describe('MOON, the rim and the layout the scenery follows', () => {
  it('lays out what the scenery draws on its boxes: both halves, the blue one mirrored', () => {
    const { pads, masts } = LAYOUT;
    expect([pads.length, masts.length]).toEqual([2, 12]);
    expect(pads[1]).toEqual([40, ZED - 220, 13]);
    // A ship stands on each pad, the blue one mirrored, noses toward the other base.
    expect(MOON.ships).toEqual([
      [40, 0.25, 220, 0],
      [40, 0.25, ZED - 220, Math.PI],
    ]);
    for (const [x, z] of masts) {
      expect(
        brushes.some(
          b => b.min[0] < x && x < b.max[0] && b.min[2] < z && z < b.max[2] && b.max[1] >= 10,
        ),
      ).toBe(true);
    }
  });

  it('plugs the rille at both ends under the ground: a runner in it heading out stays in it', () => {
    // The two ghosts that go down to the rille's bottom, tops level with the ground: nothing to see.
    const plugs = brushes.filter(
      b =>
        b.ghost &&
        b.min[1] === -30 &&
        b.min[2] === RILLE0 &&
        b.max[2] === RILLE1 &&
        (b.max[0] <= 0 || b.min[0] >= 160),
    );
    expect(plugs.map(b => [...b.min, ...b.max])).toEqual([
      [-10, -30, RILLE0, 0, 0, RILLE1],
      [160, -30, RILLE0, 170, 0, RILLE1],
    ]);
    for (const [x, yaw] of [
      [1, WEST],
      [159, EAST],
    ]) {
      // Too deep to catch the plug's lip, as the rille's own walls are from there.
      const s = Sim.at(world).put(x, -8, 140, yaw);
      const k = s.until(
        p => {
          // Against the plug: out of the arena the ground would lift him to 0.
          expect(Math.abs(p.x - 80)).toBeLessThan(80 - PLAYER_R + 1e-3);
          return (p.ev & EV.RESPAWN) > 0;
        },
        KEY.FORWARD | KEY.SPRINT,
        yaw,
        300,
      );
      expect(k).toBeGreaterThan(30);
      expect(s.low).toBeLessThan(MOON.floor + 1);
    }
  });

  it('has no wall round the arena: what is drawn of the brushes stays in it, and no ghost stands on its edge', () => {
    const drawn = level(world);
    for (let i = 0; i < drawn.length; i += 10) {
      expect(drawn[i] >= 0 && drawn[i] <= 160 && drawn[i + 2] >= 0 && drawn[i + 2] <= ZED).toBe(
        true,
      );
    }
    for (const [x, z] of [
      [-5, 100],
      [165, 100],
      [80, -5],
      [80, 285],
    ]) {
      expect(topAt(x, z)).toBe(-Infinity);
    }
  });
});

describe('MOON, the rille', () => {
  it('is open to the kill floor from x 0 to 160, but at its three crossings and where its ends close', () => {
    let open = 0;
    let total = 0;
    for (let x = 0.25; x < 160; x += 0.5) {
      for (let z = RILLE0 + 2.1; z < RILLE1 - 2.1; z += 0.5) {
        total++;
        const top = topAt(x, z);
        if (top === 14) {
          continue;
        }
        if (top === -Infinity) {
          open++;
        } else {
          // Something solid in the middle of the rille: a crossing.
          const bridge = x > 74 && x < 86;
          const stones = x > 126 && x < 135;
          // And the spurs that close its two ends.
          const ends = x < 8 || x > 152;
          expect(bridge || stones || ends, `solid at ${x}, ${z}`).toBe(true);
        }
      }
    }
    expect(open / total).toBeGreaterThan(0.85);
    expect(MOON.floor).toBeLessThan(-topAt(0, 0) - 10);
  });

  it('has a central bridge 12 m wide, level with the floor, with a low wall on each side', () => {
    const deck = brushes.find(b => b.min[0] === 74 && b.max[0] === 86 && b.max[1] === 0)!;
    expect([deck.min[2], deck.max[2]]).toEqual([RILLE0, RILLE1]);
    const walls = brushes.filter(b => b.min[2] === RILLE0 && b.max[2] === RILLE1 && b.min[1] === 0);
    expect(walls).toHaveLength(2);
    for (const w of walls) {
      expect(w.max[1]).toBeGreaterThan(1);
      expect(w.max[1]).toBeLessThanOrEqual(1.2);
    }
  });

  it('leaves a west gap longer than a running or a sprinting jump at full gravity, a sprint away at half', () => {
    const spurs = brushes.filter(
      b => b.min[0] === 12 && b.max[0] === 24 && b.max[1] === 0 && b.tint,
    );
    expect(spurs).toHaveLength(2);
    const [blue, red] = spurs.sort((a, b) => a.min[2] - b.min[2]);
    expect(red.min[2] - blue.max[2]).toBeCloseTo(WEST_GAP, 9);
    // Half gravity: the jump hangs twice as long and rises twice as high.
    expect(APEX).toBeCloseTo(2.45, 9);
    expect(HANG).toBeCloseTo(1.4, 9);
    expect(RUN_JUMP).toBeCloseTo(8.4, 9);
    expect(SPRINT_JUMP).toBeCloseTo(12.6, 9);
    // A walk does not make it, a sprint jump does (a body is 0.8 m wide), and a dash only adds.
    expect(WEST_GAP).toBeGreaterThan(RUN_JUMP + 2 * PLAYER_R);
    expect(WEST_GAP).toBeLessThan(SPRINT_JUMP + 1);
    expect(WEST_GAP).toBeLessThan(SPRINT_JUMP + DASH_BONUS);
    // At full gravity the same sprint jump flies 6.3 m, a dash adds 1.2 m more: well short.
    expect(WEST_GAP).toBeGreaterThan(
      (SPRINT_SPEED * 2 * JUMP_SPEED) / GRAVITY + 2 * DASH_BONUS + 4,
    );
  });

  it('has east stones at three heights, each a short jump from the last', () => {
    const stones = brushes.filter(b => b.min[0] >= 126 && b.max[0] <= 135 && b.min[1] === -30);
    expect(stones).toHaveLength(3);
    const tops = stones.map(b => b.max[1]).sort((a, b) => a - b);
    expect(new Set(tops).size).toBe(2);
    // From the lip (y 0): up 1.2, up 1.2, down 1.2, down 1.2; each rise within the half gravity apex.
    const ordered = [...stones].sort((a, b) => b.min[2] - a.min[2]);
    const heights = [0, ...ordered.map(b => b.max[1]), 0];
    for (let k = 1; k < heights.length; k++) {
      expect(heights[k] - heights[k - 1]).toBeLessThanOrEqual(APEX - 1);
      expect(Math.abs(heights[k] - heights[k - 1])).toBeGreaterThan(STEP_H);
    }
    // Gaps of 1 to 1.5 m between them and the lips, well under a walking jump.
    const edges = [RILLE1, ...ordered.flatMap(b => [b.max[2], b.min[2]]), RILLE0];
    for (let k = 0; k < edges.length; k += 2) {
      expect(edges[k] - edges[k + 1]).toBeGreaterThanOrEqual(0.9);
      expect(edges[k] - edges[k + 1]).toBeLessThan(RUN_JUMP / 2);
    }
  });
});

/** A world, the same but for the gravity. */
const withGravity = (gravity: number): WorldDef => ({ ...MOON, gravity });

describe('MOON, flown with the real physics', () => {
  /**
   * A run at the west spur from the field, a jump at the lip, optionally a dash and a double jump
   * the given steps later: whether the player ends on the blue lip, standing, without having fallen.
   */
  const crosses = (
    gravity: number,
    o: { sprint: boolean; edge: number; dash?: number; dbl?: number },
  ) => {
    const w = build(withGravity(gravity));
    const s = Sim.at(w).put(18, 0, 190, NORTH);
    const lip = RILLE1 - (RILLE1 - RILLE0 - WEST_GAP) / 2;
    let t = -1;
    for (let k = 0; k < 900; k++) {
      let keys = KEY.FORWARD | (o.sprint ? KEY.SPRINT : 0);
      if (t < 0 && s.p.ground && s.p.z <= lip + o.edge) {
        t = k;
        keys |= KEY.JUMP;
      } else if (t >= 0) {
        keys |= (k - t === o.dash ? KEY.DASH : 0) | (k - t === o.dbl ? KEY.JUMP : 0);
      }
      s.step(keys, NORTH);
      if (t >= 0 && k > t + 3 && s.p.ground) {
        break;
      }
      if (s.p.y < -3) {
        break;
      }
    }
    return s.p.ground && s.p.y === 0 && s.p.z < 140 && s.low > -1;
  };

  it('is crossed at half gravity by a sprint and a jump from the lip', () => {
    // A jump from the last 0.2 m before the edge lands on the far lip (a body is 0.8 m wide).
    for (const edge of [0.2, 0.1, 0]) {
      expect(crosses(0.5, { sprint: true, edge }), `edge ${edge}`).toBe(true);
    }
  });

  it('is not crossed at half gravity by a run and a jump, with no sprint, nor by a sprint jumped 0.5 m early', () => {
    expect(crosses(0.5, { sprint: false, edge: 0.2 })).toBe(false);
    expect(crosses(0.5, { sprint: true, edge: 0.5 })).toBe(false);
  });

  it('is crossed at half gravity with a sprint, a jump and a dash, which forgives a jump 0.5 m early', () => {
    let some = false;
    for (let d = 1; d < 40; d += 2) {
      some ||= crosses(0.5, { sprint: true, edge: 0.5, dash: d });
    }
    expect(some).toBe(true);
  });

  it('is not crossed at full gravity by a sprint and a jump, alone, with a dash or with a double jump', () => {
    for (const edge of [0.4, 0.2, 0]) {
      expect(crosses(1, { sprint: true, edge }), `plain, ${edge}`).toBe(false);
      for (let d = 1; d < 80; d += 3) {
        expect(crosses(1, { sprint: true, edge, dash: d }), `dash ${d}`).toBe(false);
        expect(crosses(1, { sprint: true, edge, dbl: d }), `double ${d}`).toBe(false);
      }
    }
  });

  /**
   * Walks to within `jd` of a point on a top, then jumps and steers in the air: forward or back so
   * as to land on the point, as a player does. Returns the steps taken, -1 if it never stands there.
   */
  const flyTo = (s: Sim, [x, y, z]: [number, number, number], jd = 99, r = 1.2) =>
    s.until(
      p => p.ground && Math.abs(p.y - y) < 1e-3 && Math.hypot(p.x - x, p.z - z) < r,
      p => {
        const d = Math.hypot(x - p.x, z - p.z);
        if (p.ground) {
          return KEY.FORWARD | (d < jd ? KEY.JUMP : 0);
        }
        const v = (p.vx * (x - p.x) + p.vz * (z - p.z)) / (d || 1);
        const t = Math.max(
          (p.vy + Math.sqrt(Math.max(p.vy ** 2 + 2 * HALF * (p.y - y), 0))) / HALF,
          0.05,
        );
        return v * t < d - 0.3 ? KEY.FORWARD : v * t > d + 0.3 ? KEY.BACK : 0;
      },
      p => toward(p.x, p.z, x, z),
      400,
    );

  it('crosses the east stones at half gravity, up and down, never falling', () => {
    const s = Sim.at(world).put(128.5, 0, 150, NORTH);
    // Red lip, stone 1.2 m, stone 2.4 m, stone 1.2 m, the blue floor.
    for (const to of [
      [128.5, 1.2, 145],
      [132.5, 2.4, 140],
      [128.5, 1.2, 135],
      [128.5, 0, 129],
    ] as [number, number, number][]) {
      expect(flyTo(s, to), `to ${to}`).toBeGreaterThanOrEqual(0);
    }
    expect(s.low).toBeGreaterThan(-1);
  });

  it('cannot take the 2.4 m stone from the floor at full gravity in one jump, nor the bridge walls away', () => {
    const s = Sim.at(build(withGravity(1))).put(132.5, 0, 150, NORTH);
    s.until(p => p.ground, 0);
    const k = s.until(
      p => p.y >= 2.39,
      p => KEY.FORWARD | (p.ground ? KEY.JUMP : 0),
      NORTH,
      40,
    );
    expect(k).toBe(-1);
  });

  it('walks over the central bridge from the red field to the blue one, and drops no one', () => {
    const s = Sim.at(world).put(80, 0, 160, NORTH);
    expect(s.goTo(80, 120, { r: 0.3 })).toBeGreaterThan(0);
    expect(s.p.y).toBe(0);
    expect(s.low).toBe(0);
  });

  it('takes a jump from every spawn to the racks on the plinth', () => {
    for (const [team, { spawns, rack, blade, rail, rifle }] of teams.entries()) {
      for (const at of [rack!, blade!, rail!, rifle!]) {
        const [x, y, z, yaw] = spawns[0];
        const s = Sim.at(world).put(x, y, z, yaw);
        const k = flyTo(s, at, 5);
        expect(k, `team ${team}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

const relief = world.relief!;
const { at } = MOON.relief!;
type P3 = [number, number, number];

describe('MOON, the relief round the arena', () => {
  it('is a 4 m lattice over an ellipse of 600 by 720 m, with no ground in the rille nor in the notches of its lips', () => {
    expect(MOON.relief).toMatchObject({
      hole: [0, RILLE0, 160, RILLE1],
      bound: [80, 140, 300, 360],
      cell: 4,
    });
    expect([relief.x0, relief.z0, relief.nx, relief.nz]).toEqual([-220, -220, 151, 181]);
    // Over the rille and its notches the brushes are the floor, and the void stays open.
    const deepest = LIP.indexOf(Math.max(...LIP));
    for (const [x, z] of [
      [80, 140],
      [1, 140],
      [159.9, 132.1],
      [deepest + 0.5, 148.2],
      [deepest + 0.5, 148 + LIP[deepest] - 0.1],
      [deepest, 149],
      [deepest + 0.5, 132 - LIP[deepest] + 0.1],
    ]) {
      expect(ground(world, x, z), `${x}, ${z}`).toBe(-Infinity);
    }
    expect(ground(world, deepest + 0.5, 148 + LIP[deepest] + 0.1)).toBe(0);
    // Everywhere else in the arena there is ground, on the slabs or over them, but in the hollow.
    for (let x = 1.5; x < 160; x += 3) {
      for (let z = 1.5; z < ZED; z += 3) {
        const g = ground(world, x, z);
        const zf = Math.abs(z - 140);
        const notch = zf >= 8 && zf <= 8 + LIP[Math.floor(x)];
        const bowl = Math.hypot(x - HOLLOW[0], zf + 140 - HOLLOW[1]) < 14;
        expect(g === -Infinity ? zf < 8 || notch : g >= 0 || bowl, `${x}, ${z}`).toBe(true);
      }
    }
    expect(ground(world, 0, 140)).toBe(0);
    expect(ground(world, 160, ZED)).toBe(0);
    // A pit for each run of a notch and its twin.
    // (The others are the rows of the three craters' pits.)
    const lips = relief.pits.filter(([, z0, , z1]) => z0 === 148 || z1 === 132);
    expect(lips.length).toBeGreaterThan(40);
    expect(lips.length % 2).toBe(0);
    expect(relief.pits.every(([x0, z0, x1, z1]) => x0 < x1 && z0 < z1)).toBe(true);
  });

  it('is exactly 0 for 12 m round the arena and on its edge, and rolls beyond', () => {
    let rolls = 0;
    const flat = nodes(relief).filter(([x, z, h]) => {
      const d = off(x, z);
      rolls = Math.max(rolls, d > 12 && d < 60 ? Math.abs(h) : 0);
      const edge = !d && (x === 0 || x === 160 || z === 0 || z === ZED);
      return (edge || (d > 0 && d <= 12)) && !Object.is(h, 0);
    });
    expect(flat).toEqual([]);
    expect(rolls).toBeGreaterThan(3);
    // Between the nodes too, corners included.
    for (const [x, z] of [
      [-12, 50.5],
      [-3.3, 139],
      [171.9, 277],
      [80.4, -11.6],
      [166, 289.7],
    ]) {
      expect(at(x, z)).toBe(0);
      expect(ground(world, x, z)).toBe(0);
    }
  });

  it('is the same on both sides of the centre line', () => {
    const { nx, nz, h } = relief;
    let odd = 0;
    for (let n = 0; n < h.length; n++) {
      odd += h[n] === h[(n % nx) + (nz - 1 - Math.floor(n / nx)) * nx] ? 0 : 1;
    }
    expect(odd).toBe(0);
    for (const [x, z] of [
      [-100.25, 17.75],
      [301.125, 333.875],
      [10, -150],
      [250, 139.5],
    ]) {
      expect(at(x, z)).toBe(at(x, ZED - z));
    }
  });

  it('is never steeper than 38 degrees where a body can stand, node to node or on a triangle', () => {
    let [edge, slant] = [0, 0];
    for (const [, , a, b, c, d] of squares(relief)) {
      edge = Math.max(edge, ...[b - a, c - a, d - b, d - c].map(v => Math.abs(v) / relief.cell));
      // The two triangles ground() stands on: (a, b, d) and (a, c, d).
      slant = Math.max(slant, Math.hypot(b - a, d - b), Math.hypot(d - c, c - a));
    }
    expect(edge).toBeLessThanOrEqual(0.78);
    expect(slant / relief.cell).toBeLessThanOrEqual(0.78);
    // A step of DASH_SPEED / TICK_HZ up the steepest of it is within STEP_H.
    expect((DASH_SPEED / TICK_HZ) * 0.78).toBeLessThan(STEP_H);
    // And it is not a plain: the ramps and the bowls are steeper than 25 degrees somewhere.
    expect(edge).toBeGreaterThan(0.47);
  });

  it('stays 5 m above the kill floor and under 25 m inside the bound, where the crater wall is 15 to 23 m up', () => {
    const inside = nodes(relief).filter(([x, z]) => reach(relief, x, z) <= 1);
    const hs = inside.map(n => n[2]);
    expect(Math.min(...hs)).toBeGreaterThan(MOON.floor + 5);
    expect(Math.min(...hs)).toBeLessThan(-8);
    expect(Math.max(...hs)).toBeLessThan(25);
    const wall = inside.filter(([x, z]) => reach(relief, x, z) > 0.985).map(n => n[2]);
    expect(wall.length).toBeGreaterThan(200);
    expect(Math.min(...wall)).toBeGreaterThan(15);
    expect(Math.max(...wall)).toBeLessThan(23);
    // Past the bound it climbs on to a crest a body in the crater never sees over.
    expect(relief.top).toBeGreaterThan(60);
  });

  it('builds the same lattice on every engine: no Math.sin, cos, pow or ** in it, its bits pinned', () => {
    for (const file of ['moon.ts', 'relief.ts']) {
      const src = readFileSync(new URL(file, import.meta.url), 'utf8').replace(
        /\/\*[^]*?\*\/|\/\/.*/g,
        '',
      );
      expect(
        src.match(/\*\*|Math\.(?!imul|sqrt|abs|min|max|floor|ceil|round|PI)\w+/g) ?? [],
      ).toEqual([]);
    }
    expect(checksum(relief)).toBe(2251941057);
  });

  it('keeps every spawn, flag base, rack and pack on flat ground: the relief is exactly 0 under each', () => {
    const points = [
      ...teams.flatMap(t => [t.base, ...t.spawns, t.rack!, t.blade!, t.rail!, t.rifle!]),
      ...MOON.packs!,
      ...MOON.ammo!,
      ...MOON.cells!,
    ];
    expect(points).toHaveLength(2 * 13 + 23);
    for (const [x, , z] of points) {
      // The cell on the bridge is over the rille.
      expect(ground(world, x, z), `${x}, ${z}`).toBe(z === ZED / 2 ? -Infinity : 0);
      for (const [dx, dz] of [
        [1.5, 0],
        [-1.5, 0],
        [0, 1.5],
        [0, -1.5],
      ]) {
        expect(at(x + dx, z + dz)).toBe(0);
      }
    }
  });

  it('leaves a lane round each end of the rille: flat for 12 m, within a metre for 20', () => {
    for (let z = 100; z <= 180; z += 2) {
      for (const x of [-19, -16, -13, 173, 176, 179]) {
        expect(Math.abs(ground(world, x, z))).toBeLessThan(1);
      }
      for (const x of [-11, -6, -1, 161, 166, 171]) {
        expect(ground(world, x, z)).toBe(0);
      }
    }
  });

  it('has at least four jump ramps, 15 to 25 degrees over 16 m, 12 m wide, with a flat lip and a drop behind it', () => {
    const { ramps } = LAYOUT;
    expect(ramps.length).toBeGreaterThanOrEqual(4);
    for (const [x, z, ax, az] of ramps) {
      const g = (along: number, across = 0) =>
        ground(world, x + along * ax + across * az, z + along * az - across * ax);
      const [foot, lip] = [g(-16), g(0)];
      const angle = (Math.atan((lip - foot) / 16) * 180) / Math.PI;
      expect(angle, `ramp at ${x}, ${z}`).toBeGreaterThan(15);
      expect(angle).toBeLessThan(25);
      // A straight run-up, as high across 12 m, and the ground 4 m lower 16 m past the lip.
      expect(Math.abs(g(-8) - (foot + lip) / 2)).toBeLessThan(0.7);
      expect(Math.min(g(0, -6), g(0, 6))).toBeGreaterThan(lip - 1.2);
      // The lip is flat for 4 m, for a rover's belly, then drops.
      // (The west ramp's lip is on the Bowl's rim, which wanders.)
      expect(Math.abs(g(4) - lip)).toBeLessThan(0.7);
      expect(g(16)).toBeLessThan(lip - 4);
      // Each has its twin across the line.
      expect(
        ramps.some(
          r =>
            (r[0] === x && r[1] === ZED - z && r[2] === ax && r[3] === -az) || (!az && r[1] === z),
        ),
      ).toBe(true);
    }
  });

  it('has landmarks to drive to: the Bowl and its wreck, the ridge, the dishes on their hill, the boulder field', () => {
    // The Bowl, 92 m across, west on the centre line: its floor 10 m under its rim.
    // (A terrace 6 m down, 7 m under its rim, and the wreck on the floor of the pit in it.)
    const [bx, bz] = LAYOUT.wreck;
    const bowl = LAYOUT.pits.find(p => p.z === ZED / 2)!;
    expect(bz).toBe(ZED / 2);
    expect(Math.abs(bx - bowl.x)).toBeLessThan(5);
    expect(at(bowl.x, bz)).toBeLessThan(-5);
    expect(topAt(bx, bz)).toBe(PIT_FLOOR + 3.5);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0.6, 0.8],
    ]) {
      // The crest that way, 40 to 56 m out: the rim wanders.
      const crest = Math.max(
        ...[40, 43, 46, 49, 52, 55].map(d => at(bowl.x + dx * d, bz + dz * d)),
      );
      expect(crest).toBeGreaterThan(at(bowl.x, bz) + 5.5);
    }
    // The ridge, east: 10 m and more over the ground 40 m either side of it, for 130 m along the line.
    for (const z of [80, 140, 200]) {
      expect(at(248, z)).toBeGreaterThan(Math.max(at(208, z), at(288, z)) + 8);
    }
    // The dishes stand on a hill 8 m over the lane; each rock and each dish has its ghost on the ground.
    const { dishes, rocks } = LAYOUT;
    expect([dishes.length, rocks.length]).toEqual([6, 18]);
    for (const [x, z] of dishes) {
      expect(at(x, z)).toBeGreaterThan(at(x, z < 140 ? -10 : 290) + 7);
    }
    const lumps = dishes.map(([x, z]) => [x, z, 6]);
    for (const [x, z, up] of lumps) {
      // The tallest ghost over it: a rock's main block, a mast.
      const b = brushes
        .filter(c => c.ghost && c.min[0] < x && x < c.max[0] && c.min[2] < z && z < c.max[2])
        .sort((p, q) => q.max[1] - p.max[1])[0];
      expect(b, `a ghost at ${x}, ${z}`).toBeDefined();
      expect(b!.max[1]).toBeCloseTo(at(x, z) + up, 9);
      // Its foot is under the ground at every corner.
      for (const cx of [b!.min[0], b!.max[0]]) {
        for (const cz of [b!.min[2], b!.max[2]]) {
          expect(b!.min[1]).toBeLessThan(at(cx, cz) - 1);
        }
      }
      expect(reach(relief, x, z)).toBeLessThan(0.78);
      expect(off(x, z)).toBeGreaterThan(12);
    }
  });
});

describe('MOON, the relief with the real physics', () => {
  it('stops a shot on the ridge and on a mound of the field, and takes no sample for one that stays in the rille', () => {
    const o: P3 = [165, 6, 140];
    const t = ray(world, o, [1, 0, 0], 300);
    expect(t).toBeGreaterThan(47);
    expect(t).toBeLessThan(83);
    expect(ground(world, 165 + t, 140)).toBeCloseTo(6, 1);
    expect(hidden(world, o, [300, 6, 140])).toBe(true);
    expect(hidden(world, o, [200, 6, 140])).toBe(false);
    let reads = 0;
    const counted = {
      ...world,
      get relief() {
        reads++;
        return relief;
      },
    };
    const flat = build({ ...MOON, relief: undefined });
    // Along the rille, in it: the hole, where no sample is taken.
    for (const [from, d] of [
      [
        [10, -5, 140],
        [1, 0, 0],
      ],
      [
        [150, -2, 134],
        [-0.8, 0, 0.6],
      ],
    ] as [P3, P3][]) {
      expect(ray(counted, from, d, 12)).toBe(ray(flat, from, d, 12));
    }
    // ray() and trace() look for the relief once each, ground() never.
    expect(reads).toBe(4);
    // In the field, shots 0.8 m up that the flat floor lets by stop on a mound.
    let stopped = 0;
    for (let x = 10; x < 160; x += 10) {
      const low: [P3, P3] = [
        [x, 0.8, 200],
        [0, 0, -1],
      ];
      stopped += ray(flat, ...low, 40) === 40 && ray(world, ...low, 40) < 40 ? 1 : 0;
    }
    expect(stopped).toBeGreaterThan(2);
  });

  it('lets a runner walk off the arena onto the ground and back, all along its edge between the boulders', () => {
    /** The first lane from (x, z), stepping 1 m along the edge, that no boulder's ghost box comes within a metre of. */
    const lane = (x: number, z: number, yaw: number): [number, number] => {
      const across = yaw === WEST || yaw === EAST;
      for (let d = 0; ; d++) {
        const [u, w] = across ? [x, z + d] : [x + d, z];
        const hit = brushes.some(
          b =>
            b.ghost &&
            b.max[1] > 0 &&
            b.min[1] <= 0 &&
            // In the 1 m wide lane, within 15 m of the edge it starts by.
            (across
              ? b.min[2] < w + 1 && b.max[2] > w - 1 && Math.abs((b.min[0] + b.max[0]) / 2 - x) < 15
              : b.min[0] < u + 1 &&
                b.max[0] > u - 1 &&
                Math.abs((b.min[2] + b.max[2]) / 2 - z) < 15),
        );
        if (!hit) {
          // Never far: the boulders leave most of the edge open.
          expect(d).toBeLessThan(12);
          return [u, w];
        }
      }
    };
    for (const [x0, z0, yaw] of [
      [3, 60, WEST],
      [3, 215, WEST],
      [157, 100, EAST],
      [157, 190, EAST],
      [20, 3, NORTH],
      [140, 3, NORTH],
      [20, 277, SOUTH],
      [150, 277, SOUTH],
    ]) {
      const [x, z] = lane(x0, z0, yaw);
      const s = Sim.at(world).put(x, 0, z, yaw);
      let out = 0;
      for (const way of [yaw, yaw + Math.PI]) {
        for (let n = 0; n < 200; n++) {
          s.step(KEY.FORWARD | KEY.SPRINT, way);
          expect(s.p.mode, `from ${x}, ${z}, step ${n}`).toBe(MODE.GROUND);
          // On the arena's floor, then on the ground.
          const g = ground(world, s.p.x, s.p.z);
          expect(s.p.y).toBeCloseTo(g === -Infinity ? 0 : g, 3);
          out = Math.max(out, off(s.p.x, s.p.z));
        }
      }
      expect(out).toBeGreaterThan(15);
      expect(Math.hypot(s.p.x - x, s.p.z - z)).toBeLessThan(8);
      expect(s.ev & (EV.JUMP | EV.RESPAWN)).toBe(0);
    }
    // And round the end of the rille, over its plug: level ground.
    const s = Sim.at(world).put(-3, 0, 120, SOUTH);
    s.run(480, KEY.FORWARD, SOUTH);
    expect(s.p.z).toBeGreaterThan(160);
    expect([s.low, s.p.y, s.modes.size]).toEqual([0, 0, 1]);
  });

  it('stops a runner at the bound, up on the crater wall', () => {
    for (const [x, z] of [
      [-205, 140],
      [365, 140],
      [80, 485],
      [-120, -100],
    ]) {
      const yaw = toward(80, 140, x, z);
      const s = Sim.at(world).put(x, ground(world, x, z), z, yaw);
      for (let n = 0; n < 500; n++) {
        s.step(KEY.FORWARD | KEY.SPRINT, yaw);
        expect(s.p.mode).toBe(MODE.GROUND);
      }
      const k = reach(relief, s.p.x, s.p.z);
      expect(k, `from ${x}, ${z}`).toBeGreaterThan(0.999);
      expect(k).toBeLessThan(1.001);
      expect(s.p.y).toBeCloseTo(ground(world, s.p.x, s.p.z), 3);
      expect(s.p.y).toBeGreaterThan(15);
      expect(s.ev & EV.RESPAWN).toBe(0);
    }
  });
});

describe('MOON, the field, the mounds and the carved rille', () => {
  /** The lip's z on red's side over x. */
  const lip = (x: number) => RILLE1 + LIP[Math.floor(x)];
  const bowl = (x: number, z: number) =>
    Math.hypot(x - HOLLOW[0], Math.abs(z - 140) + 140 - HOLLOW[1]) < 14;

  it('rolls the field: mounds of up to 2.6 m over the slabs, never under them, on a quarter of it and more', () => {
    let [high, rough, all] = [0, 0, 0];
    for (let x = 2; x < 160; x += 2) {
      for (let z = 162; z < 204; z += 2) {
        const h = at(x, z);
        expect(h >= 0 || bowl(x, z)).toBe(true);
        high = Math.max(high, h);
        rough += h > 0.3 ? 1 : 0;
        all++;
      }
    }
    expect(high).toBeGreaterThan(2);
    expect(high).toBeLessThanOrEqual(2.6);
    expect(rough / all).toBeGreaterThan(0.25);
    // Enough to hide a runner from one standing 40 m off on the flat: a line of sight is cut.
    let cut = 0;
    for (let x = 10; x < 150; x += 10) {
      cut += hidden(world, [x, 1.6, 165], [x, 1.6, 200]) ? 1 : 0;
    }
    expect(cut).toBeGreaterThan(2);
    // Nothing in the arena is under the floor, but the hollow.
    expect(nodes(relief).some(([x, z, h]) => !off(x, z) && h < 0 && !bowl(x, z))).toBe(false);
  });

  it('stays exactly flat where a base, a rover, a pack or a jump needs it', () => {
    expect(FLATS.length).toBeGreaterThan(10);
    // (The last but the hollow's middle, which only keeps the field's mounds off its rim.)
    for (const [x0, z0, x1, z1] of FLATS.filter(f => f[0] !== HOLLOW[0])) {
      for (const side of [1, -1]) {
        for (let x = x0; x <= x1; x += 1) {
          for (let z = z0; z <= z1; z += 1) {
            expect(Object.is(ground(world, x, 140 + side * z), 0), `${x}, ${z}`).toBe(true);
          }
        }
      }
    }
    // Every brush that stands on the floor but the rocks stands on flat ground, and so does each rover.
    const standing = brushes.filter(b => b.min[1] === 0 && !(b.ghost && b.top === TEX.STONE));
    expect(standing.length).toBeGreaterThan(100);
    for (const b of standing) {
      for (const x of [b.min[0], b.max[0]]) {
        for (const z of [b.min[2], b.max[2]]) {
          expect(at(x, z), `${b.min} to ${b.max}`).toBe(0);
        }
      }
    }
    for (const [x, , z] of MOON.rovers!) {
      for (const [dx, dz] of [
        [3, 3],
        [-3, 3],
        [3, -3],
        [-3, -3],
      ]) {
        expect(at(x + dx, z + dz)).toBe(0);
      }
    }
    // The lips where a route jumps or lands: the west spurs, the bridge's ends, the east stones.
    for (const x of [13, 18, 23, 75, 80, 85, 127, 132]) {
      for (const z of [148, 150, 155]) {
        expect(at(x, z)).toBe(0);
        expect(at(x, ZED - z)).toBe(0);
      }
    }
  });

  it('carves the lips along a meander: steps of half a metre a metre, at most 6.5 m back, straight only where a crossing or a mound needs it', () => {
    expect(LIP).toHaveLength(160);
    expect(LIP.every(n => (2 * n) % 1 === 0 && n <= 6.5)).toBe(true);
    expect(Math.max(...LIP)).toBeGreaterThan(4);
    // Between the closing ends no step is over half a metre: the staircase is under the rim the scenery draws.
    for (let x = 9; x < 152; x++) {
      expect(Math.abs(LIP[x] - LIP[x - 1]), `at ${x}`).toBeLessThanOrEqual(0.5);
    }
    // Not a ruled line: the lip is back from the straight over a quarter of the rille, in three bights and more.
    expect(LIP.filter(n => n > 0).length).toBeGreaterThan(40);
    expect(LIP.filter((n, x) => n > 0 && !(LIP[x - 1] > 0)).length).toBeGreaterThanOrEqual(3);
    // Nowhere narrower than the 16 m it was, but over the last 8 m of each end, as before: 4 m, then 10 m.
    expect(LIP.every((n, x) => n >= 0 || x < 8 || x > 151)).toBe(true);
    expect([LIP[0], LIP[3], LIP[4], LIP[7], LIP[152], LIP[156], LIP[159]]).toEqual([
      -6, -6, -3, -3, -3, -6, -6,
    ]);
    for (const x of [
      12,
      16,
      20,
      23,
      72,
      76,
      80,
      84,
      87,
      124,
      128,
      132,
      ...MOUNDS.flatMap(m => [m - 12, m, m + 7]),
    ]) {
      expect(LIP[x], `at ${x}`).toBe(0);
    }
    // The brushes and the relief follow it, on both sides.
    for (let x = 0.5; x < 160; x += 1) {
      const z = lip(x);
      for (const [u, solid] of [
        [z + 0.2, true],
        [z - 0.2, false],
      ] as [number, boolean][]) {
        for (const v of [u, ZED - u]) {
          const top = topAt(x, v);
          // Past the lip, the void: but the orange spurs, the bridge and the stones stand in it.
          const crossing = (x > 12 && x < 24) || (x > 74 && x < 86) || (x > 126 && x < 135);
          expect(solid ? top >= 0 : top === -Infinity || crossing, `${x}, ${v}`).toBe(true);
          if (!solid && u > RILLE1) {
            expect(ground(world, x, v)).toBe(-Infinity);
          }
        }
      }
    }
  });

  it('digs a hollow in each field: 2 m under the floor, the slab lowered under it, walked in and out of', () => {
    const [hx, hz, deep] = HOLLOW;
    for (const z of [hz, ZED - hz]) {
      expect(ground(world, hx, z)).toBeCloseTo(-deep, 1);
      // The slab is 3 m down under the square, level round it.
      expect(topAt(hx, z)).toBe(-3);
      expect(topAt(hx + 5, z + 11)).toBe(-3);
      expect(topAt(hx - 13, z)).toBe(0);
      for (const [dx, dz] of [
        [12, 0],
        [-12, 0],
        [0, 12],
        [0, -12],
        [11, 11],
      ]) {
        expect(ground(world, hx + dx, z + dz)).toBeGreaterThanOrEqual(0);
      }
      // Across it on foot: down to the bottom and out, always on the ground.
      const s = Sim.at(world).put(hx, ground(world, hx, z - 14), z - 14, SOUTH);
      let low = 0;
      for (let n = 0; n < 300 && s.p.z < z + 14; n++) {
        s.step(KEY.FORWARD, SOUTH);
        expect(s.p.mode).toBe(MODE.GROUND);
        // On the ground, or on the slab's edge a hair over it.
        expect(Math.abs(s.p.y - ground(world, s.p.x, s.p.z))).toBeLessThan(0.05);
        low = Math.min(low, s.p.y);
      }
      expect(s.p.z).toBeGreaterThan(z + 13);
      expect(low).toBeLessThan(-1.8);
    }
    // No pack, rack, spawn or rover within 4 m of it.
    const things = [
      ...MOON.packs!,
      ...MOON.ammo!,
      ...MOON.cells!,
      ...MOON.rovers!,
      ...teams.flatMap(t => t.spawns),
    ];
    expect(things.some(([x, , z]) => Math.hypot(x - hx, Math.abs(z - 140) + 140 - hz) < 14)).toBe(
      false,
    );
  });

  it('has two mounds a side by the rille, 21 degrees up to the lip, a sill under each lip no higher than the ground', () => {
    expect(MOUNDS).toHaveLength(2);
    for (const x of MOUNDS) {
      expect(Math.abs(x - 80)).toBeGreaterThan(25);
      for (const side of [1, -1]) {
        const g = (zf: number, dx = 0) => ground(world, x + dx, 140 + side * zf);
        expect(g(8)).toBe(MOUND);
        expect(g(16)).toBe(0);
        const angle = (Math.atan((g(8) - g(16)) / 8) * 180) / Math.PI;
        expect(angle).toBeGreaterThan(15);
        expect(angle).toBeLessThan(22);
        // 8 m wide, then 8 m of flank; a flat run-up behind it.
        expect([g(8, 4), g(8, -4), g(8, 11.9) < 0.1, g(8, -11.9) < 0.1]).toEqual([
          MOUND,
          MOUND,
          true,
          true,
        ]);
        for (let zf = 16; zf < 60; zf += 2) {
          expect(g(zf, 3)).toBe(0);
          expect(g(zf, -3)).toBe(0);
        }
      }
    }
    const sills = brushes.filter(b => b.ghost && b.min[1] === 0 && b.max[2] - b.min[2] === 0.5);
    // Seven under the west mound, five under the east one, whose flank stops at the closing end.
    expect(sills).toHaveLength(2 * (7 + 5));
    for (const b of sills) {
      for (const bx of [b.min[0], (b.min[0] + b.max[0]) / 2, b.max[0]]) {
        for (const bz of [b.min[2] + 1e-3, b.max[2] - 1e-3]) {
          // Under the ground, by less than a step where a body would come in.
          const g = ground(world, bx, bz < 140 ? Math.min(bz, RILLE0) : Math.max(bz, RILLE1));
          expect(b.max[1]).toBeLessThanOrEqual(g + 1e-6);
        }
      }
      expect(
        at((b.min[0] + b.max[0]) / 2, b.min[2] < 140 ? RILLE0 : RILLE1) - b.max[1],
      ).toBeLessThan(1);
    }
  });

  /** A rover driven flat out from (x, z0 from the line, on `side`) at the rille: whether it fell, and how far past the line it first came down. */
  const leap = (x: number, zf: number, side: number) => {
    const yaw = side > 0 ? NORTH : SOUTH;
    const r = rover(world, x, 140 + side * zf, yaw);
    let [fell, down, tilt] = [false, 0, 0];
    for (let k = 0; k < 900 && !fell && side * (r.z - 140) > -60; k++) {
      fell = run(r, world, 1, KEY.FORWARD, yaw);
      const past = -side * (r.z - 140);
      tilt = past > 8 ? Math.max(tilt, Math.abs(r.roll), Math.abs(r.pitch)) : tilt;
      down = !down && past > 8 && !flying(r, world) ? past : down;
    }
    return { fell, down, tilt, r };
  };

  it('lets a rover at speed fly the rille off each mound, from either side, and land on its wheels', () => {
    for (const x of MOUNDS) {
      for (const side of [1, -1]) {
        // 50 m of run-up: it lands on the far mound or behind it, upright, and drives on.
        const { fell, down, tilt, r } = leap(x, 58, side);
        expect(fell, `mound ${x}, side ${side}`).toBe(false);
        expect(down).toBeGreaterThan(8);
        expect(tilt).toBeLessThan(0.7);
        expect(Math.abs(r.roll)).toBeLessThan(0.2);
        expect(r.y).toBeLessThan(2);
        // From 20 m it is too slow: it falls in the rille, under the kill floor, to be parked again.
        expect(leap(x, 28, side).fell).toBe(true);
      }
    }
    // And off the flat lip between them, flat out, it falls.
    expect(leap(118, 58, 1).fell).toBe(true);
  });

  /** A sprint at the rille from (x, 172) on red's side, `deg` off north, a jump at the lip, no dash, no second jump: whether he stands on blue's side. */
  const hops = (x: number, deg: number) => {
    const yaw = (deg * Math.PI) / 180;
    const s = Sim.at(world).put(x, Math.max(ground(world, x, 172), 0), 172, yaw);
    const [fx, fz] = [-Math.sin(yaw), -Math.cos(yaw)];
    let t = -1;
    for (let k = 0; k < 600; k++) {
      const [u, v] = [s.p.x + fx * 0.35, s.p.z + fz * 0.35];
      const edge = t < 0 && s.p.ground && ground(world, u, v) === -Infinity && topAt(u, v) < 0;
      t = edge ? k : t;
      s.step(KEY.FORWARD | KEY.SPRINT | (edge ? KEY.JUMP : 0), yaw);
      if (s.ev & EV.RESPAWN) {
        return false;
      }
      if (t >= 0 && k > t + 3 && s.p.ground) {
        return s.p.z < RILLE0 + 0.5;
      }
    }
    return false;
  };

  it('keeps a plain sprint and jump short of the far lip all along the rille, but off a mound and at the closing ends', () => {
    const over: number[] = [];
    for (let x = 2; x < 160; x += 2) {
      if (hops(x, 0)) {
        over.push(x);
      }
    }
    // Straight across: only where the west end closes to 4 m (the east end's boulders are in the way).
    expect(over).toEqual([2]);
    // Off a mound, aslant: from 3 m up he reaches the lower lip beside the far mound. New with the mounds.
    for (const x of MOUNDS) {
      const ways = [-50, -40, -30, -20, -10, 10, 20, 30, 40, 50];
      expect(ways.some(d => hops(x, d) || hops(x + 3, d) || hops(x - 3, d))).toBe(true);
    }
    // Not from the flat lip, at any slant.
    for (const x of [100, 118]) {
      expect([-20, -10, 10, 20].some(d => hops(x, d))).toBe(false);
    }
  });
});

describe('MOON, the rocks', () => {
  const rocks = [...LAYOUT.crags.arena, ...LAYOUT.crags.field];
  /** A rock's drawn form: whether a point is in it, how high it stands over (x, z), and how far it reaches at a height on a bearing. */
  const form = ({ at: [x, g, z], R, H, s }: (typeof rocks)[0]) => {
    const { reach } = rockOf(s, R, H);
    const y0 = g + 0.25 * H;
    const holds = (px: number, py: number, pz: number, slack = 0) => {
      const v = [px - x, py - y0, pz - z];
      const l = Math.hypot(...v);
      return l < 1e-6 || l <= reach(v.map(c => c / l) as [number, number, number]) + slack;
    };
    return { holds };
  };

  it('draws first: each rock is its own form, with one to three lobes, as big as before the shrink, no two alike', () => {
    expect(LAYOUT.crags.arena).toHaveLength(LAYOUT.stones.length + LAYOUT.boulders.length);
    expect(LAYOUT.crags.field).toHaveLength(LAYOUT.rocks.length / 2);
    LAYOUT.boulders.forEach(([x, z, r], i) => {
      const c = LAYOUT.crags.arena[LAYOUT.stones.length + i];
      expect([c.at[0], c.at[2], c.R, c.H]).toEqual([x, z, r, 0.8 * r]);
    });
    const seen = new Set<string>();
    for (const c of rocks) {
      const { reach, tops } = rockOf(c.s, c.R, c.H);
      expect(tops.length).toBe(c.R < 1.3 ? 1 : c.R < 3.2 ? 2 : 3);
      // Its reach on sixteen bearings at the middle's height: 0.45 to 1.4 of its radius, and not a circle.
      const round = Array.from({ length: 16 }, (_, i) =>
        reach([Math.cos((i * Math.PI) / 8), 0, Math.sin((i * Math.PI) / 8)]),
      );
      expect(Math.min(...round)).toBeGreaterThan(0.45 * c.R);
      expect(Math.max(...round)).toBeLessThan(1.4 * c.R);
      expect(Math.max(...round) / Math.min(...round)).toBeGreaterThan(1.12);
      // Its top is as high as it says, within a tenth.
      expect(reach([0, 1, 0])).toBeGreaterThan(0.6 * c.H);
      expect(reach([0, 1, 0])).toBeLessThan(0.85 * c.H);
      seen.add(round.map(v => (v / c.R).toFixed(2)).join());
    }
    expect(seen.size).toBe(rocks.length);
  });

  it('collides inside: one or two boxes a rock, none over 0.1 m out of what is drawn, none wider than the rock at the ground', () => {
    let two = 0;
    for (const c of rocks) {
      const { holds } = form(c);
      expect(c.parts.length).toBeGreaterThanOrEqual(1);
      expect(c.parts.length).toBeLessThanOrEqual(3);
      two += c.parts.length > 1 ? 1 : 0;
      for (const [x0, y0, z0, x1, y1, z1] of c.parts) {
        expect(
          brushes.some(
            b =>
              b.ghost &&
              [x0, y0, z0].every((v, k) => b.min[k] === v) &&
              [x1, y1, z1].every((v, k) => b.max[k] === v),
          ),
        ).toBe(true);
        // Its corners, the middles of its sides and of its faces: from the ground to its top.
        for (const y of [c.at[1] + 0.05, (c.at[1] + y1) / 2, y1]) {
          for (const fx of [0, 0.5, 1]) {
            for (const fz of [0, 0.5, 1]) {
              expect(holds(x0 + fx * (x1 - x0), y, z0 + fz * (z1 - z0), 0.1), `rock ${c.at}`).toBe(
                true,
              );
            }
          }
        }
        expect(Math.min(x1 - x0, z1 - z0)).toBeGreaterThan(0.45);
      }
    }
    // Few have a second one: a shoulder's box seldom fits clear of the main mass without leaving a crack.
    expect(two).toBeGreaterThanOrEqual(2);
  });

  it('stands a body on a top where the rock is drawn: nothing drawn 0.2 m over a box top, which is all there is to stand on', () => {
    let worst = 0;
    for (const c of rocks) {
      const { holds } = form(c);
      for (const q of c.parts) {
        for (const fx of [0.05, 0.3, 0.5, 0.7, 0.95]) {
          for (const fz of [0.05, 0.3, 0.5, 0.7, 0.95]) {
            const [x, z] = [q[0] + fx * (q[3] - q[0]), q[2] + fz * (q[5] - q[2])];
            // Not under the rock's other box, if higher.
            if (
              c.parts.some(
                o => o !== q && o[4] > q[4] && x > o[0] && x < o[3] && z > o[2] && z < o[5],
              )
            ) {
              continue;
            }
            let y = q[4];
            while (holds(x, y + 0.01, z) && y < q[4] + 3) {
              y += 0.01;
            }
            worst = Math.max(worst, y - q[4]);
          }
        }
      }
    }
    expect(worst).toBeLessThan(0.2);
  });

  it('lets a body into the edge of what is drawn: half of the sides within 0.7 m of a box at body height, nine in ten within 1.6 m', () => {
    // The user's tolerance was 0.5 m: one or two boxes inside a leaning rock do not reach it everywhere.
    const gaps: number[] = [];
    for (const c of rocks) {
      const { holds } = form(c);
      const [x, g, z] = c.at;
      for (let i = 0; i < 16; i++) {
        for (const up of [0.3, 0.9, 1.5].filter(v => v < 0.8 * c.H)) {
          const [dx, dz] = [Math.cos((i * Math.PI) / 8), Math.sin((i * Math.PI) / 8)];
          let r = 0;
          while (holds(x + dx * (r + 0.02), g + up, z + dz * (r + 0.02)) && r < 9) {
            r += 0.02;
          }
          const p = [x + dx * r, g + up, z + dz * r];
          gaps.push(
            Math.min(
              ...c.parts.map(q =>
                Math.hypot(
                  Math.max(q[0] - p[0], p[0] - q[3], 0),
                  Math.max(p[1] - q[4], 0),
                  Math.max(q[2] - p[2], p[2] - q[5], 0),
                ),
              ),
            ),
          );
        }
      }
    }
    gaps.sort((a, b) => a - b);
    expect(gaps[Math.floor(gaps.length / 2)]).toBeLessThan(0.7);
    expect(gaps[Math.floor(0.9 * gaps.length)]).toBeLessThan(1.6);
  });
});

describe('MOON, the craters', () => {
  const { bowls } = LAYOUT;
  /** A crater's floor (the lowest of the ground within a quarter of its radius) and its crest all round: the highest ground on each of 24 bearings between 0.8 and 1.3 of the radius, with how far out it is. */
  const survey = ([x, z, r]: number[]) => {
    let floor = Infinity;
    for (let a = -0.25; a <= 0.25; a += 0.05) {
      for (let b = -0.25; b <= 0.25; b += 0.05) {
        floor = Math.min(floor, at(x + a * r, z + b * r));
      }
    }
    const crest = Array.from({ length: 24 }, (_, i) => {
      const [c, s] = [Math.cos((i * Math.PI) / 12), Math.sin((i * Math.PI) / 12)];
      let [top, where] = [-Infinity, 0];
      for (let q = 0.8; q <= 1.3; q += 0.02) {
        const h = at(x + c * q * r, z + s * q * r);
        [top, where] = h > top ? [h, q] : [top, where];
      }
      return [top, where];
    });
    return { floor, crest };
  };

  it('has thirty craters and more, 9 to 46 m in radius, mirrored, some in clusters, none on the arena, a lane or the wall', () => {
    expect(bowls.length).toBeGreaterThanOrEqual(30);
    const radii = bowls.map(b => b[2]).sort((a, b) => a - b);
    expect([radii[0], radii.at(-1)]).toEqual([9, 46]);
    expect(new Set(radii).size).toBeGreaterThanOrEqual(8);
    for (const [x, z, r] of bowls) {
      expect(bowls.some(b => b[0] === x && b[1] === ZED - z && b[2] === r)).toBe(true);
      // Its rim and what it throws out stay 12 m off the arena, and its bowl inside the wall's foot.
      expect(off(x, z)).toBeGreaterThan(12 + r);
      expect(reach(relief, x, z)).toBeLessThan(0.78);
    }
    // Clusters: five pairs and more whose rims overlap (nearer than 1.7 times their radii together).
    let pairs = 0;
    bowls.forEach((a, i) =>
      bowls.slice(0, i).forEach(b => {
        pairs += Math.hypot(a[0] - b[0], a[1] - b[1]) < 1.7 * (a[2] + b[2]) ? 1 : 0;
      }),
    );
    expect(pairs).toBeGreaterThanOrEqual(5);
  });

  const { pits } = LAYOUT;
  const pitOf = ([x, z]: number[]) => pits.find(p => p.x === x && p.z === z);

  it('cuts a pit in three craters: 18 m and more from the crest down to a floor to stand on, walled all round but for the steps', () => {
    expect(pits).toHaveLength(3);
    expect(pits.filter(p => p.z === ZED / 2)).toHaveLength(1);
    for (const p of pits) {
      const b = bowls.find(c => c[0] === p.x && c[1] === p.z)!;
      expect(b[2]).toBeGreaterThanOrEqual(36);
      // The floor: a brush 7 m over the kill floor, no relief over it.
      expect(topAt(p.x + 3, p.z + 5)).toBe(PIT_FLOOR);
      expect(ground(world, p.x + 3, p.z + 5)).toBe(-Infinity);
      expect(PIT_FLOOR).toBeGreaterThanOrEqual(MOON.floor + 7);
      const { crest } = survey(b);
      expect(
        Math.min(...crest.map(c => c[0])) - PIT_FLOOR,
        `pit at ${p.x}, ${p.z}`,
      ).toBeGreaterThan(18);
      // The terrace round it is level, the relief and the brushes' tops at one height.
      for (const [dx, dz] of [
        [PIT_S - 0.5, 0],
        [-PIT_S + 0.5, 3],
        [3, PIT_S - 0.5],
        [0, -PIT_R - 1],
        [PIT_S + 6, 4],
      ]) {
        expect(ground(world, p.x + dx, p.z + dz)).toBeCloseTo(p.level, 5);
      }
      expect(topAt(p.x + PIT_S - 0.5, p.z)).toBeCloseTo(p.level, 9);
      // The wall: on 24 bearings, from the terrace to 12 m and more under it within 1.5 m, over
      // 80 degrees. All but the east, where the steps are.
      let sheer = 0;
      for (let i = 0; i < 24; i++) {
        const [c, s] = [Math.cos((i * Math.PI) / 12), Math.sin((i * Math.PI) / 12)];
        let r = PIT_R + 3;
        while (topAt(p.x + c * r, p.z + s * r) > PIT_FLOOR + 1 && r > 0) {
          r -= 0.25;
        }
        const up = topAt(p.x + c * (r + 1.5), p.z + s * (r + 1.5));
        sheer += up - topAt(p.x + c * r, p.z + s * r) > 12 ? 1 : 0;
      }
      // (In the Bowl the wreck is against the west wall.)
      expect(sheer).toBeGreaterThanOrEqual(19);
      // The void wanders: 7 to 11 m from the middle to the wall, not one width.
      const reach = p.rows.map(r => r[3]);
      expect(Math.max(...reach)).toBeLessThanOrEqual(11);
      expect(new Set(reach).size).toBeGreaterThan(6);
      // The same north and south of the middle.
      p.rows.forEach((r, k) => expect(r.slice(2)).toEqual(p.rows[p.rows.length - 1 - k].slice(2)));
    }
    expect(pits[0].rows.map(r => r[3]).join()).not.toBe(pits[1].rows.map(r => r[3]).join());
  });

  /** A runner on the floor of a pit, heading `yaw` and jumping all he can for `steps`: how high his feet got, and whether he stood on the terrace. */
  const climb = (p: (typeof pits)[0], x: number, z: number, yaw: number, steps: number) => {
    const s = Sim.at(world).put(x, PIT_FLOOR, z, yaw);
    let [high, out] = [PIT_FLOOR, false];
    for (let k = 0; k < steps && !out; k++) {
      s.step(KEY.FORWARD | (k % 3 ? 0 : KEY.JUMP), yaw);
      high = Math.max(high, s.p.y);
      out = s.p.ground && s.p.y > p.level - 0.01 && Math.hypot(s.p.x - p.x, s.p.z - p.z) > PIT_R;
    }
    expect(s.ev & EV.RESPAWN).toBe(0);
    return { high, out };
  };

  it('gives a runner one way out of each pit: up the steps by the east wall, and not up the walls', () => {
    for (const p of pits) {
      // From the west of the floor, east and jumping: up the steps onto the terrace.
      expect(climb(p, p.x - 3, p.z, EAST, 1500).out, `pit at ${p.x}, ${p.z}`).toBe(true);
      // Against the other walls: every jump he has falls 6 m and more short of the terrace.
      for (const [dx, dz, yaw] of [
        [-3, 0, WEST],
        [0, -3, NORTH],
        [0, 3, SOUTH],
        [3, 5, EAST],
      ]) {
        const { high, out } = climb(p, p.x + dx, p.z + dz, yaw, 400);
        expect(out).toBe(false);
        // (In the Bowl he may start from the wreck's hull, 3.5 m up.)
        expect(high).toBeLessThan(p.level - 6);
      }
    }
  });

  it('traps a rover in a pit: it drives in off the terrace, lands on its wheels 13 m down, is not lost, and does not drive out', () => {
    for (const p of pits) {
      const car = rover(world, p.x - PIT_S + 1, p.z + 4, EAST);
      let fell = false;
      for (let k = 0; k < 240 && !fell; k++) {
        fell = run(car, world, 1, KEY.FORWARD, EAST);
      }
      expect(fell, `pit at ${p.x}, ${p.z}`).toBe(false);
      expect(car.y).toBeLessThan(PIT_FLOOR + 2);
      expect(car.y).toBeGreaterThan(PIT_FLOOR);
      // Flat out every way for 20 s: still on the floor.
      for (const yaw of [EAST, WEST, NORTH, SOUTH]) {
        for (let k = 0; k < 300 && !fell; k++) {
          fell = run(car, world, 1, KEY.FORWARD, yaw);
          expect(car.y).toBeLessThan(PIT_FLOOR + 3);
        }
      }
      expect(fell).toBe(false);
      rest(car, world, 120);
      expect(Math.hypot(car.x - p.x, car.z - p.z)).toBeLessThan(PIT_R + 1.5);
      expect(Math.max(Math.abs(car.pitch), Math.abs(car.roll))).toBeLessThan(0.5);
    }
  });

  it('breaks every rim: its height and its distance from the middle wander with the bearing, no perfect ring', () => {
    for (const b of bowls) {
      const { crest } = survey(b);
      const tops = crest.map(c => c[0]);
      const outs = crest.map(c => c[1]);
      expect(Math.max(...tops) - Math.min(...tops), `crater at ${b[0]}, ${b[1]}`).toBeGreaterThan(
        0.02 * b[2],
      );
      expect(Math.max(...outs) - Math.min(...outs)).toBeGreaterThanOrEqual(0.06);
    }
  });

  it('traps nobody elsewhere: a runner walks out of every other crater from its middle, a rover drives out', () => {
    for (const [x, z, r] of bowls.filter(b => !pitOf(b))) {
      for (const yaw of [EAST, NORTH]) {
        const s = Sim.at(world).put(x, ground(world, x, z), z, yaw);
        s.run(Math.ceil((1.5 * r) / RUN_SPEED) * TICK_HZ, KEY.FORWARD, yaw);
        expect(Math.hypot(s.p.x - x, s.p.z - z), `on foot from ${x}, ${z}`).toBeGreaterThan(
          1.2 * r,
        );
        expect(s.ev & EV.RESPAWN).toBe(0);
        expect(s.low).toBeGreaterThan(MOON.floor + 5);
      }
      const car = rover(world, x, z, EAST);
      let fell = false;
      for (let k = 0; k < 900 && !fell && Math.hypot(car.x - x, car.z - z) < 1.3 * r; k++) {
        fell = run(car, world, 1, KEY.FORWARD, EAST);
      }
      expect(fell, `a rover from ${x}, ${z}`).toBe(false);
      expect(Math.hypot(car.x - x, car.z - z)).toBeGreaterThanOrEqual(1.3 * r);
    }
  });
});
