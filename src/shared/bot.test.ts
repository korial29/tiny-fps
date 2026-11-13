import { describe, expect, it } from 'vitest';
import { Bot } from './bot';
import { HIGHLINE } from './map';
import { MOON } from './moon';
import { ROUTES, navOf, path } from './nav';
import { spawn } from './physics';
import { decodeSnapshot } from './protocol';
import type { ServerText } from './protocol';
import { Room } from './room';
import { FLAG, KEY, TEX } from './types';
import type { Conn, FlagState, Snapshot } from './types';
import { build } from './world';
import type { Brush, WorldDef } from './world';

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
      'Bix (bot)',
      'Cog (bot)',
      'Dot (bot)',
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
