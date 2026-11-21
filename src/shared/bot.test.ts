import { describe, expect, it, vi } from 'vitest';
import { Bot, personaOf, squad } from './bot';
import { step, STRIKE } from './gun';
import type { Seen } from './bot';
import { KITS, ROLE } from './kit';
import type { Kit } from './kit';
import { HIGHLINE } from './map';
import { MOON } from './moon';
import { ROUTES, navBuilt, navOf, path } from './nav';
import * as navigation from './nav';
import { move, spawn } from './physics';
import { decodeSnapshot } from './protocol';
import type { ServerText } from './protocol';
import { Room } from './room';
import { EV, FLAG, KEY, MODE, TEX } from './types';
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

  it('tells a player who watches a bot what it is up to, ten times a second, until he stops', () => {
    const room = new Room({ bots: 2 });
    const a = join(room);
    const bot = roster(a).players.find(p => p.bot)!;
    room.receive(a, JSON.stringify({ t: 'watch', id: bot.id }));
    ticks(room, 60);
    const views = a.texts.filter(m => m.t === 'bot');
    expect(views.length).toBe(10);
    const v = views.at(-1)!;
    expect(v).toMatchObject({ id: bot.id, why: expect.any(String), doing: expect.any(String) });
    if (v.t === 'bot') {
      expect(v.path.length).toBeGreaterThan(0);
      expect(v.next).toBeLessThan(v.path.length);
    }
    room.receive(a, JSON.stringify({ t: 'watch' }));
    ticks(room, 60);
    expect(a.texts.filter(m => m.t === 'bot')).toHaveLength(10);
  });

  it('points its view at the first point of no way before it plans one', () => {
    expect(new Bot(0).view()).toMatchObject({ path: [], next: 0, doing: 'no way' });
  });

  it('builds no bot view while nobody watches', () => {
    const view = vi.spyOn(Bot.prototype, 'view');
    const room = new Room({ bots: 8 });
    join(room);
    ticks(room, 60);
    expect(view).not.toHaveBeenCalled();
    view.mockRestore();
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

  it('gives the bots the marine, the ninja and the xenomorph in turn, by name', () => {
    const room = new Room({ bots: 4 });
    const a = join(room);
    const bots = roster(a).players.filter(p => p.bot);
    expect(bots.map(p => [p.name, p.role])).toEqual([
      ['Ada (bot)', ROLE.MARINE],
      ['Bix (bot)', ROLE.NINJA],
      ['Cog (bot)', ROLE.XENO],
    ]);
  });

  for (const [name, role] of [
    ['ninja', ROLE.NINJA],
    ['xenomorph', ROLE.XENO],
  ] as const) {
    it(`plays a ${name} bot that takes the enemy flag across HIGHLINE and brings it home`, () => {
      const room = new Room({ bots: 2 });
      const a = join(room);
      for (const p of room['players']()) {
        if (p.bot) {
          p.info.role = role;
        }
      }
      for (let s = 0; s < 180 && !(a.bins.length && snap(a).score[1]); s++) {
        ticks(room, 60);
      }
      expect(snap(a).score).toEqual([0, 1]);
    });
  }

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
        expect(there.at(-1)!.to).toEqual(blue.base);
        expect(there.filter(st => st.leg).length).toBeGreaterThan(2);
        // The route it prefers is the one it takes.
        const routes = there.flatMap(st => (st.edge && st.edge.route! >= 0 ? [st.edge.route] : []));
        expect(routes.every(r => r === k)).toBe(true);
      }
      const back = path(nav, w, blue.base, red.base, k);
      expect(back.at(-1)!.to).toEqual(red.base);
    }
  });

  it('runs up to a jump that wants it along the run of its route', () => {
    const [x, y, z] = red.spawns[0];
    const way = path(nav, w, [x, y, z], blue.base, 0);
    const runs = way.filter(
      (st, k) => st.leg?.k === 'leap' && st.leg.sprint && way[k - 1]?.leg?.k === 'go',
    );
    expect(runs.length).toBeGreaterThan(0);
  });

  it('finds a way on the moon from each spawn to the other flag', () => {
    const m = build(MOON);
    const [r, b] = MOON.teams;
    for (const [x, y, z] of r.spawns) {
      expect(path(navOf(m), m, [x, y, z], b.base).at(-1)!.to).toEqual(b.base);
    }
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

  /** Where a red bot of the kit `kit` with no gun wants to be, a blue player 10 m to its left. */
  const goal = (kit: Kit) => {
    const world = build(arena([]));
    const bot = new Bot(0);
    const me = { id: 0, team: 0, state: { ...spawn(0, world, 0, 0), ammo: -1 } };
    const foe = { id: 1, team: 1, state: { ...spawn(1, world, 0, 1), x: -10, z: 10 } };
    bot.think({ me, others: [foe], flags: [home, home], world, kit });
    return bot['goal'];
  };

  it('goes at an enemy close by with the claws, and for the flag with a gun', () => {
    expect(goal(KITS[ROLE.XENO])).toEqual([-10, 0, 10]);
    expect(goal(KITS[ROLE.MARINE])).toEqual([0, 0, -40]);
  });

  it('pursues enemies with the katana and mixes normal and special attacks', () => {
    const world = build(arena([]));
    const kit = KITS[ROLE.NINJA];
    const bot = new Bot(0);
    const me = { id: 0, team: 0, state: { ...spawn(0, world, 0, 0, kit), ammo: 20, mag: 6 } };
    const foe = { id: 1, team: 1, state: { ...me.state, id: 1, z: me.state.z - 1.4 } };
    let attacks = 0;
    for (let i = 0; i < 90; i++) {
      const intent = bot.think({ me, others: [foe], flags: [home, home], world, kit });
      expect(intent.keys & KEY.BLADE).toBe(KEY.BLADE);
      attacks |= intent.keys & (KEY.FIRE | KEY.SPECIAL);
    }
    expect(attacks).toBe(KEY.FIRE | KEY.SPECIAL);
    expect(bot.view().why).toBe('hunt');
  });

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
    const steps = path(
      navOf(world),
      world,
      [me.state.x, me.state.y, me.state.z],
      HIGHLINE.teams[1].base,
      0,
    );
    const step = steps.findIndex(st => st.leg?.k === 'leap');
    expect(steps[step - 1].leg?.k).toBe('go');
    Object.assign(bot, {
      steps,
      step,
      goal,
      plannedWhy: 'chase carrier',
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
    const me = {
      id,
      team: 0,
      state: {
        ...spawn(id, world, 0, 0),
        x,
        y,
        z,
        ammo: 10,
        mag: 5,
        blade: true,
        rifle: 10,
        rail: 10,
      },
    };
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
        .flatMap(st => (st.leg?.k === 'leap' ? [st.leg] : []))
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

  it('never walks into the void its goal lies over, for ten seconds', () => {
    // A slab ending 1 m ahead (north), its goal past it over the void.
    const world = build(
      def([{ min: [-50, -5, 9], max: [50, 0, 50], top: TEX.TILE, side: TEX.BRICK }]),
    );
    const bot = new Bot(0);
    const me = { id: 0, team: 0, state: { ...spawn(0, world, 0, 0), ammo: 10, mag: 5 } };
    let low = Infinity;
    for (let k = 0; k < 600; k++) {
      const i = bot.think({ me, others: [], flags: [home, home], world });
      move(me.state, { ...i, seq: k }, world, 0);
      low = Math.min(low, me.state.y);
    }
    expect(low).toBeGreaterThan(-0.01);
  });
});

describe('nav: off the ways', () => {
  it('finds a way across the map to a rack off the marked routes', () => {
    const w = build(HIGHLINE);
    const [x, y, z] = HIGHLINE.teams[1].spawns[0];
    const way = path(navOf(w), w, [x, y, z], HIGHLINE.teams[0].rack!);
    expect(way.length).toBeGreaterThan(5);
    const [gx, , gz] = way.at(-1)!.to;
    const [rx, , rz] = HIGHLINE.teams[0].rack!;
    expect(Math.hypot(gx - rx, gz - rz)).toBeLessThan(1.5);
  });

  it('finds a way from the middle of a tower’s stair', () => {
    const w = build(HIGHLINE);
    const way = path(navOf(w), w, [56.8, 24.2, 227], [98, 14.5, 131]);
    expect(way.at(-1)!.to).toEqual([98, 14.5, 131]);
  });
});

describe('Bot: after UT2004', () => {
  const slab: Brush = { min: [-50, -5, -50], max: [50, 0, 50], top: TEX.TILE, side: TEX.BRICK };
  const world = build({
    brushes: [slab],
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

  it('draws a character from the id, the same every time, sharper with the skill', () => {
    expect(personaOf(3, 4)).toEqual(personaOf(3, 4));
    expect(personaOf(3, 4)).not.toEqual(personaOf(4, 4));
    const [novice, godlike] = [personaOf(3, 0), personaOf(3, 7)];
    expect(godlike.miss).toBeLessThan(novice.miss);
    expect(godlike.react).toBeLessThan(novice.react);
    expect(godlike.turn).toBeGreaterThan(novice.turn);
    expect(godlike.duck).toBeGreaterThan(novice.duck);
    expect(godlike.shake).toBeLessThan(novice.shake);
    expect(godlike.lead).toBeGreaterThan(novice.lead);
    expect(godlike.track).toBeGreaterThan(novice.track);
    expect(godlike.warn).toBeLessThanOrEqual(novice.warn);
    expect(godlike.warn).toBeGreaterThanOrEqual(1);
  });

  // A red bot standing at its base with blue's flag: nowhere to go, so a dash can only be out of a ball's way.
  const there = () => ({
    id: 0,
    team: 0,
    state: { ...spawn(0, world, 0, 0), x: 0, z: 40, ammo: 10, mag: 5 },
  });
  const carried: FlagState = { ...home, state: FLAG.CARRIED, by: 0 };
  /** A blue ball 8 m north of the bot at chest height, flying south at it. */
  const ball = (id: number) => ({
    id,
    by: 1,
    team: 1,
    x: 0,
    y: 1.1,
    z: 32,
    dx: 0,
    dy: 0,
    dz: 1,
    burst: false,
    left: 99,
  });

  /** How many of 20 balls shot straight at a red bot standing still it dashes away from. */
  const ducks = (skill: number) => {
    const bot = new Bot(0, skill);
    const me = there();
    let n = 0;
    for (let k = 0; k < 20; k++) {
      const i = bot.think({ me, others: [], flags: [home, carried], world, balls: [ball(k)] });
      if (i.keys & KEY.DASH) {
        n++;
        // Across the ball's way (east or west), not along it.
        expect(i.keys & (KEY.LEFT | KEY.RIGHT)).not.toBe(0);
      }
    }
    return n;
  };

  it('dashes out of the way of the balls coming at it, more often the more skilled', () => {
    expect(ducks(7)).toBeGreaterThan(ducks(0));
    expect(ducks(7)).toBeGreaterThanOrEqual(14);
  });

  it('ignores its own team’s balls and those that will miss it', () => {
    const bot = new Bot(0, 7);
    const me = there();
    const mate = { ...ball(1), team: 0, by: 2 };
    const wide = { ...ball(2), x: 3 };
    for (let k = 0; k < 10; k++) {
      const i = bot.think({ me, others: [], flags: [home, carried], world, balls: [mate, wide] });
      expect(i.keys & KEY.DASH).toBe(0);
    }
  });

  it('strafes both ways in a fight, and jumps or dashes aside now and then', () => {
    const bot = new Bot(5);
    const me = { id: 5, team: 0, state: { ...spawn(0, world, 0, 0), ammo: 60, mag: 10 } };
    const foe = { id: 1, team: 1, state: spawn(1, world, 0, 1) };
    let keys = 0;
    for (let k = 0; k < 600; k++) {
      keys |= bot.think({ me, others: [foe], flags: [home, home], world }).keys;
      me.state.held = 0;
    }
    expect(keys & KEY.LEFT && keys & KEY.RIGHT).toBeTruthy();
    expect(keys & (KEY.JUMP | KEY.DASH)).not.toBe(0);
  });
});

describe('Bot: a fair fight', () => {
  const world = build({
    brushes: [{ min: [-50, -5, -50], max: [50, 0, 50], top: TEX.TILE, side: TEX.TILE }],
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

  /**
   * How far off a blue player each shot of a red bot at z 10, looking `yaw`, goes, radians, over
   * `ticks`: the player stands still at (x, z), 10 m ahead by default.
   */
  const shots = (
    o: { x?: number; z?: number; yaw?: number; id?: number; ticks?: number; shots?: number } = {},
    hunters?: ReadonlyMap<number, readonly number[]>,
    bot = new Bot(o.id ?? 0, 7),
  ): number[] => {
    const id = o.id ?? 0;
    const me = {
      id,
      team: 0,
      state: {
        ...spawn(0, world, 0, 0),
        yaw: o.yaw ?? 0,
        ammo: 60,
        mag: 30,
        shots: o.shots ?? 0,
      },
    };
    const [x, z] = [o.x ?? 0, o.z ?? 0];
    const foe = { id: 9, team: 1, state: { ...spawn(1, world, 0, 1), x, z } };
    const want = Math.atan2(-(x - me.state.x), -(z - me.state.z));
    const offs: number[] = [];
    for (let k = 0; k < (o.ticks ?? 240); k++) {
      const i = bot.think({ me, others: [foe], flags: [home, home], world, hunters });
      me.state.yaw = i.yaw;
      me.state.held = 0;
      if (i.keys & KEY.FIRE) {
        // A u8 on the wire, as step() counts it.
        me.state.shots = (me.state.shots + 1) & 255;
        offs.push(Math.abs(Math.atan2(Math.sin(i.yaw - want), Math.cos(i.yaw - want))));
      }
    }
    return offs;
  };

  it('fires its first shots past a new enemy, then at him', () => {
    const offs = shots();
    const { warn } = personaOf(0, 7);
    expect(offs.length).toBeGreaterThan(warn + 5);
    // 1.6 m beside him at 10 m is 0.16 rad off.
    expect(offs.slice(0, warn).every(a => a > 0.12)).toBe(true);
    const rest = offs.slice(warn);
    expect(rest.reduce((a, b) => a + b, 0) / rest.length).toBeLessThan(0.06);
  });

  it.each([
    [KEY.RAIL, STRIKE.RAIL, 10, { rail: 240, cap: 80 }],
    [KEY.RIFLE, STRIKE.LASER, 42, { rifle: 30, clip: 10 }],
  ] as const)(
    'fires a loaded heavy weapon without plasma and finishes its warnings',
    (key, strike, distance, load) => {
      const bot = new Bot(0, 7);
      const me = { id: 0, team: 0, state: { ...spawn(0, world, 0, 0), ammo: -1, mag: 0, ...load } };
      const foe = { id: 9, team: 1, state: { ...spawn(1, world, 0, 1), z: 10 - distance } };
      const firing: boolean[] = [];
      for (let seq = 0; seq < 180; seq++) {
        const intent = bot.think({ me, others: [foe], flags: [home, home], world });
        const fired = step(
          me.state,
          { ...intent, keys: intent.keys & (KEY.FIRE | key), seq },
          world,
          0,
        );
        if (fired === strike) {
          firing.push(bot.hunting === foe.id);
        }
      }
      const { warn } = personaOf(0, 7);
      expect(firing.slice(0, warn)).toEqual(Array(warn).fill(false));
      expect(firing.slice(warn)).toContain(true);
      if (key === KEY.RAIL) {
        expect(me.state.shots).toBe(0);
      }
    },
  );

  it('counts its warning shots across the wrap of the shot count', () => {
    const offs = shots({ shots: 254 });
    const { warn } = personaOf(0, 7);
    expect(offs.slice(0, warn).every(a => a > 0.12)).toBe(true);
    const rest = offs.slice(warn);
    expect(rest.reduce((a, b) => a + b, 0) / rest.length).toBeLessThan(0.06);
  });

  it('holds no token while it still reacts to an enemy it meets again', () => {
    const bot = new Bot(0, 7);
    shots({ ticks: 120 }, undefined, bot);
    expect(bot.hunting).toBe(9);
    bot.think({
      me: { id: 0, team: 0, state: spawn(0, world, 0, 0) },
      others: [],
      flags: [home, home],
      world,
    });
    // Back in sight: no warning shot for him, but its reaction runs again before it shoots.
    shots({ ticks: 1 }, undefined, bot);
    expect(bot.hunting).toBe(-1);
  });

  it('warns no enemy again that it has just fought', () => {
    const bot = new Bot(0, 7);
    shots({ ticks: 120 }, undefined, bot);
    // Out of sight a tick (behind a teammate's back, say), then back: no new warning.
    bot.think({
      me: { id: 0, team: 0, state: spawn(0, world, 0, 0) },
      others: [],
      flags: [home, home],
      world,
    });
    const offs = shots({ ticks: 120 }, undefined, bot);
    expect(offs[0]).toBeLessThan(0.12);
  });

  it('sees ahead and hears close by, but never shoots one behind its back it has not met', () => {
    // 20 m behind it.
    expect(shots({ z: 30, yaw: 0 })).toEqual([]);
    // 4 m behind it: heard.
    expect(shots({ z: 14, yaw: 0 }).length).toBeGreaterThan(0);
    // 20 m ahead.
    expect(shots({ z: -10, yaw: 0 }).length).toBeGreaterThan(0);
  });

  it('shoots past an enemy two of its team already shoot to hit', () => {
    const { warn } = personaOf(5, 7);
    const busy = shots({ id: 5 }, new Map([[9, [2, 3]]])).slice(warn);
    expect(busy.length).toBeGreaterThan(5);
    expect(busy.every(a => a > 0.12)).toBe(true);
    // Two of higher ids give way to it.
    const free = shots({ id: 5 }, new Map([[9, [7, 8]]])).slice(warn);
    expect(free.reduce((a, b) => a + b, 0) / free.length).toBeLessThan(0.06);
  });
});

describe('Bot: team play', () => {
  const world = build({
    brushes: [{ min: [-50, -5, -50], max: [50, 0, 50], top: TEX.TILE, side: TEX.TILE }],
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
  const carried = (by: number): FlagState => ({ ...home, state: FLAG.CARRIED, by });
  /** A player of `team` at (x, z), a bot unless said. */
  const at = (id: number, team: number, x: number, z: number, more: Partial<Seen> = {}): Seen => ({
    id,
    team,
    state: { ...spawn(team, world, id, team), x, z, ammo: 10, mag: 5 },
    bot: true,
    ...more,
  });
  // Four red bots strung along x at z 0, two blue ones.
  const reds = () => [at(0, 0, -30, 0), at(1, 0, -10, 0), at(2, 0, 10, 0), at(3, 0, 30, 0)];

  it('sends the half of the team nearest to the enemy who has our flag after him, the rest on', () => {
    const blue = at(9, 1, 35, 5);
    const { roles } = squad(0, [...reds(), blue], [carried(9), home], world);
    expect([0, 1, 2, 3].map(id => roles.get(id))).toEqual(['attack', 'attack', 'chase', 'chase']);
  });

  it('breaks equal distances by bot id, regardless of roster order', () => {
    const team = [at(7, 0, -10, 0), at(2, 0, 10, 0)];
    const { roles } = squad(0, [...team, at(9, 1, 0, 0)], [carried(9), home], world);
    expect(roles.get(2)).toBe('chase');
    expect(roles.get(7)).toBe('attack');
  });

  it('chases with all but an escort when both flags are out: no capture till ours is home', () => {
    const team = [...reds(), at(4, 0, 0, 20)];
    const { roles } = squad(0, [...team, at(9, 1, 35, 5)], [carried(9), carried(4)], world);
    expect([0, 1, 2, 3].map(id => roles.get(id)).sort()).toEqual([
      'chase',
      'chase',
      'chase',
      'escort',
    ]);
    // The carrier has none: he runs home.
    expect(roles.has(4)).toBe(false);
  });

  it('breaks a flag standoff between the last two bots at their bases', () => {
    const room = new Room({ bots: 3, botSkill: 7 }, world.def);
    const client = join(room);
    for (const p of room['players']()) {
      if (!p.bot) {
        p.state.down = 9999;
        continue;
      }
      const [x, y, z] = world.def.teams[p.info.team].base;
      p.info.role = ROLE.MARINE;
      Object.assign(p.state, { x, y, z, ammo: 30, mag: 6 });
      room['ctf'].flags[1 - p.info.team] = carried(p.info.id);
    }
    ticks(room, 10 * 60);
    expect(snap(client).flags.every(f => f.state === FLAG.CARRIED)).toBe(true);
    for (let s = 10; s < 40 && snap(client).flags.every(f => f.state === FLAG.CARRIED); s++) {
      ticks(room, 60);
    }
    expect(snap(client).flags.some(f => f.state !== FLAG.CARRIED)).toBe(true);
  });

  it('prioritises recovering its flag over a nearby enemy and health pack', () => {
    const bot = new Bot(0);
    const me = at(0, 0, 0, 10);
    me.state.hp = 2;
    const decoy = at(1, 1, 0, 3);
    const carrier = at(2, 1, 0, -10);
    const sight = {
      me,
      others: [decoy, carrier],
      flags: [carried(carrier.id), home],
      world,
      kit: KITS[ROLE.XENO],
      packs: [[8, 0, 10] as [number, number, number]],
    };
    bot.think(sight);
    expect(bot.view()).toMatchObject({ why: 'chase carrier', path: [[0, 0, -10]] });
    // The drop is close enough to reuse the chase path, but the new objective needs its own point.
    sight.flags[0] = { ...home, state: FLAG.DROPPED, z: -8 };
    bot.think(sight);
    expect(bot.view()).toMatchObject({ why: 'return flag', path: [[0, 0, -8]] });
  });

  it('escorts its carrier with the two nearest, guards home with one', () => {
    const team = [...reds(), at(4, 0, 12, 0)];
    const { roles } = squad(0, team, [home, carried(4)], world);
    // The carrier at x 12: bots 2 (x 10) and 3 (x 30); bot 1 is the nearest left to red's base.
    expect([0, 1, 2, 3].map(id => roles.get(id))).toEqual(['attack', 'guard', 'escort', 'escort']);
  });

  it('sends the nearest free bot to a teammate who is low with an enemy on him', () => {
    const human = at(5, 0, 20, 10, { bot: undefined });
    human.state.hp = 2;
    const { roles, trouble } = squad(0, [...reds(), human, at(9, 1, 25, 12)], [home, home], world);
    expect(trouble?.id).toBe(5);
    expect([...roles].filter(([, r]) => r === 'help')).toEqual([[2, 'help']]);
    // Healthy again: no help.
    human.state.hp = 8;
    expect([
      ...squad(0, [...reds(), human, at(9, 1, 25, 12)], [home, home], world).roles.values(),
    ]).not.toContain('help');
  });

  it('takes the role the room hands it', () => {
    const bot = new Bot(0);
    const me = at(0, 0, 0, 10);
    bot.think({
      me,
      others: [],
      flags: [home, home],
      world,
      squad: { roles: new Map([[0, 'guard']]) },
    });
    expect(bot.view().why).toBe('guard');
  });

  it('goes for a health pack close by when it is low', () => {
    const bot = new Bot(0);
    const me = at(0, 0, 0, 10);
    me.state.hp = 2;
    bot.think({ me, others: [], flags: [home, home], world, packs: [[8, 0, 10]] });
    expect(bot.view().why).toBe('health');
    me.state.hp = 8;
    bot.think({ me, others: [], flags: [home, home], world, packs: [[8, 0, 10]] });
    expect(bot.view().why).toBe('take flag');
  });

  it('does not take a Hunter’s cannon charging (`rail`) for a rail gun', () => {
    const world = build(HIGHLINE);
    const bot = new Bot(0);
    const me = at(0, 0, 43, 156);
    Object.assign(me.state, { y: 19, ammo: 10, rail: 40, cap: 3 });
    const kit = KITS[ROLE.HUNTER];
    expect(bot.think({ me, others: [], flags: [home, home], world, kit }).keys & KEY.RAIL).toBe(0);
  });

  it('seeks a nearby missing rifle, then equips it, while a carrier goes home', () => {
    const world = build(HIGHLINE);
    const bot = new Bot(0);
    const me = at(0, 0, 43, 156);
    me.state.y = 19;
    me.state.ammo = 10;
    me.state.blade = true;
    bot.think({ me, others: [], flags: [home, home], world });
    expect(bot.view().why).toBe('rifle rack');
    me.state.rifle = 10;
    expect(bot.think({ me, others: [], flags: [home, home], world }).keys & KEY.RIFLE).toBeTruthy();
    me.state.rail = 10;
    expect(bot.think({ me, others: [], flags: [home, home], world }).keys & KEY.RAIL).toBeTruthy();
    bot.think({ me, others: [], flags: [home, carried(me.id)], world });
    expect(bot.view().why).toBe('flag home');
  });

  it.each([
    [
      HIGHLINE,
      240,
      [
        ['rifle', 43, 19, 156],
        ['rail', 18, 26, 145],
      ],
    ],
    [
      MOON,
      280,
      [
        ['rifle', 145, 0, 194],
        ['rail', 43, 0, 164],
      ],
    ],
  ] as const)('walks to the distant racks and picks up their weapons', (def, zed, starts) => {
    const world = build(def);
    for (const team of [0, 1]) {
      for (const [name, x, y, z] of starts) {
        const bot = new Bot(team);
        const me = at(team, team, x, team ? zed - z : z);
        Object.assign(me.state, { y, ammo: 10, blade: true });
        for (let k = 0; k < 600 && (me.state[name] ?? -1) < 0; k++) {
          const intent = bot.think({ me, others: [], flags: [home, home], world });
          step(me.state, { ...intent, seq: k }, world, team);
        }
        expect(me.state[name], `${name}, team ${team}`).toBeGreaterThan(0);
      }
    }
  });

  it('paces failed rack searches and waits for the floor before searching again', () => {
    const world = build(MOON);
    const bot = new Bot(0);
    const me = at(0, 0, 31, 155);
    Object.assign(me.state, { y: 0, ammo: 10, blade: true, rifle: 10, rail: -1 });
    const search = vi.spyOn(navigation, 'path');
    const scans = () =>
      search.mock.calls.filter(([, , , goal]) => goal === MOON.teams[0].rail).length;
    try {
      for (let k = 0; k < 10; k++) {
        bot.think({ me, others: [], flags: [home, home], world });
      }
      expect(scans()).toBe(1);
      me.state.ground = false;
      for (let k = 0; k < 60; k++) {
        bot.think({ me, others: [], flags: [home, home], world });
      }
      expect(scans()).toBe(1);
      me.state.ground = true;
      bot.think({ me, others: [], flags: [home, home], world });
      expect(scans()).toBe(2);
    } finally {
      search.mockRestore();
    }
  });

  it('fights the enemy on its carrier before a nearer one', () => {
    const bot = new Bot(0);
    const me = at(0, 0, 0, 10);
    const carrier = at(4, 0, 6, -8, { bot: undefined });
    // A blue 8 m ahead, and one 4 m off the carrier, 18 m ahead.
    const near = at(8, 1, -2, 2);
    const onHim = at(9, 1, 6, -6);
    bot.think({ me, others: [carrier, near, onHim], flags: [home, carried(4)], world });
    expect(bot.view().foe).toBe(9);
  });
});

describe('Bot: the guard', () => {
  for (const def of [HIGHLINE, MOON]) {
    it(`walks a round about its flag on ${def.name}, watching the ways in at each point, never falling`, () => {
      const world = build(def);
      const home: FlagState = { state: FLAG.HOME, by: 0, x: 0, y: 0, z: 0, left: 0 };
      for (const team of [0, 1]) {
        const bot = new Bot(team ? 3 : 4);
        const base = def.teams[team].base;
        const me = {
          id: team ? 3 : 4,
          team,
          state: {
            ...spawn(team, world, 0, team),
            x: base[0],
            y: base[1],
            z: base[2],
            ammo: 10,
            mag: 5,
          },
        };
        const squad = { roles: new Map([[me.id, 'guard' as const]]) };
        const posts = new Set<string>();
        let far = 0;
        // The ways in: where the ways from the enemy's base, one by route, come within 12 m.
        const nav = navOf(world);
        const ins = [-1, 0, 1, 2].map(r =>
          [
            def.teams[1 - team].base,
            ...path(nav, world, def.teams[1 - team].base, base, r).map(st => st.to),
          ]
            .reverse()
            .find(q => Math.hypot(q[0] - base[0], q[2] - base[2]) > 12)!,
        );
        let [watch, stood] = [0, 0];
        for (let k = 0; k < 60 * 60; k++) {
          const i = bot.think({ me, others: [], flags: [home, home], world, squad });
          move(me.state, { ...i, seq: k & 0xffff }, world, team);
          expect(me.state.ev & EV.RESPAWN).toBe(0);
          far = Math.max(far, Math.hypot(me.state.x - base[0], me.state.z - base[2]));
          posts.add(bot.view().path.at(-1)!.join());
          if (k > 120 && Math.hypot(me.state.vx, me.state.vz) < 0.3) {
            stood++;
            // Its look within 0.7 rad of one of them (the sweep is 0.35 either side).
            watch += +ins.some(
              q =>
                Math.cos(me.state.yaw - Math.atan2(-(q[0] - me.state.x), -(q[2] - me.state.z))) >
                Math.cos(0.7),
            );
          }
        }
        expect(stood).toBeGreaterThan(600);
        expect(watch / stood).toBeGreaterThan(0.8);
        expect(posts.size).toBeGreaterThanOrEqual(4);
        expect(far).toBeLessThan(8);
        expect(far).toBeGreaterThan(3);
      }
    });
  }
});
