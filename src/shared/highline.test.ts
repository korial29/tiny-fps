import { describe, expect, it } from 'vitest';
import { EAST, NORTH, Sim, toward } from '../../test/pilot';
import { problems } from '../../test/pickups';
import { HIGH, LOW, MID, UP, above, fly, go, leap, plain, trip } from '../../test/routes';
import type { Leg, Route } from '../../test/routes';
import { palette, MAX_TINTS } from '../client/render';
import { FLAG_H, FLAG_REACH, MAX_PITCH, PLAYER_H, PLAYER_R, RACK_R, SNAP_EVERY } from './constants';
import { touches } from './ctf';
import { within } from './gun';
import { HIGHLINE, TEAM_TINT } from './map';
import { move, spawn } from './physics';
import { decodeSnapshot, encodeInput } from './protocol';
import { Room } from './room';
import { EV, FLAG, KEY, MODE, TEAM, TEX } from './types';
import type { Conn, PlayerState, Snapshot } from './types';
import { build } from './world';
import type { Brush } from './world';

const world = build(HIGHLINE);
const { brushes, teams } = HIGHLINE;
/** The map is 240 m long and its two halves are mirror images across z = 120. */
const ZED = 240;
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
/** A red accent has a blue twin: the two are the team tints, every other tint is its own twin. */
const tinted = (a: Brush, b: Brush) =>
  a.tint === b.tint ||
  (a.tint === TEAM_TINT[0] && b.tint === TEAM_TINT[1]) ||
  (a.tint === TEAM_TINT[1] && b.tint === TEAM_TINT[0]);

/** Whether the brush meets the open box of the standing cylinder at (x, z) from y to y + h. */
const meets = (b: Brush, x: number, y: number, z: number, h: number) =>
  b.min[0] < x + PLAYER_R &&
  b.max[0] > x - PLAYER_R &&
  b.min[2] < z + PLAYER_R &&
  b.max[2] > z - PLAYER_R &&
  b.min[1] < y + h &&
  b.max[1] > y + 1e-6;

/** The heights under the first gap of the Spine: the terrace, then its three ledges (float32, as a player's feet are). */
const UNDER = [19, 21.2, 23.4, 25].map(Math.fround);

/** A sim at a spawn of a team. */
const at = (team: number, n: number) => new Sim(spawn(0, world, n, team), world);

describe('HIGHLINE', () => {
  it('is named for the title screen and is what a room plays unless it is given another map', () => {
    expect(HIGHLINE.name).toBe('Highline');
    const room = new Room();
    const c: Conn & { bins: ArrayBuffer[] } = {
      bins: [],
      send: d => typeof d !== 'string' && c.bins.push(d),
    };
    room.connect(c);
    room.receive(c, JSON.stringify({ t: 'join', name: 'a' }));
    for (let k = 0; k < SNAP_EVERY; k++) {
      room.tick();
    }
    const [x, y, z] = teams[0].spawns[0];
    expect(decodeSnapshot(c.bins.at(-1)!)!.players[0]).toMatchObject({ x, y, z, ground: true });
  });

  it('has brushes with min below max, known textures and tints, and as few as it can', () => {
    expect(brushes.length).toBeGreaterThan(100);
    expect(brushes.length).toBeLessThan(260);
    const tex: number[] = Object.values(TEX);
    for (const [i, b] of brushes.entries()) {
      for (let a = 0; a < 3; a++) {
        expect(b.min[a], `brush ${i}, axis ${a}`).toBeLessThan(b.max[a]);
      }
      expect(tex).toContain(b.top);
      expect(tex).toContain(b.side);
      expect(b.tint?.every(c => c >= 0 && c <= 1) ?? true).toBe(true);
    }
    // The shader's palette holds MAX_TINTS tints: a map with more would lose the last ones.
    expect(palette(world).length).toBeLessThanOrEqual(MAX_TINTS);
  });

  it('is concrete, glass and steel with the team colours near each base and accents in the middle', () => {
    const count = (id: number) => brushes.filter(b => b.top == id || b.side == id).length;
    expect(brushes.filter(b => b.top == TEX.CONCRETE).length).toBeGreaterThan(brushes.length * 0.4);
    expect(count(TEX.GLASS)).toBeGreaterThanOrEqual(8);
    expect(count(TEX.STEEL)).toBeGreaterThanOrEqual(20);
    expect(count(TEX.BRICK) + count(TEX.WOOD)).toBe(0);
    // Red accents stand on red's half, blue ones on blue's, and none in the middle 30 m.
    const red = brushes.filter(b => b.tint === TEAM_TINT[0]);
    const blue = brushes.filter(b => b.tint === TEAM_TINT[1]);
    expect(red.length).toBeGreaterThanOrEqual(6);
    expect(red.length).toBe(blue.length);
    expect(red.every(b => b.min[2] > ZED / 2 + 15)).toBe(true);
    expect(blue.every(b => b.max[2] < ZED / 2 - 15)).toBe(true);
    // Neutral accents are saturated and sit in the middle as well as at the sides.
    const neutral = brushes.filter(b => b.tint && !red.includes(b) && !blue.includes(b));
    expect(neutral.length).toBeGreaterThanOrEqual(6);
    for (const { tint } of neutral) {
      expect(Math.max(...tint!) - Math.min(...tint!)).toBeGreaterThan(0.5);
    }
    expect(neutral.some(b => Math.abs((b.min[2] + b.max[2]) / 2 - ZED / 2) < 15)).toBe(true);
  });

  it('keeps brushes out of each other: touching is fine, overlapping is not', () => {
    for (const [i, a] of brushes.entries()) {
      for (const [j, b] of brushes.entries()) {
        const overlap = [0, 1, 2].every(
          k => a.min[k] < b.max[k] - 1e-9 && b.min[k] < a.max[k] - 1e-9,
        );
        expect(i === j || !overlap, `brushes ${i} and ${j}`).toBe(true);
      }
    }
  });

  it('leaves no crack a player could stand in and not get out of: open slots are touching or wider than a body', () => {
    // Two brushes side by side on x or z, overlapping on the other horizontal axis and in height by
    // more than a step, with less than a body's width of nothing between them.
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
          // The slot between them: another brush standing in it (the next step of a stair) fills it.
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

describe('HIGHLINE, symmetry', () => {
  it('has a mirror twin for every brush, across the line z = 120', () => {
    for (const [i, b] of brushes.entries()) {
      const t = twin(b);
      expect(
        brushes.some(c => same(c, t) && tinted(b, c)),
        `brush ${i} at ${b.min} to ${b.max}`,
      ).toBe(true);
    }
    expect(Math.min(...brushes.map(b => b.min[2]))).toBe(0);
    expect(Math.max(...brushes.map(b => b.max[2]))).toBe(ZED);
  });

  it('mirrors the bases and the spawns, the blue ones facing back', () => {
    const [red, blue] = teams;
    expect(blue.base).toEqual([red.base[0], red.base[1], ZED - red.base[2]]);
    const mirrored = red.spawns.map(([x, y, z, yaw]) => [x, y, ZED - z, yaw + Math.PI]);
    const key = (s: number[]) => s.map(v => Math.round(v * 1e6)).join();
    expect(new Set(blue.spawns.map(s => key(s))).size).toBe(blue.spawns.length);
    expect(blue.spawns.map(s => key(s)).sort()).toEqual(mirrored.map(s => key(s)).sort());
    // Red looks north, to the far end.
    expect(red.spawns.every(s => s[3] === 0)).toBe(true);
    expect(Math.hypot(red.base[0] - blue.base[0], red.base[2] - blue.base[2])).toBeGreaterThan(200);
  });
});

describe('HIGHLINE, bases and spawns', () => {
  it('has eight spawns a side, each on a top with room for a body, apart from the others, standing still', () => {
    for (const [team, { spawns }] of teams.entries()) {
      expect(spawns).toHaveLength(8);
      for (const [n, [x, y, z]] of spawns.entries()) {
        const under = brushes.filter(
          b => b.min[0] < x && x < b.max[0] && b.min[2] < z && z < b.max[2],
        );
        expect(
          under.some(b => b.max[1] === y),
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

  it('stands each flag on its tower, with its ring and pole clear and its team spawning around it', () => {
    for (const [
      team,
      {
        base: [x, y, z],
        spawns,
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
      expect(top, `team ${team}: a roof under the whole ring`).toBeDefined();
      // The tallest roof of the map, 40 m by 28 m: a tower over its neighbours.
      expect(y).toBe(Math.max(...brushes.filter(b => b.min[1] <= -30).map(b => b.max[1])));
      expect(top!.max[0] - top!.min[0]).toBeGreaterThanOrEqual(40);
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
      for (const [sx, sy, sz] of spawns) {
        expect(sy).toBe(y);
        expect(sx).toBeGreaterThanOrEqual(top!.min[0]);
        expect(sx).toBeLessThanOrEqual(top!.max[0]);
        expect(Math.hypot(sx - x, sz - z)).toBeLessThan(25);
      }
    }
  });

  it('has a kill floor well below every roof, a unit sun above the horizon, a sky and a light haze', () => {
    expect(HIGHLINE.floor).toBeLessThan(Math.min(...brushes.map(b => b.max[1])) - 20);
    const { dir, color } = HIGHLINE.sun;
    expect(Math.hypot(...dir)).toBeCloseTo(1, 6);
    expect(dir[1]).toBeGreaterThan(0.3);
    expect(Math.max(...color)).toBeGreaterThan(1);
    const [zenith, horizon] = HIGHLINE.sky;
    expect(zenith[2]).toBeGreaterThan(zenith[0]);
    expect(Math.min(...horizon)).toBeGreaterThan(Math.min(...zenith));
    expect(HIGHLINE.fog![3]).toBeGreaterThan(0);
    expect(HIGHLINE.fog![3]).toBeLessThanOrEqual(0.005);
  });
});

/** What each trip of a route says: the events it used, the modes, the lowest the feet went. */
const flown = (r: Route, from: 'red' | 'blue', walk = false) => {
  const team = from === 'red' ? TEAM.RED : TEAM.BLUE;
  const s = at(team, from === 'red' ? r.start : r.start);
  const legs = trip(r, from);
  const slow = (l: Leg[]): Leg[] =>
    walk ? l.map(x => (x.k === 'go' || x.k === 'leap' ? { ...x, sprint: false } : x)) : l;
  const there = fly(s, slow(legs.there));
  const [mine, theirs] = [teams[team].base, teams[1 - team].base];
  const took = touches(s.p, theirs);
  const evThere = s.ev;
  const back = fly(s, slow(legs.back));
  return { s, there, back, took, home: touches(s.p, mine), evThere };
};

describe('HIGHLINE, racks and packs', () => {
  const packs = HIGHLINE.packs!;

  it('stands each rack and pack on a top clear of brushes, off the flag bases', () => {
    expect(problems(HIGHLINE)).toEqual([]);
  });

  it('stands both racks on the armoury, 1.5 m up, past the flag ahead of the spawns, and mirrored', () => {
    const [red, blue] = teams.map(t => [t.rack!, t.blade!]);
    expect(red).toEqual([
      [30.75, 27.5, 217],
      [33.25, 27.5, 217],
    ]);
    expect(blue).toEqual(red.map(([x, y, z]) => [x, y, ZED - z]));
    for (const [team, { rack, blade, spawns, base }] of teams.entries()) {
      const ahead = team ? 1 : -1;
      for (const at of [rack!, blade!]) {
        // On the plinth's top, the roof 1.5 m under it, the flag between the racks and the spawns.
        expect(
          world.def.brushes.some(
            b => b.max[1] === at[1] && meets(b, at[0], at[1] - 0.1, at[2], 0.05),
          ),
        ).toBe(true);
        expect((at[2] - base[2]) * ahead).toBeGreaterThan(4);
        for (const [, , z] of spawns) {
          expect((at[2] - z) * ahead).toBeGreaterThan(12);
        }
      }
      expect(Math.hypot(blade![0] - rack![0], blade![2] - rack![2])).toBeCloseTo(2.5, 6);
      expect(Math.hypot(blade![0] - rack![0], blade![2] - rack![2])).toBeGreaterThan(2 * RACK_R);
    }
  });

  it('takes a run and a jump from every spawn to reach the racks, which the roof under them does not', () => {
    for (const [team, { rack, blade, spawns }] of teams.entries()) {
      for (const [n, [x, y, z0, yaw]] of spawns.entries()) {
        for (const at of [rack!, blade!]) {
          const s = Sim.at(world).put(x, y, z0, yaw);
          // Round the low wall, then along the roof to the plinth's foot: not there yet.
          const z = (v: number) => (team ? ZED - v : v);
          expect(s.goTo(s.p.x < 32 ? 27 : 37, z(227), { sprint: true, r: 0.4 })).toBeGreaterThan(0);
          expect(s.goTo(at[0], z(220), { sprint: true, r: 0.4 })).toBeGreaterThan(0);
          expect(s.p.y).toBe(26);
          expect(within(s.p, at, RACK_R)).toBe(false);
          // A jump onto it, then within the circle.
          const k = s.until(
            p => within(p, at, RACK_R),
            p => KEY.FORWARD | (p.ground && p.y < 27 ? KEY.JUMP : 0),
            p => toward(p.x, p.z, at[0], at[2]),
            120,
          );
          expect(k, `team ${team}, spawn ${n}`).toBeGreaterThan(0);
          expect(s.p.y).toBeCloseTo(27.5, 6);
        }
      }
    }
  });

  it('has 8 to 12 health packs, each with a twin across the line, and a few on every route of each half', () => {
    expect(packs.length).toBeGreaterThanOrEqual(8);
    expect(packs.length).toBeLessThanOrEqual(12);
    for (const [x, y, z] of packs) {
      expect(
        packs.some(q => q[0] === x && q[1] === y && q[2] === ZED - z),
        `a twin of ${x}, ${y}, ${z}`,
      ).toBe(true);
    }
    // The Spine (26), Midtown (19 to 21.2) and the Lowline (14.5), in red's half.
    const half = packs.filter(p => p[2] > 120);
    expect(half.some(p => p[1] === 26)).toBe(true);
    expect(half.some(p => p[1] === 19 || p[1] === 21.2)).toBe(true);
    expect(half.some(p => p[1] === 14.5)).toBe(true);
    // And the plaza, where the routes meet, has its own pair.
    expect(packs.filter(p => p[2] > 100 && p[2] < 140)).toHaveLength(2);
  });
});

describe('HIGHLINE, ammo packs', () => {
  const ammo = HIGHLINE.ammo!;

  it('has 8 to 12, each with a twin across the line, a few on every route of each half', () => {
    expect(ammo.length).toBeGreaterThanOrEqual(8);
    expect(ammo.length).toBeLessThanOrEqual(12);
    for (const [x, y, z] of ammo) {
      expect(
        ammo.some(q => q[0] === x && q[1] === y && q[2] === ZED - z),
        `a twin of ${x}, ${y}, ${z}`,
      ).toBe(true);
    }
    const half = ammo.filter(p => p[2] > 120);
    expect(half.some(p => p[1] === 26)).toBe(true);
    expect(half.some(p => p[1] === 19 || p[1] === 21.2)).toBe(true);
    expect(half.some(p => p[1] === 14.5)).toBe(true);
    // Health and ammo together fit the 32 bits of Snapshot.packs.
    expect(ammo.length + HIGHLINE.packs!.length).toBeLessThanOrEqual(32);
  });
});

describe('HIGHLINE, the three routes, flown with the real physics', () => {
  const routes: [string, Route][] = [
    ['high', HIGH],
    ['middle', MID],
    ['low', LOW],
  ];
  const times: Record<string, number> = {};

  for (const [name, r] of routes) {
    for (const from of ['red', 'blue'] as const) {
      it(`takes the ${name} route from ${from}'s spawn to the other flag and carries it home, never falling`, () => {
        const f = flown(r, from);
        expect(f.there, JSON.stringify(f.there.failed)).toMatchObject({ ok: true });
        expect(f.took).toBe(true);
        expect(f.back, JSON.stringify(f.back.failed)).toMatchObject({ ok: true });
        expect(f.home).toBe(true);
        // The lowest roof of the map is 14.5 m: never under it, so never fell.
        expect(f.s.low).toBeGreaterThan(14.4);
        times[`${name} ${from}`] = f.there.seconds;
        if (from === 'blue') {
          // The map is symmetric: so is the time, to a few steps.
          expect(Math.abs(times[`${name} red`] - times[`${name} blue`])).toBeLessThan(0.5);
        }
      });
    }
  }

  it('crosses base to base in 25 to 40 s by the fast route, and the middle and the low take longer, in that order', () => {
    expect(times['high red']).toBeGreaterThanOrEqual(24);
    expect(times['high red']).toBeLessThanOrEqual(40);
    expect(times['middle red']).toBeGreaterThan(times['high red'] + 5);
    expect(times['low red']).toBeGreaterThan(times['middle red']);
  });

  it('needs the moves on the fast route: a dash, a double jump, the wall-run, none of them on the low one', () => {
    const high = flown(HIGH, 'red');
    expect(high.s.ev & (EV.DASH | EV.DOUBLE | EV.WALLRUN_START)).toBe(
      EV.DASH | EV.DOUBLE | EV.WALLRUN_START,
    );
    expect(high.s.modes.has(MODE.WALLRUN)).toBe(true);
    const low = flown(LOW, 'red');
    expect(low.s.ev & (EV.DASH | EV.DOUBLE | EV.WALLRUN_START | EV.GRAB)).toBe(0);
    expect(low.s.modes.has(MODE.WALLRUN)).toBe(false);
    // The middle route is roofs, gaps and ledges to grab, no dash.
    const mid = flown(MID, 'red');
    expect(mid.s.ev & (EV.GRAB | EV.CLIMB)).toBe(EV.GRAB | EV.CLIMB);
    expect(mid.s.ev & (EV.DASH | EV.DOUBLE)).toBe(0);
  });

  it('walks the low route end to end, with no sprint at all', () => {
    const f = flown(LOW, 'red', true);
    expect(f.there.ok && f.took && f.back.ok && f.home).toBe(true);
    expect(f.there.seconds).toBeGreaterThan(times['low red']);
  });

  it('does not let a plain sprint and jump across the fast route: the first gap is too long', () => {
    // To the end of the 11 m gap with no dash and no double jump: it comes down on the terrace
    // under it, or on the ledges up from it, never on the roof across.
    const s = at(TEAM.RED, HIGH.start);
    const f = fly(s, plain(HIGH.out));
    expect(f.ok).toBe(false);
    expect(f.failed!.n).toBe(1);
    expect(UNDER).toContain(s.p.y);
    expect(s.p.z).toBeGreaterThan(201);
    expect(s.p.z).toBeLessThan(212);
  });

  it('does not let any mix of dash and double jump cross the 17 m viaduct without its wall', () => {
    const tries = [
      { dash: 30 },
      { double: 25 },
      { dash: 15, double: 30 },
      { dash: 25, double: 12 },
      { dash: 12, double: 25 },
    ];
    for (const t of tries) {
      // Along the far lane, 9 m from the wall: no wall-run starts.
      const s = new Sim(spawn(0, world, 0), world).put(24.5, 26, 190, NORTH);
      const f = fly(s, [leap([24.5, 164.2], [24.5, 142], 26, t)]);
      expect(f.ok, JSON.stringify(t)).toBe(false);
      expect(s.modes.has(MODE.WALLRUN)).toBe(false);
    }
    // With the wall but neither dash nor double jump, the run is not enough either.
    const s = new Sim(spawn(0, world, 0), world).put(15.6, 26, 190, NORTH);
    expect(fly(s, [leap([15.6, 164.2], [15.6, 142], 26, { run: true })]).ok).toBe(false);
    expect(s.modes.has(MODE.WALLRUN)).toBe(true);
    // And with the wall and a dash and a double jump, it is made.
    const t = new Sim(spawn(0, world, 0), world).put(15.6, 26, 190, NORTH);
    expect(
      fly(t, [leap([15.6, 164.2], [15.6, 142], 26, { run: true, dash: 1, double: 12 })]).ok,
    ).toBe(true);
  });

  it('slides under the sign on the low roof, and stops against it standing', () => {
    const s = new Sim(spawn(0, world, 0), world).put(88, 14.5, 178, NORTH);
    const f = fly(s, [{ k: 'slide', from: [88, 176], to: [88, 150], c: [10, 21], y: 14.5 }]);
    expect(f.ok).toBe(true);
    expect(s.modes.has(MODE.SLIDE)).toBe(true);
    expect(s.p.z).toBeLessThan(158);
    // The lintel hangs 1.2 m over the roof: a standing body does not pass, and goes round at x = 98.
    const w = new Sim(spawn(0, world, 0), world).put(88, 14.5, 178, NORTH);
    w.until(p => p.z < 150, KEY.FORWARD | KEY.SPRINT, NORTH, 300);
    expect(w.p.z).toBeCloseTo(162 + PLAYER_R, 1);
  });
});

describe('HIGHLINE, recoveries: a miss costs time, not always a fall', () => {
  for (const [name, u] of Object.entries(UP) as [keyof typeof UP, (typeof UP)[keyof typeof UP]][]) {
    it(`climbs up from the ${name} to the roof above, by ledges the hands catch`, () => {
      const s = new Sim(spawn(0, world, 0), world).put(u.from[0], u.from[1], u.from[2], NORTH);
      expect(s.p.y).toBe(u.from[1]);
      const f = fly(s, u.legs);
      expect(f.ok, JSON.stringify(f.failed)).toBe(true);
      expect(s.p.y).toBe(26);
      expect(s.ev & (EV.GRAB | EV.CLIMB)).toBe(EV.GRAB | EV.CLIMB);
      expect(s.low).toBeGreaterThan(u.from[1] - 0.1);
    });
  }

  it('lands a short jump over the first gap on the terrace or its ledges, and gets back to the Spine from there', () => {
    const s = at(TEAM.RED, HIGH.start);
    fly(s, plain(HIGH.out).slice(0, 2));
    expect(UNDER).toContain(s.p.y);
    expect(s.p.ground).toBe(true);
    // The ledges above where it stands, from where it stands.
    const f = fly(s, above(UP.terrace.legs, s.p.y));
    expect(f.ok, JSON.stringify(f.failed)).toBe(true);
    expect(s.p.y).toBe(26);
    expect(s.low).toBeGreaterThan(18.9);
  });

  it('lands a step off the beam on the plaza under it, and climbs back to the Spine', () => {
    const s = new Sim(spawn(0, world, 0), world).put(15.6, 26, 120, NORTH);
    // Off the beam to the east, 11 m down.
    s.until(p => p.ground && p.y < 20, KEY.RIGHT, NORTH, 200);
    expect([s.p.y, s.p.ground]).toEqual([15, true]);
    s.put(8.5, 15, 124, NORTH);
    expect(fly(s, UP.plaza.legs).ok).toBe(true);
    expect(s.p.y).toBe(26);
  });

  it('lands a short jump over the viaduct on the roof under it, and climbs back to the roof it left', () => {
    const s = new Sim(spawn(0, world, 0), world).put(15.6, 26, 190, NORTH);
    fly(s, [leap([15.6, 164.2], [15.6, 142], 26, { run: true })]);
    expect(s.p.y).toBe(19);
    expect(s.p.x).toBeGreaterThan(15);
    expect(s.p.z).toBeGreaterThan(147);
    expect(s.p.z).toBeLessThan(164);
    const f = fly(s, UP.viaduct.legs);
    expect(f.ok, JSON.stringify(f.failed)).toBe(true);
    expect(s.low).toBeGreaterThan(18.9);
  });
});

describe('HIGHLINE, crossings', () => {
  it('has a stair from the low roofs up to the forecourt of Midtown, walked both ways with no jump', () => {
    const s = new Sim(spawn(0, world, 0), world).put(90, 14.5, 199, NORTH);
    const up = fly(s, [go(74, 199, 19, false)]);
    expect(up.ok, JSON.stringify(up.failed)).toBe(true);
    expect(s.ev & EV.JUMP).toBe(0);
    const down = fly(s, [go(90, 199, 14.5, false)]);
    expect(down.ok, JSON.stringify(down.failed)).toBe(true);
    expect(s.ev & EV.JUMP).toBe(0);
  });

  it('drops from the first Spine roof to the forecourt of Midtown by the same ledges, a jump or a walk off', () => {
    const s = new Sim(spawn(0, world, 0), world).put(22, 26, 186, EAST);
    s.until(p => p.ground && p.y < 20, KEY.FORWARD, EAST, 200);
    expect(s.p.y).toBeLessThan(26);
    expect(s.p.y).toBeGreaterThan(18.9);
  });
});

describe('HIGHLINE, random play', () => {
  it('never puts a player inside a brush or loses it, whatever is pressed, on the stairs, beams and ledges', () => {
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
    for (const [seed, team, spawnAt] of [
      [1, 0, 0],
      [2, 0, 4],
      [3, 1, 7],
      [4, 1, 2],
    ]) {
      let r = seed;
      const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
      const sim = at(team, spawnAt);
      let keys = 0;
      let yaw = sim.p.yaw;
      let turn = 0;
      for (let k = 0; k < 15000; k++) {
        if (k % 8 === 0) {
          keys =
            (rnd() < 0.85 ? 1 : 0) | (Math.floor(rnd() * 256) & ~1 & (rnd() < 0.5 ? 0xff : 0x1c));
          turn = (rnd() - 0.5) * 0.15;
          if (rnd() < 0.05) {
            yaw += (rnd() - 0.5) * 6;
          }
        }
        yaw += turn;
        const p = sim.step(keys, yaw, Math.sin(k / 50) * MAX_PITCH);
        const label = `seed ${seed}, step ${k}`;
        for (const v of [p.x, p.y, p.z, p.vx, p.vy, p.vz]) {
          expect(Number.isFinite(v), label).toBe(true);
        }
        expect(inside(p), label).toBe(false);
        expect(p.y, label).toBeGreaterThan(HIGHLINE.floor - 3);
        landed += p.ev & EV.LAND ? 1 : 0;
      }
    }
    expect(landed).toBeGreaterThan(100);
  }, 60_000);
});

describe('HIGHLINE, capture the flag, end to end through a room', () => {
  const peer = () => {
    const c: Conn & { bins: ArrayBuffer[] } = {
      bins: [],
      send: d => typeof d !== 'string' && c.bins.push(d),
    };
    return c;
  };
  const snap = (c: { bins: ArrayBuffer[] }): Snapshot => decodeSnapshot(c.bins.at(-1)!)!;

  it("has red take blue's flag by the fast route and carry it home to score", () => {
    // Fly it first on a sim, then send the same inputs to a room that plays HIGHLINE by default.
    const s = at(TEAM.RED, HIGH.start);
    const legs = trip(HIGH, 'red');
    expect(fly(s, legs.there).ok).toBe(true);
    const carried = s.inputs.length;
    expect(fly(s, legs.back).ok).toBe(true);

    const room = new Room();
    const c = peer();
    room.connect(c);
    room.receive(c, JSON.stringify({ t: 'join', name: 'Ann' }));
    const start = decodeSnapshot(c.bins.at(-1) ?? new ArrayBuffer(0));
    expect(start).toBeNull();
    for (let k = 0; k < SNAP_EVERY; k++) {
      room.tick();
    }
    expect(snap(c).players[0]).toMatchObject({ id: 0, x: teams[0].spawns[HIGH.start][0] });
    expect(snap(c).flags.map(f => f.state)).toEqual([FLAG.HOME, FLAG.HOME]);

    let took = false;
    let dropped = false;
    for (const [k, step] of s.inputs.entries()) {
      room.receive(c, encodeInput({ seq: k & 0xffff, ...step, yaw: step.yaw, pitch: step.pitch }));
      room.tick();
      if (k === carried) {
        for (let j = 0; j < SNAP_EVERY; j++) {
          room.tick();
        }
        // At the blue flag, and now carrying it.
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
});
