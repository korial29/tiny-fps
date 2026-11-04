import { describe, expect, it } from 'vitest';
import {
  FLYER_H,
  FLYER_HOVER,
  GRAVITY,
  JUMP_SPEED,
  MAX_MONSTERS,
  PLAYER_H,
  PLAYER_R,
  STEP_H,
  WALKER_H,
} from './constants';
import { compile, sectorAt } from './level';
import { LEVELS } from './levels';
import { walk } from './physics';
import { ITEM, MONSTER, TEX } from './types';
import type { Level, MapDef, Sector } from './types';

type Pt = [number, number];

/** What the campaign promises per level: monsters, health packs, keys. */
const PLAN = [
  { monsters: 6, keys: [] },
  { monsters: 9, keys: [ITEM.KEY_RED] },
  { monsters: 12, keys: [ITEM.KEY_RED, ITEM.KEY_BLUE] },
  { monsters: 16, keys: [ITEM.KEY_RED, ITEM.KEY_BLUE, ITEM.KEY_YELLOW] },
  { monsters: 20, keys: [ITEM.KEY_RED, ITEM.KEY_BLUE, ITEM.KEY_YELLOW] },
];

/** Highest rise a jump clears, from the launch speed: v² / 2g = 1.225 m. */
const JUMP_RISE = JUMP_SPEED ** 2 / (2 * GRAVITY) - 0.025;
/** Wall clearance for anything placed in a level. */
const CLEAR = PLAYER_R + 0.1;
/** A doorway must pass a player with room to spare. */
const MIN_DOOR = 1.2;
/** Headroom a flyer needs: hover, its body, and some air. */
const FLYER_ROOM = FLYER_HOVER + FLYER_H + 0.9;

const area = (pts: Pt[]): number =>
  pts.reduce((a, [x, z], i) => {
    const [u, v] = pts[(i + 1) % pts.length];
    return a + x * v - u * z;
  }, 0);

const edgesOf = (s: Sector): [Pt, Pt][] => s.pts.map((p, i) => [p, s.pts[(i + 1) % s.pts.length]]);

/** Strictly inside the open segment ab, on its line. */
const onSegment = ([ax, az]: Pt, [bx, bz]: Pt, [px, pz]: Pt): boolean => {
  const dot = (px - ax) * (bx - ax) + (pz - az) * (bz - az);
  return (
    (bx - ax) * (pz - az) === (bz - az) * (px - ax) &&
    dot > 0 &&
    dot < (bx - ax) ** 2 + (bz - az) ** 2
  );
};

/** Distance from p to the segment ab. */
const dist = ([px, pz]: Pt, [ax, az]: Pt, [bx, bz]: Pt): number => {
  const [ex, ez] = [bx - ax, bz - az];
  const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / (ex * ex + ez * ez)));
  return Math.hypot(px - ax - t * ex, pz - az - t * ez);
};

/** Length of the stretch two collinear segments share. */
const overlapLength = ([ax, az]: Pt, [bx, bz]: Pt, [cx, cz]: Pt, [dx, dz]: Pt): number => {
  const [ex, ez] = [bx - ax, bz - az];
  const len = Math.hypot(ex, ez);
  const at = (x: number, z: number) => ((x - ax) * ex + (z - az) * ez) / len;
  const [u, v] = [at(cx, cz), at(dx, dz)].sort((p, q) => p - q);
  return Math.max(0, Math.min(len, v) - Math.max(0, u));
};

/** Whether two convex polygons share interior area: no separating edge normal. */
const overlap = (a: Pt[], b: Pt[]): boolean => {
  const apart = (p: Pt[], q: Pt[]) =>
    p.some(([ax, az], i) => {
      const [bx, bz] = p[(i + 1) % p.length];
      // Outward normal of a counter-clockwise edge; q is apart when all of it is outside.
      return q.every(([x, z]) => (bx - ax) * (z - az) - (bz - az) * (x - ax) <= 1e-9);
    });
  return !apart(a, b) && !apart(b, a);
};

/** Edge length shared by two sectors, over all their portal pieces. */
const doorway = (lvl: Level, a: number, b: number): number =>
  lvl.edges
    .filter(e => e.front === a && e.back === b)
    .reduce((n, e) => n + Math.hypot(e.bx - e.ax, e.bz - e.az), 0);

/** Walking or jumping from sector a into sector b (any drop is fine). */
const passable = (lvl: Level, a: number, b: number, rise: number): boolean => {
  const [s, t] = [lvl.map.sectors[a], lvl.map.sectors[b]];
  return (
    t.floor - s.floor <= rise &&
    Math.min(s.ceil, t.ceil) - Math.max(s.floor, t.floor) >= PLAYER_H &&
    doorway(lvl, a, b) >= MIN_DOOR
  );
};

interface Search {
  /** Every (sector, keys, returning) state a team can reach from the start. */
  seen: Set<number>;
  /** States from which the level can still be won. */
  alive: Set<number>;
  /** Keys the team can hold at most. */
  keys: number;
}

/**
 * Plays the level abstractly. A state is the sector of the team, the keys it holds and whether the
 * goal was touched; stepping into a sector takes its keys and the goal. A gate opens with its key,
 * the exit only after the goal. `shut` lists gates that stay barred whatever the keys (to prove a
 * gate matters).
 */
const search = (lvl: Level, rise: number, shut: number[] = []): Search => {
  const { map } = lvl;
  const n = map.sectors.length;
  const exit = map.exit ?? 0;
  const goal = sectorAt(lvl, ...(map.goal as Pt));
  const gate = new Map((map.gates ?? []).map(g => [g.sector, g.key]));
  const keyAt = new Map<number, number>();
  for (const [x, z, kind] of map.items ?? []) {
    if (kind) {
      const s = sectorAt(lvl, x, z);
      keyAt.set(s, (keyAt.get(s) ?? 0) | (1 << kind));
    }
  }
  const id = (s: number, keys: number, back: number) => (s * 16 + keys) * 2 + back;
  const next = (s: number, keys: number, back: number): [number, number, number][] =>
    [...Array(n).keys()]
      .filter(t => passable(lvl, s, t, rise))
      .filter(t => {
        const k = gate.get(t);
        return (k === undefined || (keys & (1 << k) && !shut.includes(t))) && (t !== exit || back);
      })
      .map(t => [t, keys | (keyAt.get(t) ?? 0), back | (t === goal ? 1 : 0)]);

  const start: [number, number, number] = [exit, keyAt.get(exit) ?? 0, 0];
  const seen = new Set([id(...start)]);
  const edges = new Map<number, number[]>();
  for (const queue = [start]; queue.length;) {
    const [s, keys, back] = queue.pop() as [number, number, number];
    const out = next(s, keys, back).map(t => {
      if (!seen.has(id(...t))) {
        seen.add(id(...t));
        queue.push(t);
      }
      return id(...t);
    });
    edges.set(id(s, keys, back), out);
  }
  // Backwards from the win: in the exit with the goal touched.
  const alive = new Set([...seen].filter(v => Math.floor(v / 32) === exit && v % 2 === 1));
  for (let grown = true; grown;) {
    grown = false;
    for (const [from, to] of edges) {
      if (!alive.has(from) && to.some(t => alive.has(t))) {
        alive.add(from);
        grown = true;
      }
    }
  }
  const keys = [...seen].reduce((m, v) => m | (Math.floor(v / 2) % 16), 0);
  return { seen, alive, keys };
};

const sectorsSeen = (found: Search): Set<number> =>
  new Set([...found.seen].map(v => Math.floor(v / 32)));

const wallDistance = (lvl: Level, s: number, p: Pt): number =>
  Math.min(
    ...lvl.edges
      .filter(e => e.front === s && e.back < 0)
      .map(e => dist(p, [e.ax, e.az], [e.bx, e.bz])),
  );

describe('the campaign', () => {
  it('has five levels', () => {
    expect(LEVELS).toHaveLength(5);
  });
});

describe.each(LEVELS.map((map, i) => [i + 1, map] as [number, MapDef]))('level %i', (n, map) => {
  const lvl = compile(map);
  const plan = PLAN[n - 1];
  const exit = map.exit ?? 0;
  const gates = map.gates ?? [];
  const monsters = map.monsters ?? [];
  const items = map.items ?? [];

  it('has convex counter-clockwise sectors, ceilings above floors, light in range', () => {
    for (const s of map.sectors) {
      expect(area(s.pts)).toBeGreaterThan(0);
      expect(s.ceil).toBeGreaterThan(s.floor);
      expect(s.light ?? 1).toBeGreaterThan(0);
      expect(s.light ?? 1).toBeLessThanOrEqual(1);
      for (const [a, b] of edgesOf(s)) {
        expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeGreaterThan(0);
      }
      for (const [a, b] of edgesOf(s)) {
        for (const p of s.pts) {
          expect(
            (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]),
          ).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('uses valid textures, at least three materials and one of the new ones', () => {
    const valid = new Set<number>(Object.values(TEX));
    const used = new Set(map.sectors.flatMap(s => [s.ft, s.wt, s.ct]));
    for (const id of used) {
      expect(valid.has(id)).toBe(true);
    }
    expect(used.size).toBeGreaterThanOrEqual(3);
    expect([TEX.METAL, TEX.WOOD, TEX.MOSS, TEX.GRATE].some(id => used.has(id))).toBe(true);
  });

  it('matches every portal edge exactly, with no T-junction', () => {
    const { sectors } = map;
    sectors.forEach((s, i) => {
      for (const [a, b] of edgesOf(s)) {
        for (const [j, t] of sectors.entries()) {
          if (i === j) {
            continue;
          }
          // No corner of another sector strictly inside this edge.
          for (const p of t.pts) {
            expect(onSegment(a, b, p), `sector ${j} corner ${p} on an edge of ${i}`).toBe(false);
          }
          // An edge facing this one on the same line is its exact twin.
          for (const [c, d] of edgesOf(t)) {
            const facing = (b[0] - a[0]) * (d[0] - c[0]) + (b[1] - a[1]) * (d[1] - c[1]) < 0;
            const line = dist(c, a, b) === 0 || dist(a, c, d) === 0;
            if (facing && line && overlapLength(a, b, c, d) > 1e-9) {
              expect([a, b], `edges of ${i} and ${j}`).toEqual([d, c]);
            }
          }
        }
      }
    });
    // Every portal the compile found has its twin.
    for (const e of lvl.edges.filter(e => e.back >= 0)) {
      expect(lvl.edges.some(f => f.front === e.back && f.back === e.front)).toBe(true);
    }
  });

  it('has no overlapping sectors', () => {
    const { sectors } = map;
    sectors.forEach((s, i) => {
      for (let j = i + 1; j < sectors.length; j++) {
        expect(overlap(s.pts, sectors[j].pts), `sectors ${i} and ${j}`).toBe(false);
      }
    });
  });

  it('puts spawns, monsters, items and the goal clear of the walls', () => {
    const spots: [string, Pt][] = [
      ...map.spawns.map((p, i): [string, Pt] => [`spawn ${i}`, [p[0], p[1]]]),
      ...monsters.map((m, i): [string, Pt] => [`monster ${i}`, [m[0], m[1]]]),
      ...items.map((m, i): [string, Pt] => [`item ${i}`, [m[0], m[1]]]),
      ['goal', map.goal as Pt],
    ];
    for (const [name, p] of spots) {
      const s = sectorAt(lvl, ...p);
      expect(s, name).toBeGreaterThanOrEqual(0);
      expect(wallDistance(lvl, s, p), name).toBeGreaterThanOrEqual(CLEAR);
    }
  });

  it('spawns at least 8 players 2 m apart in the exit room, facing out', () => {
    expect(map.spawns.length).toBeGreaterThanOrEqual(8);
    expect(map.exit ?? 0).toBe(exit);
    for (const [i, [x, z, yaw]] of map.spawns.entries()) {
      expect(sectorAt(lvl, x, z)).toBe(exit);
      for (const [u, v] of map.spawns.slice(i + 1)) {
        expect(Math.hypot(u - x, v - z)).toBeGreaterThanOrEqual(2);
      }
      // The way out: the middle of the nearest doorway of the start room to the goal side.
      const doors = lvl.edges.filter(e => e.front === exit && e.back >= 0);
      expect(doors.length).toBeGreaterThan(0);
      const [fx, fz] = [-Math.sin(yaw), -Math.cos(yaw)];
      const out = doors.some(e => {
        const [dx, dz] = [(e.ax + e.bx) / 2 - x, (e.az + e.bz) / 2 - z];
        return (fx * dx + fz * dz) / Math.hypot(dx, dz) > 0.1;
      });
      expect(out, `spawn ${i} faces a door`).toBe(true);
    }
  });

  it('keeps the monsters away from the start', () => {
    expect(monsters).toHaveLength(plan.monsters);
    expect(monsters.length).toBeLessThanOrEqual(MAX_MONSTERS);
    for (const [i, [x, z, , kind]] of monsters.entries()) {
      const s = sectorAt(lvl, x, z);
      const sec = map.sectors[s];
      expect(s, `monster ${i}`).not.toBe(exit);
      expect(
        gates.some(g => g.sector === s),
        `monster ${i} in a gate`,
      ).toBe(false);
      for (const [u, v] of map.spawns) {
        expect(Math.hypot(u - x, v - z), `monster ${i}`).toBeGreaterThanOrEqual(8);
      }
      if (kind === MONSTER.FLYER) {
        expect(sec.ceil - sec.floor, `flyer ${i} headroom`).toBeGreaterThanOrEqual(FLYER_ROOM);
      } else {
        expect(sec.ceil - sec.floor, `walker ${i} headroom`).toBeGreaterThanOrEqual(WALKER_H + 0.2);
      }
    }
    expect(monsters.some(m => m[3] === MONSTER.WALKER)).toBe(true);
    expect(monsters.some(m => m[3] === MONSTER.FLYER)).toBe(true);
  });

  it('has a few health packs, a key per gate, ids that fit', () => {
    expect(items.length).toBeLessThanOrEqual(255);
    expect(items.filter(i => i[2] === ITEM.HEALTH).length).toBeGreaterThanOrEqual(3);
    expect(gates.map(g => g.key).sort()).toEqual([...plan.keys].sort());
    expect(
      items
        .filter(i => i[2] > 0)
        .map(i => i[2])
        .sort(),
    ).toEqual([...plan.keys].sort());
    for (const g of gates) {
      expect(lvl.edges.filter(e => e.front === g.sector && e.back >= 0)).toHaveLength(2);
    }
    for (const [x, z] of items) {
      expect(gates.some(g => g.sector === sectorAt(lvl, x, z))).toBe(false);
    }
  });

  it('puts the goal far from the start', () => {
    const [x, z] = map.goal as Pt;
    expect(sectorAt(lvl, x, z)).not.toBe(exit);
    const [sx, sz] = map.spawns[0];
    expect(Math.hypot(x - sx, z - sz)).toBeGreaterThanOrEqual(30);
  });

  describe.each([
    ['on foot', STEP_H],
    ['with jumps', JUMP_RISE],
  ])('played %s', (_, rise) => {
    it('can be won: keys before gates, the goal, then back to the exit, with no trap', () => {
      const found = search(lvl, rise);
      const goal = sectorAt(lvl, ...(map.goal as Pt));
      const reached = sectorsSeen(found);
      expect(reached.has(goal)).toBe(true);
      // Back in the exit after the goal.
      expect([...found.seen].some(v => Math.floor(v / 32) === exit && v % 2 === 1)).toBe(true);
      // Nothing the team can reach is a dead end: every state can still finish.
      const stuck = [...found.seen].filter(v => !found.alive.has(v)).map(v => Math.floor(v / 32));
      expect([...new Set(stuck)], 'sectors that trap the team').toEqual([]);
      // Every sector holding something is reachable.
      for (const [x, z] of [...monsters, ...items]) {
        expect(reached.has(sectorAt(lvl, x, z)), `${x},${z} unreachable`).toBe(true);
      }
      // Every key is found, and each gate is on the way: the goal is out of reach without it.
      expect(found.keys >> 1).toBe(plan.keys.reduce((m, k) => m | (1 << (k - 1)), 0));
      for (const g of gates) {
        const without = sectorsSeen(search(lvl, rise, [g.sector]));
        expect(without.has(goal), `gate ${g.sector} is optional`).toBe(false);
      }
    });
  });

  it('lets the real physics walk through every doorway the search crosses on foot', () => {
    // Gates and the exit are the search's business: here every doorway is open.
    lvl.barred.clear();
    let checked = 0;
    for (const e of lvl.edges) {
      if (e.back < 0 || !passable(lvl, e.front, e.back, STEP_H)) {
        continue;
      }
      // From half a metre inside the sector, straight at the middle of the edge.
      const [ex, ez] = [e.bx - e.ax, e.bz - e.az];
      const len = Math.hypot(ex, ez);
      const [nx, nz] = [ez / len, -ex / len];
      const [mx, mz] = [(e.ax + e.bx) / 2, (e.az + e.bz) / 2];
      const p = { x: mx - nx * 0.5, y: 0, z: mz - nz * 0.5, vy: 0, ground: true };
      if (
        sectorAt(lvl, p.x, p.z) !== e.front ||
        wallDistance(lvl, e.front, [p.x, p.z]) < PLAYER_R
      ) {
        continue;
      }
      p.y = map.sectors[e.front].floor;
      const seen = new Set<number>();
      for (let i = 0; i < 60; i++) {
        walk(p, nx * 0.1, nz * 0.1, false, lvl);
        seen.add(sectorAt(lvl, p.x, p.z));
      }
      const door = `${e.front} to ${e.back} at ${mx},${mz}`;
      expect(seen.has(e.back), door).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(map.sectors.length);
  });
});
