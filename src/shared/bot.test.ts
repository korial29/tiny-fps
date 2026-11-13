import { describe, expect, it } from 'vitest';
import { Bot } from './bot';
import { HIGHLINE } from './map';
import { MOON } from './moon';
import { ROUTES, navBuilt, navOf, path } from './nav';
import { move, spawn } from './physics';
import { decodeSnapshot } from './protocol';
import type { ServerText } from './protocol';
import { Room } from './room';
import { FLAG, KEY, MODE, TEX } from './types';
import type { Conn, FlagState, Snapshot } from './types';
import { build } from './world';
import type { Brush, World, WorldDef } from './world';

/** A peer that records what the room sends it. */
const peer = () => {
  const texts: ServerText[] = [];
  const bins: ArrayBuffer[] = [];
  const conn: Conn & { texts: ServerText[]; bins: ArrayBuffer[] } = {
    texts,
    bins,
    send: data => (typeof data === 'string' ? texts.push(JSON.parse(data)) : bins.push(data)),
  };
  return conn;
};
type Peer = ReturnType<typeof peer>;

const roster = (c: Peer) => {
  const r = c.texts.filter(m => m.t === 'roster').pop();
  if (r?.t !== 'roster') {
    throw new Error('no roster');
  }
  return r;
};
const snap = (c: Peer): Snapshot => decodeSnapshot(c.bins.at(-1)!)!;

const join = (room: Room, name = 'a'): Peer => {
  const c = peer();
  room.connect(c);
  room.receive(c, JSON.stringify({ t: 'join', name }));
  return c;
};

const ticks = (room: Room, n: number): void => {
  for (let k = 0; k < n; k++) {
    room.tick();
  }
};

/** Red's and blue's players in a roster: how many of each, bots or not. */
const sides = (c: Peer) => {
  const { players } = roster(c);
  return [0, 1].map(t => players.filter(p => p.team === t).length);
};

describe('Room: bots', () => {
  it('fills the room up to rules.bots once a person joins, the teams even', () => {
    const room = new Room({ bots: 4 });
    const a = join(room, 'me');
    const { players, host, you } = roster(a);
    expect(players).toHaveLength(4);
    expect(players.filter(p => p.bot).map(p => p.name)).toEqual([
      'Ada (bot)',
      'Bix (bot)',
      'Cog (bot)',
    ]);
    expect(players.find(p => p.id === you)).not.toHaveProperty('bot');
    expect(sides(a)).toEqual([2, 2]);
    // A bot never hosts, and a room of bots alone is empty.
    expect(host).toBe(you);
    expect(room.size).toBe(1);
  });

  it('gives a joiner a bot’s place, and the bot’s back when he leaves', () => {
    const room = new Room({ bots: 4 });
    const a = join(room, 'a');
    const b = join(room, 'b');
    expect(roster(b).players).toHaveLength(4);
    expect(roster(b).players.filter(p => p.bot)).toHaveLength(2);
    expect(sides(b)).toEqual([2, 2]);
    room.disconnect(b);
    expect(roster(a).players).toHaveLength(4);
    expect(roster(a).players.filter(p => p.bot)).toHaveLength(3);
    expect(sides(a)).toEqual([2, 2]);
  });

  it('lets people beyond rules.bots in with no bot left, and takes the bots away with the last person', () => {
    const room = new Room({ bots: 2 });
    const [a, b, c] = [join(room, 'a'), join(room, 'b'), join(room, 'c')];
    expect(roster(c).players.filter(p => p.bot)).toEqual([]);
    expect(roster(c).players).toHaveLength(3);
    [a, b, c].forEach(p => room.disconnect(p));
    expect(room.size).toBe(0);
    // Nobody is left, no bot either: the next person gets the first id.
    const d = join(room, 'd');
    expect(roster(d).you).toBe(0);
    expect(roster(d).players).toHaveLength(2);
  });

  it('sends one roster for a join and the bots it brings', () => {
    const room = new Room({ bots: 8 });
    const a = join(room);
    expect(a.texts.filter(m => m.t === 'roster')).toHaveLength(1);
    expect(roster(a).players).toHaveLength(8);
  });

  it('gives a joiner no id a bot let go of in the same tick', () => {
    const room = new Room({ bots: 4 });
    join(room, 'a');
    const gone = roster(join(room, 'b'));
    const ids = gone.players.map(p => p.id);
    // The bot that made room had id 3: the joiner is drawn as nobody's old self.
    expect(ids).not.toContain(3);
    expect(gone.you).toBe(4);
  });

  it('names a bot by the first name no bot here bears', () => {
    const room = new Room({ bots: 4 });
    const a = join(room, 'a');
    const b = join(room, 'b');
    room.disconnect(b);
    const bots = roster(a)
      .players.filter(p => p.bot)
      .map(p => p.name);
    expect(bots.sort()).toEqual(['Ada (bot)', 'Bix (bot)', 'Cog (bot)']);
  });

  it('builds the bots’ map when the room loads its world, not in a tick', () => {
    const world = (r: Room) => (r as unknown as { world: World }).world;
    expect(navBuilt(world(new Room({ bots: 2 })))).toBe(true);
    expect(navBuilt(world(new Room()))).toBe(false);
  });

  it('takes no bot without the rule', () => {
    const room = new Room();
    const a = join(room);
    expect(roster(a).players).toHaveLength(1);
  });

  it('plays a bot that takes the enemy flag across HIGHLINE and brings it home', () => {
    const room = new Room({ bots: 2 });
    const a = join(room);
    let took = false;
    for (let s = 0; s < 120 && !(a.bins.length && snap(a).score[1]); s++) {
      ticks(room, 60);
      took ||= snap(a).flags[0].state === FLAG.CARRIED;
    }
    expect(took).toBe(true);
    expect(snap(a).score).toEqual([0, 1]);
  });

  it('plays bots that take a flag on the moon', () => {
    const room = new Room({ bots: 2, map: 'tranquility' });
    const a = join(room);
    let took = false;
    for (let s = 0; s < 120 && !took; s++) {
      ticks(room, 60);
      took = snap(a).flags[0].state !== FLAG.HOME;
    }
    expect(took).toBe(true);
  });

  it('keeps a match of bots going without a fault', () => {
    const room = new Room({ bots: 8 });
    const a = join(room);
    ticks(room, 60 * 120);
    const { players } = snap(a);
    expect(players).toHaveLength(8);
    expect(players.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe('nav', () => {
  const w = build(HIGHLINE);
  const nav = navOf(w);
  const [red, blue] = HIGHLINE.teams;

  it('finds a way from every red spawn to the blue flag and back by each route', () => {
    for (const [k] of ROUTES.entries()) {
      for (const [x, y, z] of red.spawns) {
        const there = path(nav, w, [x, y, z], blue.base, k);
        expect(there.entry).toBeDefined();
        expect(there.edges.length).toBeGreaterThan(5);
        // The route it prefers is the one it takes.
        expect(there.edges.filter(e => e.route >= 0).every(e => e.route === k)).toBe(true);
      }
      const back = path(nav, w, blue.base, red.base, k);
      expect(back.edges.length).toBeGreaterThan(5);
    }
  });

  it('never walks straight onto the take-off of a jump that wants a run-up', () => {
    const [x, y, z] = red.spawns[0];
    const way = path(nav, w, [x, y, z], blue.base, 0);
    expect(nav.runUp.size).toBeGreaterThan(0);
    for (const [i, e] of way.edges.entries()) {
      if (nav.runUp.has(e.to)) {
        expect(way.edges[i + 1]?.leg?.k).toBe('leap');
        expect(e.leg).toBeDefined();
      }
    }
  });

  it('has lanes on the moon from each spawn to the other flag', () => {
    const m = build(MOON);
    const [r, b] = MOON.teams;
    const [x, y, z] = r.spawns[0];
    expect(path(navOf(m), m, [x, y, z], b.base).edges.length).toBeGreaterThan(3);
  });
});

describe('Bot: the gun', () => {
  const slab: Brush = { min: [-50, -5, -50], max: [50, 0, 50], top: TEX.TILE, side: TEX.BRICK };
  const arena = (brushes: Brush[]): WorldDef => ({
    brushes: [slab, ...brushes],
    teams: [
      { base: [0, 0, 40], spawns: [[0, 0, 10, 0]] },
      { base: [0, 0, -40], spawns: [[0, 0, -10, Math.PI]] },
    ],
    floor: -20,
    sun: { dir: [0, 1, 0], color: [1, 1, 1] },
    sky: [
      [0, 0, 1],
      [1, 1, 1],
    ],
  });
  const home: FlagState = { state: FLAG.HOME, by: 0, x: 0, y: 0, z: 0, left: 0 };

  /** Whether a red bot with the gun fires at a blue player 20 m ahead within a second. */
  const fires = (brushes: Brush[]): boolean => {
    const world = build(arena(brushes));
    const bot = new Bot(0);
    const me = { id: 0, team: 0, state: { ...spawn(0, world, 0, 0), ammo: 10, mag: 5 } };
    const foe = { id: 1, team: 1, state: spawn(1, world, 0, 1) };
    let fired = false;
    for (let k = 0; k < 60; k++) {
      const i = bot.think({ me, others: [foe], flags: [home, home], world });
      fired ||= (i.keys & KEY.FIRE) !== 0;
    }
    return fired;
  };

  it('shoots an enemy in sight, not through a wall', () => {
    expect(fires([])).toBe(true);
    expect(fires([{ min: [-5, 0, -1], max: [5, 4, 1], top: TEX.TILE, side: TEX.BRICK }])).toBe(
      false,
    );
  });
});

describe('Bot: the keys of a leg', () => {
  const world = build(HIGHLINE);
  const home: FlagState = { state: FLAG.HOME, by: 0, x: 0, y: 0, z: 0, left: 0 };

  it('keeps forward in the air when it has no way yet, to clear the gap it jumped', () => {
    const me = {
      id: 0,
      team: 0,
      state: { ...spawn(0, world, 0, 0), ground: false, mode: MODE.AIR },
    };
    const i = new Bot(0).think({ me, others: [], flags: [home, home], world });
    expect(i.keys & KEY.FORWARD).toBe(KEY.FORWARD);
  });

  it('keeps the sprint of a jump’s run-up with the enemy carrier in sight', () => {
    const me = { id: 0, team: 0, state: { ...spawn(0, world, 0, 0), ammo: 10, mag: 5 } };
    // Blue's player with red's flag, 10 m behind on the same roof.
    const foe = { id: 1, team: 1, state: { ...spawn(1, world, 0, 1), x: 16, y: 26, z: 246 } };
    const carried: FlagState = { ...home, state: FLAG.CARRIED, by: 1 };
    const bot = new Bot(0);
    const goal = [foe.state.x, foe.state.y, foe.state.z];
    // On the Spine's run-up to its 11 m jump: the leg after the run to it.
    const way = path(
      navOf(world),
      world,
      [me.state.x, me.state.y, me.state.z],
      HIGHLINE.teams[1].base,
      0,
    );
    expect(way.edges[1].leg?.k).toBe('leap');
    Object.assign(bot, {
      nav: navOf(world),
      way,
      leg: 1,
      goal,
      planned: 0,
      last: [me.state.x, me.state.y, me.state.z],
    });
    const i = bot.think({ me, others: [foe], flags: [carried, home], world });
    expect(i.keys & KEY.SPRINT).toBe(KEY.SPRINT);
  });
});

describe('Bot: on the moon', () => {
  const world = build(MOON);
  const home: FlagState = { state: FLAG.HOME, by: 0, x: 0, y: 0, z: 0, left: 0 };

  /** A red bot of this id flown from a point with the real physics: the lowest it went and where it ended. */
  const flight = (id: number, [x, y, z]: [number, number, number], secs: number) => {
    const me = { id, team: 0, state: { ...spawn(id, world, 0, 0), x, y, z, ammo: 10, mag: 5 } };
    const bot = new Bot(id);
    let low = Infinity;
    for (let k = 0; k < secs * 60 && me.state.z > 110; k++) {
      const i = bot.think({ me, others: [], flags: [home, home], world });
      move(me.state, { ...i, seq: k & 0xffff }, world, 0);
      low = Math.min(low, me.state.y);
    }
    return { low, z: me.state.z };
  };

  it('crosses the rille by the east stones, jumping from stone to stone', () => {
    // Id 2 prefers the third route: the stones.
    const { low, z } = flight(2, [128.5, 0, 158], 30);
    expect(low).toBeGreaterThan(-1);
    expect(z).toBeLessThanOrEqual(110);
  });

  it('crosses the rille by the west long jump, if need be by the far lip and a climb', () => {
    const { low, z } = flight(1, [18, 0, 195], 30);
    // Hanging from the lip, the feet are 2 m under it.
    expect(low).toBeGreaterThan(-3);
    expect(z).toBeLessThanOrEqual(110);
  });

  it('spreads the bots over the bridge, the west jump and the east stones', () => {
    const nav = navOf(world);
    const [r, b] = MOON.teams;
    const [x, y, z] = r.spawns[0];
    const legs = [0, 1, 2].map(k =>
      path(nav, world, [x, y, z], b.base, k)
        .edges.flatMap(e => (e.leg?.k === 'leap' ? [e.leg] : []))
        .map(l => l.to.join(',')),
    );
    expect(legs[0]).toEqual([]);
    expect(legs[1]).toEqual(['18,125']);
    expect(legs[2]).toHaveLength(4);
  });
});

describe('Bot: in a fight', () => {
  const ledge: Brush = { min: [-1, -5, -50], max: [50, 0, 50], top: TEX.TILE, side: TEX.BRICK };
  const def = (brushes: Brush[]): WorldDef => ({
    brushes,
    teams: [
      { base: [0, 0, 40], spawns: [[0, 0, 10, 0]] },
      { base: [0, 0, -40], spawns: [[0, 0, -10, Math.PI]] },
    ],
    floor: -20,
    sun: { dir: [0, 1, 0], color: [1, 1, 1] },
    sky: [
      [0, 0, 1],
      [1, 1, 1],
    ],
  });
  const home: FlagState = { state: FLAG.HOME, by: 0, x: 0, y: 0, z: 0, left: 0 };

  /** The keys of a red bot with the gun, facing a blue player 20 m ahead, over a second. */
  const keys = (world: World, flags: FlagState[] = [home, home]) => {
    const bot = new Bot(0);
    const me = { id: 0, team: 0, state: { ...spawn(0, world, 0, 0), ammo: 10, mag: 5 } };
    const foe = { id: 1, team: 1, state: spawn(1, world, 0, 1) };
    return Array.from({ length: 60 }, () => bot.think({ me, others: [foe], flags, world }).keys);
  };

  it('steps aside while it shoots, never toward a drop', () => {
    // The slab ends 1 m to its left (west, at x = -1): the void.
    const ks = keys(build(def([ledge])));
    expect(ks.some(k => k & KEY.FIRE)).toBe(true);
    expect(ks.some(k => k & KEY.RIGHT)).toBe(true);
    expect(ks.some(k => k & KEY.LEFT)).toBe(false);
  });

  it('carries the flag home at a sprint, not stopping to shoot', () => {
    const world = build(def([{ ...ledge, min: [-50, -5, -50] }]));
    const theirs: FlagState = { ...home, state: FLAG.CARRIED, by: 0 };
    const ks = keys(world, [home, theirs]);
    expect(ks.some(k => k & KEY.FIRE)).toBe(false);
    expect(ks.every(k => k & KEY.SPRINT)).toBe(true);
  });

  it('stops at the edge of the void it was walking into', () => {
    // A slab ending 1 m ahead (north), its goal past it over the void.
    const world = build(
      def([{ min: [-50, -5, 9], max: [50, 0, 50], top: TEX.TILE, side: TEX.BRICK }]),
    );
    const bot = new Bot(0);
    const me = { id: 0, team: 0, state: { ...spawn(0, world, 0, 0), ammo: 10, mag: 5 } };
    const i = bot.think({ me, others: [], flags: [home, home], world });
    expect(i.keys & KEY.FORWARD).toBe(0);
  });
});

describe('nav: off the ways', () => {
  it('finds a way from the middle of a tower’s stair', () => {
    const w = build(HIGHLINE);
    const way = path(navOf(w), w, [56.8, 24.2, 227], [98, 14.5, 131]);
    expect(way.entry).toBeDefined();
  });
});
