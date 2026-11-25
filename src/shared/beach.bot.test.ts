// The bots on Landfall (docs/BEACH.md, docs/BOTS.md): their map of the beach keeps out of the deep
// water and knows the five ways across the wreck, and a bot flies each of them with the real physics.
import { describe, expect, it } from 'vitest';
import { BEACH, DEPTH, HOLD, HULL, RINGS, WING, ZED, walked } from './beach';
import { Bot } from './bot';
import type { Sight } from './bot';
import { STEP_H } from './constants';
import { heightAt, locate, navOf, path } from './nav';
import type { Step, Vec3 } from './nav';
import { move, spawn } from './physics';
import { decodeSnapshot } from './protocol';
import { ground } from './relief';
import { Room } from './room';
import { EV, FLAG } from './types';
import type { Conn, FlagState, PlayerState } from './types';
import { build } from './world';

const world = build(BEACH);
const nav = navOf(world);
const [red, blue] = BEACH.teams;
const MID = ZED / 2;
const [, [west, east]] = HULL.sections;

/** The way across a body is on at (x, y) on the wreck's line. */
const way = (x: number, y: number): string =>
  y > HULL.r ? 'back' : x < west - 8 ? 'lagoon' : x < west ? 'west' : x < east ? 'hold' : 'east';

/** Where a planned way crosses the wreck's line, x. */
const crossing = (from: Vec3, steps: Step[]): number => {
  let last = from;
  for (const { to } of steps) {
    if ((to[2] - MID) * (last[2] - MID) <= 0 && to[2] !== last[2]) {
      return last[0] + ((to[0] - last[0]) * (MID - last[2])) / (to[2] - last[2]);
    }
    last = to;
  }
  return NaN;
};

describe('LANDFALL, the bots’ map', () => {
  it('has no floor under deep water: every rectangle of the bed is waded, 0.3 m and more over the depth', () => {
    const wet = nav.polys.filter(p => p.r);
    expect(wet.length).toBeGreaterThan(400);
    for (const p of nav.polys) {
      const [x0, z0, x1, z1] = p.q;
      for (let x = x0; x <= x1; x += Math.max((x1 - x0) / 8, 0.25)) {
        for (let z = z0; z <= z1; z += Math.max((z1 - z0) / 8, 0.25)) {
          expect(heightAt(world, p, x, z)).toBeGreaterThanOrEqual(DEPTH + 0.3 - 1e-6);
        }
      }
    }
    // The shallows are still there to wade, and the bed past them is not: 14 m out and no more.
    const lowest = Math.min(...wet.map(p => ground(world, p.q[0], p.q[1])));
    expect(lowest).toBeLessThan(-0.9);
    expect(Math.min(...wet.map(p => p.q[0]))).toBeGreaterThanOrEqual(16);
  });

  it('joins the two bases by five ways across the wreck, one for each route a bot prefers, both ways', () => {
    expect(nav.ways).toBe(5);
    for (const [from, to] of [
      [red, blue],
      [blue, red],
    ]) {
      const [x, y, z] = from.spawns[0];
      const xs = [0, 1, 2, 3, 4].map(k => {
        const steps = path(nav, world, [x, y, z], to.base, k);
        expect(steps.at(-1)!.to).toEqual(to.base);
        return crossing([x, y, z], steps);
      });
      // Up the wing and through the hold's door, both on the middle section; the two gaps; the raft.
      const [back, hold, w, e, lagoon] = xs;
      expect(back).toBeGreaterThan(WING.root[0]);
      expect(back).toBeLessThan(WING.root[1]);
      expect(hold).toBeGreaterThan(HOLD.door[0]);
      expect(hold).toBeLessThan(HOLD.door[1]);
      expect(way(w, 0)).toBe('west');
      expect(way(e, 0)).toBe('east');
      expect(way(lagoon, 0)).toBe('lagoon');
      // The carrier's way home is the quickest, whichever it is.
      expect(path(nav, world, to.base, from.base).at(-1)!.to).toEqual(from.base);
    }
    // Round the tail is jumped, box to box: four leaps out to the raft, three back in.
    const [x, y, z] = red.spawns[0];
    const leaps = path(nav, world, [x, y, z], blue.base, 4).filter(st => st.leg?.k === 'leap');
    expect(leaps).toHaveLength(7);
    expect(leaps.every(st => st.edge!.route === 4)).toBe(true);
    // The other four are walked.
    for (const k of [0, 1, 2, 3]) {
      expect(path(nav, world, [x, y, z], blue.base, k).some(st => st.leg)).toBe(false);
    }
  });
});

describe('LANDFALL, a bot alone with the real physics', () => {
  const home: FlagState = { state: FLAG.HOME, by: 0, x: 0, y: 0, z: 0, left: 0 };
  const ways = ['back', 'hold', 'west', 'east', 'lagoon'];

  /**
   * A bot of this id and team run for the other flag (or till `done`), from its spawn or from
   * `from`: where it crossed the wreck's line, the lowest it went, whether it was put back at a
   * spawn, how long it took and where it ended.
   */
  const flight = (
    id: number,
    team: number,
    secs: number,
    o: {
      from?: Vec3;
      sight?: Partial<Sight>;
      hp?: number;
      done?: (p: PlayerState) => boolean;
    } = {},
  ) => {
    // Armed: it has no rack to go by first.
    const armed = { ammo: 10, mag: 5, blade: true, rifle: 10, rail: 10 };
    const state: PlayerState = { ...spawn(id, world, 0, team), ...armed };
    if (o.from) {
      [state.x, state.y, state.z] = o.from.map(Math.fround);
    }
    state.hp = o.hp ?? state.hp;
    const me = { id, team, state };
    const bot = new Bot(id);
    let [low, put, at] = [Infinity, false, 'none'];
    const [bx, , bz] = BEACH.teams[1 - team].base;
    const done = o.done ?? ((p: PlayerState) => (p.x - bx) ** 2 + (p.z - bz) ** 2 < 4);
    let k = 0;
    for (; k < secs * 60 && !done(state); k++) {
      const z = state.z;
      const i = bot.think({ me, others: [], flags: [home, home], world, ...o.sight });
      move(state, { ...i, seq: k & 0xffff }, world, 0);
      low = Math.min(low, state.y);
      put ||= !!(state.ev & EV.RESPAWN);
      if ((z - MID) * (state.z - MID) <= 0 && z !== state.z) {
        at = way(state.x, state.y);
      }
    }
    return { low, put, at, seconds: k / 60, state };
  };

  it('runs each way across to the other flag by the route its id prefers, red and blue, never out of its depth', () => {
    for (const team of [0, 1]) {
      for (const [id, name] of ways.entries()) {
        const f = flight(id, team, 60);
        expect([team, name, f.at, f.put]).toEqual([team, name, name, false]);
        // Waist deep in the flooded furrow of the west gap and in the shallows by the first float.
        expect(f.low).toBeGreaterThan(DEPTH + 0.4);
        expect(f.seconds).toBeLessThan(name === 'lagoon' ? 32 : 20);
      }
    }
  });

  it('comes down off the hull’s shoulder, a dead end of its map 7.5 m over the sand, unhurt', () => {
    // The shoulder overhangs the sand: the mesh has no way off it.
    const y = HULL.axis[1] + RINGS[2][0];
    const [i] = locate(nav, world, [60, y, MID + 6]);
    expect(nav.polys[i].y).toBe(y);
    expect(nav.out[i]).toEqual([]);
    for (const team of [0, 1]) {
      const f = flight(0, team, 30, { from: [60, y, MID + (team ? -6 : 6)] });
      expect(f.put).toBe(false);
      expect(f.state.hp).toBe(spawn(0, world, 0, team).hp);
      expect(f.seconds).toBeLessThan(22);
    }
  });

  it('stays out of the deep water: a flag out of its depth is waited for at the edge of the shallows', () => {
    // Dropped where nobody stands, 8 m past the last bed that is waded.
    const lost: FlagState = { state: FLAG.DROPPED, by: 0, x: 8, y: -2.2, z: 150, left: 600 };
    const f = flight(2, 0, 30, {
      from: [30, walked(30, 150), 150],
      sight: { flags: [home, lost] },
      done: () => false,
    });
    expect(f.put).toBe(false);
    expect(f.low).toBeGreaterThan(DEPTH + 0.2);
    expect(f.state.x).toBeLessThan(22);
    expect(Math.abs(f.state.z - 150)).toBeLessThan(4);
  });

  it('jumps onto a box a little too high to step onto: the pack on the panel by the hold’s door', () => {
    const pack = BEACH.packs![2];
    const [x, , z] = pack;
    // 0.59 m over the level sand east of it: more than a step.
    expect(pack[1] - ground(world, x + 2, z)).toBeGreaterThan(STEP_H + 0.05);
    const f = flight(1, 0, 10, {
      from: [58, ground(world, 58, 118), 118],
      hp: 2,
      sight: { packs: [pack] },
      done: p =>
        p.ground && Math.abs(p.y - pack[1]) < 0.01 && (p.x - x) ** 2 + (p.z - z) ** 2 < 1.5,
    });
    expect(f.seconds).toBeLessThan(4);
  });
});

describe('LANDFALL, a match of bots', () => {
  it('has a bot take the other flag and carry it home to score, nobody drowned on the way', () => {
    const room = new Room({ bots: 9, map: 'landfall' });
    let last: ArrayBuffer | undefined;
    const c: Conn = {
      send: d => {
        if (typeof d !== 'string') {
          last = d;
        }
      },
    };
    room.connect(c);
    room.receive(c, JSON.stringify({ t: 'join', name: 'bench' }));
    const players = [
      ...(
        room as unknown as { peers: Map<Conn, { bot?: unknown; state: PlayerState }> }
      ).peers.values(),
    ];
    const me = players.find(p => !p.bot)!;
    let [score, carried, drowned] = [0, false, 0];
    for (let k = 0; k < 60 * 120 && !score; k++) {
      // The bench lies down: he touches no flag and nobody shoots him.
      me.state.down = 999;
      room.tick();
      for (const p of players) {
        drowned += p.bot && p.state.y < DEPTH ? 1 : 0;
      }
      if (last && k % 30 === 0) {
        const snap = decodeSnapshot(last)!;
        carried ||= snap.flags.some(f => f.state === FLAG.CARRIED);
        score = snap.score[0] + snap.score[1];
      }
    }
    expect(carried).toBe(true);
    expect(score).toBe(1);
    expect(drowned).toBe(0);
  });
});
