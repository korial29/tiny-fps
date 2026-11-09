import { describe, expect, it } from 'vitest';
import { problems } from '../../test/pickups';
import { EAST, NORTH, Sim, WEST, toward } from '../../test/pilot';
import { palette, MAX_TINTS } from '../client/render';
import {
  DASH_SPEED,
  FLAG_H,
  FLAG_REACH,
  GRAVITY,
  JUMP_SPEED,
  PLAYER_H,
  PLAYER_R,
  RUN_SPEED,
  SPRINT_SPEED,
  STEP_H,
  TICK_HZ,
} from './constants';
import { TEAM_TINT } from './map';
import { LAYOUT, MOON, WEST_GAP, ZED } from './moon';
import { move, spawn } from './physics';
import { KEY, TEX } from './types';
import { build } from './world';
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
    expect(MOON.floor).toBe(-20);
  });

  it('has brushes with min below max, known textures and tints, under 250 of them', () => {
    expect(brushes.length).toBeGreaterThan(60);
    expect(brushes.length).toBeLessThan(250);
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
    expect(stone).toBeGreaterThan(brushes.length * 0.1);
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
    // Health 3, ammo 3, rail cells 2 in a half, and by the rille two of each pack and one cell.
    const half = (l: number[][]) => l.filter(p => p[2] > ZED / 2);
    expect(half(MOON.packs!)).toHaveLength(4);
    expect(half(MOON.ammo!)).toHaveLength(4);
    expect(half(MOON.cells!)).toHaveLength(2);
    expect(MOON.cells).toHaveLength(5);
    const rille = (l: number[][]) => l.filter(p => Math.abs(p[2] - ZED / 2) < 20);
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

  it('stands each flag on a red or blue pad ahead of its dome, the ring and the pole clear', () => {
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
      // The dome is behind it, 30 m from the pad's centre to the dome's centre.
      expect(Math.abs(z - (team ? ZED - 236 : 236))).toBeCloseTo(31, 6);
    }
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

describe('MOON, the dome and the layout the scenery follows', () => {
  const ghosts = brushes.filter(b => b.ghost);
  const shell = (y: number) => (y < 5 ? 22.4 : 22.4 * Math.sqrt(1 - ((y - 5) / 12) ** 2));

  it('has ghost bands over the domes, 4 bands of 4 stepped boxes each, the first up to 10.5 m, and the rim', () => {
    expect(ghosts).toHaveLength(36);
    expect(ghosts.filter(b => b.max[1] === 14)).toHaveLength(4);
    for (const [cz, sign] of [
      [236, 1],
      [44, -1],
    ]) {
      const mine = ghosts.filter(b => Math.abs((b.min[2] + b.max[2]) / 2 - cz) < 1e-6);
      expect(mine).toHaveLength(16);
      expect(Math.max(...mine.map(b => b.max[1]))).toBe(17);
      expect(Math.min(...mine.filter(b => b.min[1] === 0).map(b => b.max[1]))).toBe(10.5);
      expect(sign * (cz - 140)).toBeGreaterThan(0);
    }
    // Higher than a double jump from a module roof: 5 + apex + the second jump's rise, with a margin.
    expect(10.5).toBeGreaterThan(5 + APEX + 6 ** 2 / (2 * HALF) + 0.5);
  });

  it('covers the drawn shell from outside: every point of its surface is inside a band', () => {
    for (const [cx, cz] of LAYOUT.domes) {
      for (let y = 0.1; y < 17; y += 0.4) {
        for (let deg = 0; deg < 360; deg += 1) {
          const r = shell(y) - 0.01;
          const [x, z] = [
            cx + r * Math.cos((deg * Math.PI) / 180),
            cz + r * Math.sin((deg * Math.PI) / 180),
          ];
          expect(
            ghosts.some(
              b =>
                b.min[0] <= x &&
                x <= b.max[0] &&
                b.min[2] <= z &&
                z <= b.max[2] &&
                b.min[1] <= y &&
                y <= b.max[1],
            ),
            `${x.toFixed(2)}, ${y.toFixed(1)}, ${z.toFixed(2)}`,
          ).toBe(true);
        }
      }
    }
  });

  it('lays out what the scenery draws on its boxes: both halves, the blue one mirrored', () => {
    const { domes, pads, shuttles, modules, tubes, masts } = LAYOUT;
    expect([
      domes.length,
      pads.length,
      shuttles.length,
      modules.length,
      tubes.length,
      masts.length,
    ]).toEqual([2, 2, 2, 4, 4, 12]);
    expect(domes[1]).toEqual([80, ZED - 236]);
    expect(pads[1]).toEqual([40, ZED - 220, 13]);
    const has = (b: { min: number[]; max: number[] }) =>
      brushes.some(c => [0, 1, 2].every(k => c.min[k] === b.min[k] && c.max[k] === b.max[k]));
    for (const b of [...shuttles, ...modules, ...tubes]) {
      expect(has(b)).toBe(true);
    }
    for (const [x, z] of masts) {
      expect(
        brushes.some(
          b => b.min[0] < x && x < b.max[0] && b.min[2] < z && z < b.max[2] && b.max[1] >= 10,
        ),
      ).toBe(true);
    }
    // Each tube reaches the module it joins (the first its west face, the second its north face).
    expect(tubes[0].max[0]).toBe(modules[0].min[0]);
    expect(tubes[1].min[2]).toBe(modules[1].max[2]);
    expect(tubes[0].min[2]).toBeGreaterThanOrEqual(modules[0].min[2]);
    expect(tubes[1].min[0]).toBeGreaterThanOrEqual(modules[1].min[0]);
    // And each touches the dome's ghost shell, a metre or so short of the drawn one.
    for (const t of tubes.slice(0, 2)) {
      const [cx, cz] = domes[0];
      const touching = ghosts.some(
        g =>
          g.min[1] === 0 &&
          Math.abs(cz - (g.min[2] + g.max[2]) / 2) < 30 &&
          [0, 2].some(
            a =>
              Math.abs(t.min[a] - g.max[a]) < 1e-6 ||
              Math.abs(t.max[a] - g.min[a]) < 1e-6 ||
              Math.abs(t.min[a] - g.min[a]) < 1e-6 ||
              Math.abs(t.max[a] - g.max[a]) < 1e-6,
          ) &&
          t.min[0] <= g.max[0] + 1e-6 &&
          t.max[0] >= g.min[0] - 1e-6 &&
          t.min[2] <= g.max[2] + 1e-6 &&
          t.max[2] >= g.min[2] - 1e-6,
      );
      expect(touching, `tube at ${t.min}`).toBe(true);
      expect(cx).toBe(80);
    }
  });

  it('has a rim of one band, 14 m, all round: more than a double jump reaches', () => {
    for (const [x, z] of [
      [-5, 100],
      [165, 100],
      [80, -5],
      [80, 285],
    ]) {
      expect(topAt(x, z)).toBe(14);
    }
    expect(14).toBeGreaterThan(5 + APEX + 6 ** 2 / (2 * HALF));
  });
});

describe('MOON, the rille', () => {
  it('is open to the kill floor from x 0 to 160, but at its three crossings', () => {
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
          expect(bridge || stones, `solid at ${x}, ${z}`).toBe(true);
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

  it('cannot be stood on or in at the domes: a double jump from a module roof stays under the first band', () => {
    const m = Sim.at(world).put(118, 5, 226, WEST);
    let high = 0;
    m.step(KEY.JUMP, WEST);
    m.until(p => p.vy <= 0, 0, WEST, 100);
    m.step(0, WEST);
    for (let k = 0; k < 100; k++) {
      m.step(k === 0 ? KEY.JUMP : 0, WEST);
      high = Math.max(high, m.p.y);
    }
    expect(high).toBeLessThan(10.5);
    expect(high).toBeGreaterThan(9);
  });

  it('climbs onto the tube tops by the ramps, then jumps up to the module roofs', () => {
    const s = Sim.at(world).put(107, 0, 211, NORTH);
    expect(s.goTo(107, 226, { r: 0.3 })).toBeGreaterThan(0);
    expect(s.p.y).toBeCloseTo(3.5, 2);
    // And the other way: from the tube top up to the first module's roof, 1.5 m.
    const m = Sim.at(world).put(107, 3.5, 226, EAST);
    expect(flyTo(m, [118, 5, 226])).toBeGreaterThanOrEqual(0);
    // The second tube: its ramp from the east, then the second module.
    const t = Sim.at(world).put(109, 0, 208, WEST);
    expect(t.goTo(100, 208, { r: 0.3 })).toBeGreaterThan(0);
    expect(t.p.y).toBeCloseTo(3.5, 2);
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
