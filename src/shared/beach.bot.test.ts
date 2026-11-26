// The bots on Landfall (docs/BEACH.md, docs/BOTS.md): their map of the beach keeps out of the deep
// water, knows the five ways across the wreck and the ways up and down inside it, and a bot flies
// each of them with the real physics.
import { describe, expect, it } from 'vitest';
import { BEACH, DECKS, DEPTH, HOLD, HULL, SHIP, WING, ZED, walked } from './beach';
import { Bot } from './bot';
import type { Sight } from './bot';
import { STEP_H } from './constants';
import { PASS, heightAt, locate, navOf, path } from './nav';
import type { Step, Vec3 } from './nav';
import { floorAt, move, spawn } from './physics';
import { decodeSnapshot } from './protocol';
import { ground } from './relief';
import { Room } from './room';
import { EV, FLAG, MODE } from './types';
import type { Conn, FlagState, PlayerState } from './types';
import { build } from './world';

const world = build(BEACH);
const nav = navOf(world);
const [red, blue] = BEACH.teams;
const MID = ZED / 2;
const [, [west, east]] = HULL.sections;

const [tail] = HULL.sections[0];
/** The middle section's floors: the hold, the lower deck, the gallery and the back. */
const [, DECK, GALLERY, BACK] = [SHIP[1].floor, ...DECKS].map(h => HULL.axis[1] + h);
/** The tear in each flank the gallery is entered by, x0 and x1. */
const [TEAR0, TEAR1] = SHIP[1].tears[2];

/** The way across a body is on at (x, y) on the wreck's line: over the hold is the high road. */
const way = (x: number, y: number): string =>
  y > 4 ? 'high' : x < tail ? 'lagoon' : x < west ? 'west' : x < east ? 'hold' : 'east';

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
      // Up the wing and through the gallery's tears, through the hold's door, both on the middle
      // section; the two gaps; the raft.
      const [high, hold, w, e, lagoon] = xs;
      expect(high).toBeGreaterThan(TEAR0);
      expect(high).toBeLessThan(TEAR1);
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
    // The high road is walked: up a wing on a rail over each of its two breaks. Down the other
    // wing is the nav's choice: by its rails, or off its leading edge onto the sand under it.
    expect(path(nav, world, [x, y, z], blue.base, 0).some(st => st.leg)).toBe(false);
    // The hold and the two gaps are climbed (the user, 2026-11-26): up onto the door's sill, up
    // the heap across each gap, a jump and a pull up each time.
    for (const k of [1, 2, 3]) {
      const ups = path(nav, world, [x, y, z], blue.base, k).filter(st => st.leg?.k === 'leap');
      expect(ups.length, `route ${k}`).toBeGreaterThanOrEqual(1);
    }
    const rails = path(nav, world, [x, y, z], blue.base, 0).filter(
      st => st.to[2] > MID && WING.rails.some(r => Math.abs(st.to[0] - r) < 0.23),
    );
    expect(rails.length).toBeGreaterThanOrEqual(2);
  });

  it('has no way down through a floor: a drop is off an edge with nothing between it and the floor below', () => {
    // The gallery's strip beside its hole and the lower deck under the gallery's floor west of
    // it: side by side on the plan, a floor between them.
    const [i] = locate(nav, world, [62, GALLERY, MID + 3.5]);
    const [j] = locate(nav, world, [58, DECK, MID + 3.5]);
    expect(nav.polys[i].y).toBe(GALLERY);
    expect(nav.polys[j].y).toBe(DECK);
    expect(nav.out[i].some(e => e.to === j)).toBe(false);
    // A wing's row and the sand under the next row up: no way off the wing through it.
    for (const [k, es] of nav.out.entries()) {
      for (const e of es) {
        const [a, b] = [nav.polys[k], nav.polys[e.to]];
        if (e.pass === PASS.DROP && !a.r && b.r) {
          const [px, pz] = [(e.a![0] + e.b![0]) / 2, (e.a![1] + e.b![1]) / 2];
          const [x, z] = [0, 1].map(n =>
            Math.min(Math.max(n ? pz : px, b.q[n] + 0.3), b.q[n + 2] - 0.3),
          );
          expect(floorAt(world, x, z, a.y + STEP_H + 0.1)).toBeLessThanOrEqual(
            ground(world, x, z) + STEP_H + 0.2,
          );
        }
      }
    }
  });

  it('climbs the wreck inside: a crate, a jump and a pull up through the hole at each level, and a drop back down each', () => {
    // From the hold to the back of the middle section: a crate and the hole over it up to the
    // gallery, then the end of a ledge of skin in the gallery's tear, or the third crate.
    const up = path(nav, world, [50, HOLD.floor, MID], [63, BACK, MID]);
    expect(up.at(-1)!.to).toEqual([63, BACK, MID]);
    const pulls = up.filter(st => st.leg);
    expect(pulls.map(st => st.to[1]).slice(0, 4)).toEqual([2.25, DECK, 5.9, GALLERY]);
    expect(pulls.every(st => st.leg!.k === 'leap' && st.edge!.route === -1)).toBe(true);
    // Each crate is climbed from its floor and climbs to the next; each pull has its drop.
    for (const [n, c] of HULL.axis.entries()) {
      for (const [x, deck] of SHIP[n].crates) {
        const under = c + (DECKS[deck] ?? SHIP[n].floor);
        const [i] = locate(nav, world, [x + 0.75, under + 2, MID]);
        expect(nav.polys[i].y).toBe(under + [1, 1.4, 2][deck + 1]);
        expect(nav.out[i].some(e => e.legs && nav.polys[e.to].y === c + DECKS[deck + 1])).toBe(
          true,
        );
        expect(nav.out.some(es => es.some(e => e.to === i && e.legs))).toBe(true);
        expect(nav.out.some(es => es.some(e => e.to === i && e.pass === PASS.DROP))).toBe(true);
      }
    }
    // Every floor inside the wreck and on its backs has a way to both flags: no dead end there
    // (the ledges outside its flanks are another matter: see the skin ledges below).
    const inside = nav.polys.filter(
      ({ q, r }) => !r && q[0] >= tail && q[2] <= 106 && q[1] > MID - 6 && q[3] < MID + 6,
    );
    expect(inside.length).toBeGreaterThan(120);
    for (const { q, y } of inside) {
      const from: Vec3 = [(q[0] + q[2]) / 2, y, (q[1] + q[3]) / 2];
      for (const { base } of BEACH.teams) {
        expect([from, path(nav, world, from, base).at(-1)!.to]).toEqual([from, base]);
      }
    }
  });
});

describe('LANDFALL, a bot alone with the real physics', () => {
  const home: FlagState = { state: FLAG.HOME, by: 0, x: 0, y: 0, z: 0, left: 0 };
  const ways = ['high', 'hold', 'west', 'east', 'lagoon'];

  /**
   * A bot of this id and team run for the other flag (or till `done`), from its spawn or from
   * `from`: where it crossed the wreck's line and how high, the lowest it went, whether it was
   * put back at a spawn, how often it pulled itself up, how many breaks of a wing it walked a
   * rail over, how long it took and where it ended.
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
    let [low, put, at, y, pulls, rails] = [Infinity, false, 'none', 0, 0, 0];
    // The middle of each break of red's wing, z; blue's are their twins.
    const breaks = [0, 1].map(
      n =>
        MID +
        HULL.r +
        SHIP[1].fair[1][2] +
        WING.span * (WING.pieces[n][1] + 1) +
        (WING.pieces[n][2] + WING.pieces[n + 1][2]) / 2,
    );
    const [bx, , bz] = BEACH.teams[1 - team].base;
    const done = o.done ?? ((p: PlayerState) => (p.x - bx) ** 2 + (p.z - bz) ** 2 < 4);
    let k = 0;
    for (; k < secs * 60 && !done(state); k++) {
      const [z, mode] = [state.z, state.mode];
      const i = bot.think({ me, others: [], flags: [home, home], world, ...o.sight });
      move(state, { ...i, seq: k & 0xffff }, world, 0);
      low = Math.min(low, state.y);
      put ||= !!(state.ev & EV.RESPAWN);
      pulls += state.mode === MODE.CLIMB && mode !== MODE.CLIMB ? 1 : 0;
      if ((z - MID) * (state.z - MID) <= 0 && z !== state.z) {
        [at, y] = [way(state.x, state.y), state.y];
      }
      for (const b of breaks) {
        const [a, c] = [z, state.z].map(v => Math.abs(v - MID) + MID - b);
        if (
          a * c <= 0 &&
          a !== c &&
          state.ground &&
          state.y > ground(world, state.x, state.z) + 1.5
        ) {
          rails += WING.rails.some(r => Math.abs(state.x - r) < 0.4) ? 1 : 0;
        }
      }
    }
    return { low, put, at, y, pulls, rails, seconds: k / 60, state };
  };

  it('runs each way across to the other flag by the route its id prefers, red and blue, never out of its depth', () => {
    for (const team of [0, 1]) {
      for (const [id, name] of ways.entries()) {
        const f = flight(id, team, 60);
        expect([team, name, f.at, f.put]).toEqual([team, name, name, false]);
        // Waist deep in the flooded furrow of the west gap and in the shallows by the first float.
        expect(f.low).toBeGreaterThan(DEPTH + 0.4);
        expect(f.seconds).toBeLessThan(name === 'lagoon' ? 37 : 25);
        // The high road is the gallery, up the wing by a rail over each of its two breaks (no
        // jump to miss) and down the other wing by its rails or off its edge, unhurt.
        if (!id) {
          expect(f.y).toBe(GALLERY);
          expect(f.rails).toBeGreaterThanOrEqual(2);
          expect(f.state.hp).toBe(spawn(id, world, 0, team).hp);
        }
      }
    }
  });

  it('crosses on the lower deck from tear to tear, and drops out of it onto the sand', () => {
    for (const team of [0, 1]) {
      // A bot of the high road's: one of the hold's, whose camp is 20 m further since the beach
      // grew, now drops through the deck's hole into the hold, its own way.
      const f = flight(0, team, 20, { from: [50, DECK, MID + (team ? -5 : 5)] });
      expect([f.at, f.y, f.put]).toEqual(['high', DECK, false]);
      expect(f.state.hp).toBe(spawn(0, world, 0, team).hp);
      expect(f.seconds).toBeLessThan(14);
    }
  });

  it('climbs from the hold to the armour on the back: a crate, a jump and a pull up through the hole at each level', () => {
    const vest: Vec3 = [63, BACK, MID];
    for (const team of [0, 1]) {
      const f = flight(0, team, 20, {
        from: [50, HOLD.floor, MID + (team ? -1 : 1)],
        hp: 2,
        sight: { packs: [vest] },
        done: p => p.ground && p.y === BACK && (p.x - 63) ** 2 + (p.z - MID) ** 2 < 1.5,
      });
      // (Blue's bot, since the gaps are climbed, goes for the gallery's tear on red's side first,
      // misses its pull up there and takes the one on its own: 12.9 s against red's 8.2.)
      expect(f.seconds).toBeLessThan(team ? 14 : 9);
      // Through the two holes and onto the skin or the last crate, the hands on the edge each time.
      expect(f.pulls).toBeGreaterThanOrEqual(3);
    }
  });

  it('comes down from the back by the holes it climbed: no walking in circles over a floor it sees below', () => {
    // The nose has no wing to walk down: off its back, the only way is down through its decks.
    for (const team of [0, 1]) {
      const f = flight(1, team, 30, { from: [84, HULL.axis[2] + HULL.r, MID] });
      expect(f.put).toBe(false);
      expect(f.state.hp).toBe(spawn(1, world, 0, team).hp);
      expect(f.seconds).toBeLessThan(20);
    }
  });

  it('comes off the skin ledges of the shoulders and off the short fairing, a dead end of its map 7 m over the sand, unhurt', () => {
    // The fairing west of the wing: a ledge at the gallery's height that leads nowhere.
    const [f0, f1, out] = SHIP[1].fair[0];
    const ledge: Vec3 = [(f0 + f1) / 2, GALLERY, MID + HULL.r + out / 2];
    const [i] = locate(nav, world, ledge);
    expect(nav.polys[i].y).toBe(GALLERY);
    expect(nav.out[i]).toEqual([]);
    // And two ledges of skin between the fairing's and the back, a foot wide.
    const skin: Vec3[] = [
      [50, 9.85, MID + 6.4],
      [60, 11.25, MID + 5.5],
    ];
    for (const team of [0, 1]) {
      for (const [x, y, z] of [ledge, ...skin]) {
        const f = flight(0, team, 30, { from: [x, y, team ? ZED - z : z] });
        expect(f.put).toBe(false);
        expect(f.state.hp).toBe(spawn(0, world, 0, team).hp);
        expect(f.seconds).toBeLessThan(20);
      }
    }
  });

  it('stays out of the deep water: a flag out of its depth is waited for at the edge of the shallows', () => {
    // Dropped where nobody stands, 8 m past the last bed that is waded.
    const lost: FlagState = { state: FLAG.DROPPED, by: 0, x: 8, y: -2.2, z: 175, left: 600 };
    const f = flight(2, 0, 30, {
      from: [30, walked(30, 175), 175],
      sight: { flags: [home, lost] },
      done: () => false,
    });
    expect(f.put).toBe(false);
    expect(f.low).toBeGreaterThan(DEPTH + 0.2);
    expect(f.state.x).toBeLessThan(22);
    expect(Math.abs(f.state.z - 175)).toBeLessThan(4);
  });

  it('swims out of the lagoon by the sand when it falls in by a float, not at the float’s side', () => {
    // Off the edge of the shallows by red's first float, bound for blue's flag round the tail: in
    // the water the float's top, 1.45 m over a swimmer's feet, is the nearest floor but no way out.
    const f = flight(4, 0, 30, {
      from: [18, walked(18, ZED - 105.6), ZED - 105.6],
      done: p => p.z < MID - 5,
    });
    expect(f.put).toBe(false);
    expect(f.at).toBe('lagoon');
    expect(f.seconds).toBeLessThan(15);
  });

  it('jumps onto a box a little too high to step onto: the pack on the panel by the hold’s door', () => {
    const pack = BEACH.packs![2];
    const [x, , z] = pack;
    // 0.59 m over the level sand east of it: more than a step.
    expect(pack[1] - ground(world, x + 2, z)).toBeGreaterThan(STEP_H + 0.05);
    const f = flight(1, 0, 10, {
      from: [58, ground(world, 58, 143), 143],
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
    // One match is one draw: the first capture came after 106 s, 172 s and 335 s as the map and
    // the bots changed, so the match is given 15 minutes.
    for (let k = 0; k < 60 * 900 && !score; k++) {
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
