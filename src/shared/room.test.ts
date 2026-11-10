import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACCEL,
  END_SCREEN,
  FLAG_RETURN,
  HP_MAX,
  INPUT_BURST,
  MAX_NAME,
  MAX_PLAYERS,
  MAX_REWIND,
  PLAYER_R,
  RUN_SPEED,
  SNAP_EVERY,
  TEAM_COLOR,
  TICK_HZ,
  BOLT,
  BOLT_SPEED,
  RIFLE_HITS,
} from './constants';
import { HIGHLINE } from './map';
import { MOON } from './moon';
import { respawn, stumble } from './physics';
import { decodeSnapshot, encodeInput } from './protocol';
import type { ServerText } from './protocol';
import { Room } from './room';
import { ROVER, park, seat } from './rover';
import { FLAG, KEY, MODE, NOBODY, TEAM, TEX } from './types';
import type { Conn, Every, Input, PlayerState, Rover, Snapshot } from './types';
import { build } from './world';
import type { Spawn, WorldDef } from './world';
import { loaded } from '../../test/loaded';
import { duo } from '../../test/teams';

/** Metres run in n steps of forward from a stand, with the ground acceleration. */
const ramp = (n: number): number => {
  let [v, d] = [0, 0];
  for (let k = 0; k < n; k++) {
    v = Math.min(RUN_SPEED, v + ACCEL / TICK_HZ);
    d += v / TICK_HZ;
  }
  return d;
};

/** Eight spawns on the slab, 4 m or more apart, for each team: the red ones near the origin, the blue ones 60 m east. */
const SPAWNS: Spawn[] = [
  [4, 1, 4, (3 * Math.PI) / 2],
  [4, 1, 12, (3 * Math.PI) / 2],
  [8, 1, 8, (3 * Math.PI) / 2],
  [12, 1, 4, (3 * Math.PI) / 2],
  [12, 1, 12, (3 * Math.PI) / 2],
  [2, 1, 8, (3 * Math.PI) / 2],
  [8, 1, 2, (3 * Math.PI) / 2],
  [8, 1, 14, (3 * Math.PI) / 2],
];

/** A flat 200 m slab at y = 1, with eight spawns for each team and their flags 60 m apart on the line red spawn 0 faces. */
const ARENA: WorldDef = {
  brushes: [{ min: [-100, -5, -100], max: [100, 1, 100], top: TEX.TILE, side: TEX.BRICK }],
  teams: [
    { base: [-30, 1, 4], spawns: SPAWNS },
    { base: [30, 1, 4], spawns: SPAWNS.map(([x, y, z, yaw]): Spawn => [x + 60, y, z, yaw]) },
  ],
  floor: -20,
  sun: { dir: [0, 1, 0], color: [1, 1, 1] },
  sky: [
    [0, 0, 1],
    [1, 1, 1],
  ],
};

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
const names = (c: Peer): string[] => roster(c).players.map(p => p.name);
const snap = (c: Peer): Snapshot => decodeSnapshot(c.bins.at(-1)!)!;

const join = (room: Room, name: unknown = 'a'): Peer => {
  const c = peer();
  room.connect(c);
  room.receive(c, JSON.stringify({ t: 'join', name }));
  return c;
};

const input = (seq: number, keys = 0, yaw = 0): ArrayBuffer =>
  encodeInput({ seq, keys, yaw, pitch: 0 } satisfies Input);

const ticks = (room: Room, n: number): void => {
  for (let k = 0; k < n; k++) {
    room.tick();
  }
};

describe('Room: joining', () => {
  it('sends every joined peer the roster with its own id, on every join and leave', () => {
    const room = new Room({}, ARENA);
    const a = join(room, 'Ann');
    expect(roster(a)).toMatchObject({ you: 0 });
    expect(names(a)).toEqual(['Ann']);

    const b = join(room, 'Bob');
    expect(roster(a).you).toBe(0);
    expect(roster(b).you).toBe(1);
    expect(names(a)).toEqual(['Ann', 'Bob']);
    expect(roster(a).players).toEqual(roster(b).players);

    room.disconnect(a);
    expect(names(b)).toEqual(['Bob']);
    expect(roster(b).you).toBe(1);
    expect(room.size).toBe(1);
  });

  it('sends nothing before the join, and ignores a second join and bad text', () => {
    const room = new Room({}, ARENA);
    const c = peer();
    room.connect(c);
    room.receive(c, 'nope');
    room.receive(c, '{"t":"other"}');
    expect(c.texts).toEqual([]);
    room.receive(c, JSON.stringify({ t: 'join', name: 'a' }));
    room.receive(c, JSON.stringify({ t: 'join', name: 'b' }));
    expect(names(c)).toEqual(['a']);
    expect(room.size).toBe(1);
  });

  it('keeps names unique and clean, within MAX_NAME', () => {
    const room = new Room({}, ARENA);
    const a = join(room, 'Bob');
    join(room, 'Bob');
    join(room, '  Bob ');
    join(room, 'x'.repeat(40));
    join(room, 'x'.repeat(40));
    join(room, '');
    join(room, 42);
    join(room, 'a\u0000\n b\t c');
    expect(names(a)).toEqual([
      'Bob',
      'Bob 2',
      'Bob 3',
      'x'.repeat(MAX_NAME),
      'x'.repeat(MAX_NAME - 2) + ' 2',
      'Player 5',
      'Player 6',
      'a b c',
    ]);
  });

  it('gives each player the smallest free id and the colour of its team', () => {
    const room = new Room({}, ARENA);
    const a = join(room, 'a');
    for (let n = 1; n < MAX_PLAYERS; n++) {
      join(room, `p${n}`);
    }
    const { players } = roster(a);
    expect(players.map(p => p.id)).toEqual([...players.keys()]);
    for (const p of players) {
      expect(p.color).toBe(TEAM_COLOR[p.team]);
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(TEAM_COLOR[0]).not.toBe(TEAM_COLOR[1]);

    // The room is full: told so, and the roster does not change.
    const late = join(room, 'late');
    expect(late.texts).toEqual([{ t: 'full' }]);
    expect(roster(a).players).toHaveLength(MAX_PLAYERS);
    expect(room.size).toBe(MAX_PLAYERS);

    // A freed id goes to the next one.
    room.disconnect(a);
    const b = join(room, 'b');
    expect(roster(b).you).toBe(0);
    expect(roster(b).players[0]).toMatchObject({ id: 0, name: 'b' });
  });

  it('honours rules.maxPlayers', () => {
    const room = new Room({ maxPlayers: 2 }, ARENA);
    join(room, 'a');
    join(room, 'b');
    expect(join(room, 'c').texts).toEqual([{ t: 'full' }]);
  });

  it('spawns at the first spawn of the team with nobody within 2 m, else round-robin', () => {
    const [red, blue] = ARENA.teams.map(t => t.spawns);
    const room = new Room({ maxPlayers: 40 }, ARENA);
    const a = join(room);
    ticks(room, SNAP_EVERY);
    const at = (c: Peer, id: number) => snap(c).players.find(p => p.id === id)!;
    expect([at(a, 0).x, at(a, 0).z, at(a, 0).yaw]).toEqual([red[0][0], red[0][2], red[0][3]]);
    // On the floor of the start room (1 m), not at 0: the host would drop him through it.
    expect(at(a, 0)).toMatchObject({ y: 1, vy: 0, ground: true });
    // The second joiner is blue and starts at the first blue spawn.
    const b = join(room);
    ticks(room, SNAP_EVERY);
    expect([at(b, 1).x, at(b, 1).z, at(b, 1).yaw]).toEqual([blue[0][0], blue[0][2], blue[0][3]]);

    // Walk away from red spawn 0 and back in: the next red joiner takes spawn 0 again.
    for (let k = 0; k < 60; k++) {
      room.receive(a, input(k, KEY.RIGHT));
      room.tick();
    }
    const c = join(room);
    ticks(room, SNAP_EVERY);
    expect(at(c, 2)).toMatchObject({ x: red[0][0], z: red[0][2] });

    // A team's next joiners take its spawns in turn: nobody within 2 m of anyone on his side.
    for (let n = 3; n < 2 * red.length; n++) {
      join(room);
    }
    ticks(room, SNAP_EVERY);
    const ps = snap(a).players;
    for (const p of ps) {
      for (const q of ps) {
        if (p !== q) {
          expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(2);
        }
      }
    }
    // Every spawn point of a team is taken or within 2 m of a player: the next joiners still get one.
    for (let n = 0; n < 4; n++) {
      join(room);
    }
    ticks(room, SNAP_EVERY);
    expect(snap(a).players).toHaveLength(2 * red.length + 4);
  });
});

describe('Room: the map', () => {
  it('plays HIGHLINE unless it is given another map', () => {
    const room = new Room();
    const a = join(room);
    ticks(room, SNAP_EVERY);
    // On red's tower, at its first spawn.
    expect(snap(a).players[0]).toMatchObject({
      x: HIGHLINE.teams[0].spawns[0][0],
      y: HIGHLINE.teams[0].spawns[0][1],
      z: HIGHLINE.teams[0].spawns[0][2],
      ground: true,
    });
    const other = new Room({}, ARENA);
    const b = join(other);
    ticks(other, SNAP_EVERY);
    expect(snap(b).players[0]).toMatchObject({ x: ARENA.teams[0].spawns[0][0], y: 1 });
  });

  it('builds the map of the rules, and tells its key in the roster', () => {
    expect(roster(join(new Room())).map).toBe('highline');
    const moon = new Room({ map: 'tranquility' });
    const a = join(moon);
    expect(roster(a).map).toBe('tranquility');
    ticks(moon, SNAP_EVERY);
    expect(snap(a).players[0]).toMatchObject({
      x: MOON.teams[0].spawns[0][0],
      z: MOON.teams[0].spawns[0][2],
    });
  });

  it('plays HIGHLINE on an unknown key', () => {
    expect(roster(join(new Room({ map: 'nowhere' }))).map).toBe('highline');
  });
});

describe('Room: the host picks the map', () => {
  const pick = (room: Room, c: Peer, map: unknown) =>
    room.receive(c, JSON.stringify({ t: 'map', map }));

  it('takes the pick of the host only, a known map, and tells everyone', () => {
    const room = new Room();
    const [a, b] = [join(room, 'Ann'), join(room, 'Bob')];
    expect(roster(b)).toMatchObject({ host: 0, map: 'highline' });
    expect(roster(b).next).toBeUndefined();
    const sent = b.texts.length;
    pick(room, b, 'tranquility');
    pick(room, a, 'nowhere');
    pick(room, a, '__proto__');
    pick(room, a, 7);
    expect(b.texts).toHaveLength(sent);
    pick(room, a, 'tranquility');
    expect(roster(b)).toMatchObject({ host: 0, map: 'highline', next: 'tranquility' });
    // Picking the map played takes the pick back.
    pick(room, a, 'highline');
    expect(roster(b).next).toBeUndefined();
  });

  it('hands the host over to the oldest player left, whose pick then counts', () => {
    const room = new Room();
    const [a, b, c] = [join(room, 'Ann'), join(room, 'Bob'), join(room, 'Cid')];
    room.disconnect(b);
    // A new player takes the free id 1, but Cid has been there longer.
    const d = join(room, 'Dan');
    room.disconnect(a);
    expect(roster(d).host).toBe(2);
    pick(room, d, 'tranquility');
    expect(roster(c).next).toBeUndefined();
    pick(room, c, 'tranquility');
    expect(roster(d).next).toBe('tranquility');
  });

  it('plays the pick from the next match on, never in the middle of one', () => {
    const room = new Room({ timeLimit: 2 });
    const a = join(room, 'Ann');
    pick(room, a, 'tranquility');
    ticks(room, 2 * TICK_HZ);
    expect(snap(a)).toMatchObject({ over: true });
    expect(roster(a)).toMatchObject({ map: 'highline', next: 'tranquility' });
    // Still on red's tower of Highline for the whole end screen.
    ticks(room, END_SCREEN * TICK_HZ - SNAP_EVERY);
    expect(snap(a).players[0]).toMatchObject({ z: HIGHLINE.teams[0].spawns[0][2] });
    ticks(room, 2 * SNAP_EVERY);
    expect(roster(a)).toMatchObject({ map: 'tranquility', host: 0 });
    expect(roster(a).next).toBeUndefined();
    expect(snap(a)).toMatchObject({ over: false, score: [0, 0], clock: 2 });
    expect(snap(a).players[0]).toMatchObject({
      x: MOON.teams[0].spawns[0][0],
      z: MOON.teams[0].spawns[0][2],
    });
  });

  it('plays the pick at the next join once the room is empty', () => {
    const room = new Room();
    const a = join(room, 'Ann');
    pick(room, a, 'tranquility');
    room.disconnect(a);
    const b = join(room, 'Bob');
    expect(roster(b)).toMatchObject({ map: 'tranquility', host: 0 });
    ticks(room, SNAP_EVERY);
    expect(snap(b).players[0]).toMatchObject({ x: MOON.teams[0].spawns[0][0] });
  });
});

describe('Room: inputs and snapshots', () => {
  it('moves a player with each input at once, and acks its seq', () => {
    const room = new Room({}, ARENA);
    const a = join(room);
    const [x0, z0] = [ARENA.teams[0].spawns[0][0], ARENA.teams[0].spawns[0][2]];
    ticks(room, SNAP_EVERY);
    // Nothing applied yet: seq 65535 is acked, the one before the client's first (0).
    expect(snap(a).players[0]).toMatchObject({ x: x0, z: z0, ack: 65535 });

    // Yaw 0 faces -z: 6 inputs forward, from a stand.
    for (let k = 0; k < 6; k++) {
      room.receive(a, input(k, KEY.FORWARD));
    }
    ticks(room, SNAP_EVERY);
    const p = snap(a).players[0];
    expect(p.ack).toBe(5);
    expect(p.z).toBeCloseTo(z0 - ramp(6), 2);
    expect(p.x).toBeCloseTo(x0, 2);
    expect(p.ground).toBe(true);
    expect(p.y).toBeCloseTo(1, 2);
  });

  it('applies jumps and gravity through the shared physics', () => {
    const room = new Room({}, ARENA);
    const a = join(room);
    room.receive(a, input(0, KEY.JUMP));
    ticks(room, SNAP_EVERY);
    expect(snap(a).players[0]).toMatchObject({ ground: false, ack: 0 });
    expect(snap(a).players[0].y).toBeGreaterThan(1.1);
    expect(snap(a).players[0].vy).toBeGreaterThan(6);
  });

  it('puts a player that walks off the world back at its spawn, standing', () => {
    // A 10 m island with the kill floor 20 m below.
    const island: WorldDef = {
      ...ARENA,
      brushes: [{ min: [-5, -5, -5], max: [5, 0, 5], top: TEX.TILE, side: TEX.BRICK }],
      teams: duo([[0, 0, 0, 0]]),
    };
    const room = new Room({}, island);
    const a = join(room);
    for (let k = 0; k < 300; k++) {
      room.receive(a, input(k, KEY.FORWARD, (3 * Math.PI) / 2));
      room.tick();
    }
    const ys = a.bins.map(b => decodeSnapshot(b)!.players[0]);
    // Down to the kill floor, then up again in one snapshot: standing at the spawn, 0.1 m on.
    const k = ys.findIndex((p, i) => i > 0 && p.y > ys[i - 1].y + 10);
    expect(Math.min(...ys.map(p => p.y))).toBeLessThan(-15);
    expect(k).toBeGreaterThan(0);
    expect(ys[k]).toMatchObject({ y: 0, vy: 0, ground: true });
    expect(Math.hypot(ys[k].x, ys[k].z)).toBeLessThan(0.3);
  });

  it('drops the inputs beyond the INPUT_BURST bank, unacked, and earns one per tick', () => {
    const room = new Room({}, ARENA);
    const a = join(room);
    for (let k = 0; k < INPUT_BURST + 5; k++) {
      room.receive(a, input(k, KEY.FORWARD));
    }
    ticks(room, SNAP_EVERY);
    // INPUT_BURST steps forward, the last acked seq is the INPUT_BURST-th.
    expect(snap(a).players[0].ack).toBe(INPUT_BURST - 1);
    expect(snap(a).players[0].z).toBeCloseTo(ARENA.teams[0].spawns[0][2] - ramp(INPUT_BURST), 2);

    // The two ticks above earned two inputs.
    for (let k = 0; k < 5; k++) {
      room.receive(a, input(100 + k, KEY.FORWARD));
    }
    ticks(room, SNAP_EVERY);
    expect(snap(a).players[0].ack).toBe(101);

    // The bank is capped: a long pause does not save up more than INPUT_BURST.
    ticks(room, 100);
    for (let k = 0; k < 30; k++) {
      room.receive(a, input(200 + k));
    }
    ticks(room, SNAP_EVERY);
    expect(snap(a).players[0].ack).toBe(200 + INPUT_BURST - 1);
  });

  it('keeps one bank per player and ignores frames from a peer that has not joined', () => {
    const room = new Room({}, ARENA);
    const a = join(room);
    const b = join(room);
    const lurker = peer();
    room.connect(lurker);
    room.receive(lurker, input(0, KEY.FORWARD));
    room.receive(peer(), input(0, KEY.FORWARD));
    for (let k = 0; k < INPUT_BURST; k++) {
      room.receive(a, input(k, KEY.FORWARD));
    }
    room.receive(b, input(0, KEY.FORWARD));
    ticks(room, SNAP_EVERY);
    const ps = snap(a).players;
    expect(ps.map(p => p.ack)).toEqual([INPUT_BURST - 1, 0]);
    expect(lurker.bins).toEqual([]);
  });

  it('ignores malformed binary frames', () => {
    const room = new Room({}, ARENA);
    const a = join(room);
    room.receive(a, new ArrayBuffer(3));
    room.receive(a, new ArrayBuffer(8));
    ticks(room, SNAP_EVERY);
    expect(snap(a).players[0]).toMatchObject({ ack: 65535, z: ARENA.teams[0].spawns[0][2] });
  });

  it('sends one snapshot every SNAP_EVERY ticks to every joined peer, and none to the others', () => {
    const room = new Room({}, ARENA);
    const a = join(room);
    const b = join(room);
    const lurker = peer();
    room.connect(lurker);
    ticks(room, SNAP_EVERY * 3 - 1);
    expect(a.bins).toHaveLength(2);
    room.tick();
    expect(a.bins).toHaveLength(3);
    expect(b.bins).toHaveLength(3);
    expect(lurker.bins).toHaveLength(0);
    expect(snap(a).tick).toBe(SNAP_EVERY * 3);
    expect(snap(a).players.map(p => p.id)).toEqual([0, 1]);
    // One buffer for all.
    expect(a.bins.at(-1)).toBe(b.bins.at(-1));
  });

  it('does not run without players, and drops a leaver from the next snapshot', () => {
    const room = new Room({}, ARENA);
    ticks(room, 10);
    const a = join(room);
    const b = join(room);
    ticks(room, SNAP_EVERY);
    expect(snap(a).players).toHaveLength(2);
    room.disconnect(b);
    ticks(room, SNAP_EVERY);
    expect(snap(a).players.map(p => p.id)).toEqual([0]);
    expect(b.bins).toHaveLength(1);
    // Unknown and repeated disconnects are harmless.
    room.disconnect(b);
    room.disconnect(peer());
    expect(names(a)).toEqual(['a']);
  });
});

describe('Room: timer', () => {
  afterEach(() => vi.restoreAllMocks());

  const timed = () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    let cb = (): void => {};
    const stop = vi.fn();
    const every = vi.fn<Every>((f, ms) => {
      cb = f;
      expect(ms).toBeCloseTo(1000 / TICK_HZ);
      return stop;
    });
    return { every, stop, advance: (ms: number) => ((now += ms), cb()) };
  };

  it('ticks at TICK_HZ whatever the timer jitter, and starts once', () => {
    const t = timed();
    const room = new Room({}, ARENA);
    const a = join(room);
    room.start(t.every);
    room.start(t.every);
    expect(t.every).toHaveBeenCalledTimes(1);
    // One second (and a ms) in uneven callbacks: 60 ticks, 30 snapshots.
    for (const ms of [5, 30, 12, 50, 1, 100, 300, 300, 203]) {
      t.advance(ms);
    }
    expect(a.bins).toHaveLength(TICK_HZ / SNAP_EVERY);
    expect(snap(a).tick).toBe(TICK_HZ);
  });

  it('replays at most a bounded catch-up after a stall, and stops', () => {
    const t = timed();
    const room = new Room({}, ARENA);
    const a = join(room);
    room.start(t.every);
    t.advance(10_000);
    expect(snap(a).tick).toBe(20);
    room.stop();
    room.stop();
    expect(t.stop).toHaveBeenCalledTimes(1);
    // It can start again.
    room.start(t.every);
    expect(t.every).toHaveBeenCalledTimes(2);
  });
});

describe('Room: rewind', () => {
  /** Two players, A (id 0, at rest) and B (id 1), and B's state in every snapshot A got. */
  const duel = (pre = 0) => {
    const room = new Room({}, ARENA);
    const a = join(room, 'A');
    const b = join(room, 'B');
    ticks(room, pre);
    let tick = pre;
    let seq = 0;
    /** B's state in every snapshot, by absolute tick. */
    const bAt = new Map<number, PlayerState>();
    let seen = 0;
    return {
      room,
      b,
      bAt,
      get tick() {
        return tick;
      },
      /** B runs sideways (+x) one step per tick for n ticks. */
      run: (n: number) => {
        for (let k = 0; k < n; k++) {
          room.receive(b, input(seq++ & 0xffff, KEY.RIGHT));
          room.tick();
          tick++;
          for (; seen < a.bins.length; seen++) {
            bAt.set(
              tick,
              decodeSnapshot(a.bins[seen])!.players.find(p => p.id === 1)!,
            );
          }
        }
      },
    };
  };

  /**
   * B as A's client would draw it at the absolute tick: its recorded states, kept and clamped
   * like the room does, interpolated linearly between the two snapshots around it.
   */
  const drawn = (d: ReturnType<typeof duel>, at: number): PlayerState => {
    const kept = [...d.bAt.keys()]
      .filter(t => t >= d.tick - MAX_REWIND && t <= d.tick)
      .sort((x, y) => x - y);
    const t = Math.min(Math.max(at, kept[0]), kept.at(-1)!);
    const lo = kept.filter(k => k <= t).at(-1)!;
    const hi = kept.find(k => k >= t)!;
    const [p, q] = [d.bAt.get(lo)!, d.bAt.get(hi)!];
    const u = hi > lo ? (t - lo) / (hi - lo) : 0;
    return { ...q, x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u, z: p.z + (q.z - p.z) * u };
  };

  /** What the room rewinds A's view to, checked against B as drawn at the tick `at`. */
  const rewound = (d: ReturnType<typeof duel>, at: number, view: number) => {
    const [got, ...more] = d.room.rewind(0, view);
    const want = drawn(d, at);
    expect(more).toEqual([]);
    expect(got.id).toBe(1);
    expect([got.x, got.y, got.z]).toEqual([want.x, want.y, want.z].map(v => expect.closeTo(v, 3)));
    return got;
  };

  it('puts the others where they were drawn at the view tick, not where they are now', () => {
    const d = duel();
    d.run(60);
    const got = rewound(d, d.tick - 20, d.tick - 20);
    // B has run 2 m since.
    expect(d.bAt.get(d.tick)!.x - got.x).toBeCloseTo(2, 3);
  });

  it('interpolates between the two snapshots around a fractional view', () => {
    const d = duel();
    d.run(60);
    const view = d.tick - 20 + 0.5;
    const got = rewound(d, view, view);
    // Not on a snapshot: B is halfway, 0.05 m past the earlier one.
    const lo = d.bAt.get(Math.floor(view / 2) * 2)!;
    expect(got.x - lo.x).toBeGreaterThan(0.04);
    expect(got.x - lo.x).toBeLessThan(0.11);
  });

  it('clamps a view older than MAX_REWIND to the oldest kept tick, and a future one to the newest', () => {
    // Ticks 82, 84, ... 112 are kept at 112: the oldest is 82.
    const old = duel();
    old.run(112);
    rewound(old, 0, old.tick - 100);
    const ahead = duel();
    ahead.run(80);
    rewound(ahead, ahead.tick + 6, ahead.tick + 6);
  });

  it('reads the view against the current tick on the u16 circle, across the wrap', () => {
    const d = duel(65520);
    d.run(50);
    // The host is at 65570: tick 34 on the wire. A view of 15 is 19 ticks back, at 65551.
    expect(d.tick).toBe(65570);
    rewound(d, 65570 - 19, 15);
    // A view still short of the wrap, with the host past it.
    const e = duel(65520);
    e.run(50);
    rewound(e, 65550, 65550);
  }, 60_000);

  it('leaves out the asker, and stands a player the history does not hold where it is', () => {
    const d = duel();
    expect(d.room.rewind(0, 0).map(p => p.id)).toEqual([1]);
    d.run(10);
    // C joins after the last snapshot: there is nothing to rewind it to.
    const c = join(d.room, 'C');
    const cState = d.room['peers'].get(c)!.state;
    expect(d.room.rewind(0, d.tick - 10).find(p => p.id === 2)).toEqual(cState);
  });
});

/** A 10 m island at y = 0 with the red spawn and flag on its west side, the blue ones on its east. */
const ISLE = (over: Partial<WorldDef> = {}): WorldDef => ({
  ...ARENA,
  brushes: [{ min: [-5, -5, -5], max: [5, 0, 5], top: TEX.TILE, side: TEX.BRICK }],
  teams: [
    { base: [-4, 0, 0], spawns: [[-3, 0, 0, (3 * Math.PI) / 2]] },
    { base: [3, 0, 0], spawns: [[3, 0, 3, (3 * Math.PI) / 2]] },
  ],
  ...over,
});

describe('Room: teams', () => {
  const teamOf = (c: Peer, id: number) => roster(c).players.find(p => p.id === id)!.team;

  it('puts each joiner in the smaller team, red when they are equal', () => {
    const room = new Room({}, ARENA);
    const peers = ['a', 'b', 'c', 'd', 'e'].map(n => join(room, n));
    expect(roster(peers[0]).players.map(p => p.team)).toEqual([0, 1, 0, 1, 0]);
    expect(roster(peers[0]).players.map(p => p.color)).toEqual(
      roster(peers[0]).players.map(p => TEAM_COLOR[p.team]),
    );
  });

  it('fills the smaller team after players leave, and leaves the others where they are', () => {
    const room = new Room({}, ARENA);
    const [a, b, , d] = ['a', 'b', 'c', 'd'].map(n => join(room, n));
    // Red 0 and 2, blue 1 and 3. Both blues leave: the next two joiners are blue, then it is a tie.
    room.disconnect(b);
    room.disconnect(d);
    expect(roster(a).players.map(p => [p.id, p.team])).toEqual([
      [0, 0],
      [2, 0],
    ]);
    const e = join(room, 'e');
    const f = join(room, 'f');
    const g = join(room, 'g');
    expect(roster(e).players.map(p => [p.id, p.team])).toEqual([
      [0, 0],
      [1, 1],
      [2, 0],
      [3, 1],
      [4, 0],
    ]);
    expect(teamOf(f, 3)).toBe(1);
    expect(teamOf(g, 4)).toBe(0);
  });

  it('starts every player on a spawn of his team, and puts him back there after a fall', () => {
    const isle = ISLE();
    const room = new Room({}, isle);
    const [a, b] = [join(room, 'a'), join(room, 'b')];
    ticks(room, SNAP_EVERY);
    const [red, blue] = isle.teams.map(t => t.spawns[0]);
    expect(snap(a).players.map(p => [p.x, p.z])).toEqual([
      [red[0], red[2]],
      [blue[0], blue[2]],
    ]);
    // The blue player runs off his island, falls, and is put back at a blue spawn.
    let seq = 0;
    const step = (keys: number) => {
      room.receive(b, input(seq++, keys, (3 * Math.PI) / 2));
      room.tick();
    };
    for (let k = 0; k < 400 && snap(a).players[1].y > -3; k++) {
      step(KEY.FORWARD);
    }
    expect(snap(a).players[1].y).toBeLessThan(-3);
    for (let k = 0; k < 120; k++) {
      step(0);
    }
    expect(snap(a).players[1]).toMatchObject({ x: blue[0], z: blue[2], y: 0, ground: true });
  });
});

describe('Room: capture the flag', () => {
  const EAST = (3 * Math.PI) / 2;
  const WEST = Math.PI / 2;
  /** Per peer, the next seq. */
  const seqs = new Map<Peer, number>();
  /** Drives a peer with forward at yaw, a tick per input, until the snapshot says done (or max). */
  const run = (room: Room, c: Peer, yaw: number, done: (s: Snapshot) => boolean, max = 1200) => {
    ticks(room, SNAP_EVERY);
    for (let k = 0; k < max && !done(snap(c)); k++) {
      const n = seqs.get(c) ?? 0;
      seqs.set(c, n + 1);
      room.receive(c, input(n, KEY.FORWARD, yaw));
      room.tick();
      room.tick();
    }
    return snap(c);
  };
  const flags = (c: Peer) => snap(c).flags;

  it('carries the score, the clock and both flags on every snapshot, flags home at the start', () => {
    const room = new Room({}, ARENA);
    const a = join(room);
    ticks(room, SNAP_EVERY);
    expect(snap(a)).toMatchObject({
      score: [0, 0],
      clock: 480,
      over: false,
      flags: [{ state: FLAG.HOME }, { state: FLAG.HOME }],
    });
    ticks(room, TICK_HZ);
    expect(snap(a).clock).toBe(479);
  });

  it('keeps the clock still with nobody in the room', () => {
    const room = new Room({}, ARENA);
    ticks(room, 10 * TICK_HZ);
    const a = join(room);
    ticks(room, SNAP_EVERY);
    expect(snap(a).clock).toBe(480);
  });

  it('lets a player take the enemy flag and carry it home for a capture with the real physics', () => {
    const room = new Room({}, ARENA);
    const a = join(room, 'Ann');
    run(room, a, EAST, s => s.flags[TEAM.BLUE].state === FLAG.CARRIED);
    expect(flags(a)).toMatchObject([{ state: FLAG.HOME }, { state: FLAG.CARRIED, by: 0 }]);
    // Home to the red flag, 60 m back: the capture sends the blue flag home.
    const done = run(room, a, WEST, s => s.score[0] > 0);
    expect(done.score).toEqual([1, 0]);
    expect(done.flags.map(f => f.state)).toEqual([FLAG.HOME, FLAG.HOME]);
  });

  it('does not score a carrier who gets home while his own flag is away', () => {
    const room = new Room({}, ARENA);
    const a = join(room, 'Ann');
    const b = join(room, 'Bob');
    run(room, a, EAST, s => s.flags[TEAM.BLUE].state === FLAG.CARRIED);
    // Bob is blue and runs west for the red flag, on the same line, and takes it.
    ticks(room, SNAP_EVERY);
    const bob = snap(b).players[1];
    expect(bob.x).toBeGreaterThan(60);
    run(room, b, WEST, s => s.flags[TEAM.RED].state === FLAG.CARRIED);
    expect(flags(a)[TEAM.RED]).toMatchObject({ state: FLAG.CARRIED, by: 1 });
    // Ann is home with the blue flag, and the red one is Bob's: no capture.
    run(room, a, WEST, s => s.players[0].x < -29, 1200);
    expect(snap(a).players[0].x).toBeLessThan(-29);
    expect(snap(a).score).toEqual([0, 0]);
    expect(flags(a)[TEAM.BLUE]).toMatchObject({ state: FLAG.CARRIED, by: 0 });
  });

  it('drops the flag where a carrier stood when he falls off the map, and returns it after FLAG_RETURN seconds', () => {
    const room = new Room({}, ISLE());
    const a = join(room, 'Ann');
    run(room, a, EAST, s => s.flags[TEAM.BLUE].state === FLAG.CARRIED);
    // On east: off the island's east edge, into the void, and back at the spawn.
    const s = run(room, a, EAST, s => s.flags[TEAM.BLUE].state === FLAG.DROPPED);
    const f = s.flags[TEAM.BLUE];
    expect(f.x).toBeGreaterThan(4);
    expect(f.x).toBeLessThan(6);
    expect([f.y, f.z]).toEqual([0, 0]);
    expect(f.left).toBe(FLAG_RETURN);
    expect(snap(a).players[0].y).toBeLessThan(0.5);
    // Nobody picks it up: it goes home by itself.
    ticks(room, FLAG_RETURN * TICK_HZ + SNAP_EVERY);
    expect(flags(a)[TEAM.BLUE].state).toBe(FLAG.HOME);
  });

  it('drops the flag where a carrier last stood when he leaves', () => {
    const room = new Room({}, ISLE());
    const a = join(room, 'Ann');
    const b = join(room, 'Bob');
    run(room, a, EAST, s => s.flags[TEAM.BLUE].state === FLAG.CARRIED);
    const { x } = snap(a).players[0];
    room.disconnect(a);
    ticks(room, SNAP_EVERY);
    expect(flags(b)[TEAM.BLUE]).toMatchObject({ state: FLAG.DROPPED, y: 0, z: 0 });
    expect(Math.abs(flags(b)[TEAM.BLUE].x - x)).toBeLessThan(0.3);
  });

  it('exposes drop(id) for the tackle: the carrier drops it where he stands, others have nothing to drop', () => {
    const room = new Room({}, ISLE());
    const a = join(room, 'Ann');
    run(room, a, EAST, s => s.flags[TEAM.BLUE].state === FLAG.CARRIED);
    const { x } = snap(a).players[0];
    expect(room.drop(7)).toBe(false);
    expect(room.drop(0)).toBe(true);
    expect(room.drop(0)).toBe(false);
    ticks(room, SNAP_EVERY);
    expect(flags(a)[TEAM.BLUE]).toMatchObject({ state: FLAG.DROPPED, y: 0, z: 0 });
    // The wire keeps a lying flag to 1/16 m.
    expect(Math.abs(flags(a)[TEAM.BLUE].x - x)).toBeLessThanOrEqual(1 / 32);
  });

  describe('the match', () => {
    it('ends at the score limit: tells everyone, shows the end screen, then starts a new match', () => {
      const room = new Room({ scoreLimit: 1 }, ARENA);
      const a = join(room, 'Ann');
      const b = join(room, 'Bob');
      run(room, a, EAST, s => s.flags[TEAM.BLUE].state === FLAG.CARRIED);
      run(room, a, WEST, s => s.over);
      for (const c of [a, b]) {
        expect(c.texts.filter(m => m.t === 'end')).toEqual([
          {
            t: 'end',
            score: [1, 0],
            players: [
              { id: 0, name: 'Ann', team: 0, caps: 1, returns: 0 },
              { id: 1, name: 'Bob', team: 1, caps: 0, returns: 0 },
            ],
          },
        ]);
      }
      expect(snap(b)).toMatchObject({ over: true, score: [1, 0], clock: END_SCREEN });
      // The end screen runs END_SCREEN seconds; then everyone is back at his spawn, scores clear.
      ticks(room, END_SCREEN * TICK_HZ + SNAP_EVERY);
      const s = snap(a);
      expect(s).toMatchObject({ over: false, score: [0, 0], clock: 480 });
      expect(s.flags.map(f => f.state)).toEqual([FLAG.HOME, FLAG.HOME]);
      const [red, blue] = ARENA.teams.map(t => t.spawns[0]);
      expect(s.players.map(p => [p.x, p.z])).toEqual([
        [red[0], red[2]],
        [blue[0], blue[2]],
      ]);
      expect(s.players.every(p => p.ground && p.vx === 0 && p.vz === 0)).toBe(true);
      // The next match counts from nothing: no second 'end' for the old captures.
      expect(a.texts.filter(m => m.t === 'end')).toHaveLength(1);
    });

    it('ends at the time limit with the draw or the team ahead', () => {
      const room = new Room({ timeLimit: 2 }, ARENA);
      const a = join(room, 'Ann');
      ticks(room, 2 * TICK_HZ);
      expect(a.texts.filter(m => m.t === 'end')).toEqual([
        {
          t: 'end',
          score: [0, 0],
          players: [{ id: 0, name: 'Ann', team: 0, caps: 0, returns: 0 }],
        },
      ]);
      expect(snap(a)).toMatchObject({ over: true, clock: END_SCREEN });
    });

    it('starts again from scratch when the room has been empty', () => {
      const room = new Room({ timeLimit: 60 }, ARENA);
      const a = join(room, 'Ann');
      ticks(room, 5 * TICK_HZ);
      expect(snap(a).clock).toBe(55);
      room.disconnect(a);
      const b = join(room, 'Bob');
      ticks(room, SNAP_EVERY);
      expect(snap(b)).toMatchObject({ clock: 60, score: [0, 0] });
    });
  });
});

describe('Room: the rovers', () => {
  const EAST = (3 * Math.PI) / 2;
  /** ARENA with a rover 2 m east of each team's first spawn, its nose to the east. */
  const LOT: WorldDef = {
    ...ARENA,
    rovers: [
      [6, 1, 4, EAST],
      [66, 1, 4, EAST],
    ],
  };
  const lot = build(LOT);
  const PARKED = park(lot);
  const who = (room: Room, c: Peer) => room['peers'].get(c)!;
  const st = (room: Room, c: Peer): PlayerState => who(room, c).state;
  const cars = (room: Room): Rover[] => room['rovers'];
  /** Per peer, the next seq. */
  const seqs = new Map<Peer, number>();
  /** `n` inputs of a peer, a tick after each. */
  const send = (room: Room, c: Peer, keys = 0, n = 1, yaw = EAST): void => {
    for (let k = 0; k < n; k++) {
      const seq = seqs.get(c) ?? 0;
      seqs.set(c, seq + 1);
      room.receive(c, input(seq, keys, yaw));
      room.tick();
    }
  };
  /** A press of USE, and its release. */
  const use = (room: Room, c: Peer): void => {
    send(room, c, KEY.USE);
    send(room, c);
  };
  /** Stands a player `dx` m east of rover 0's parking place. */
  const stand = (room: Room, c: Peer, dx = -2, dz = 0): void => {
    Object.assign(st(room, c), { x: 6 + dx, y: 1, z: 4 + dz, vx: 0, vz: 0 });
  };
  /** Ann (red, id 0) at the wheel of rover 0. */
  const driven = (def = LOT) => {
    const room = new Room({}, def);
    const a = join(room, 'Ann');
    use(room, a);
    return { room, a, r: cars(room)[0] };
  };

  it('boards the nearest rover on a press of USE, once however long it is held', () => {
    const room = new Room({}, LOT);
    const a = join(room, 'Ann');
    send(room, a, 0, 3);
    expect(st(room, a).mode).toBe(MODE.GROUND);
    send(room, a, KEY.USE);
    expect(st(room, a).mode).toBe(MODE.RIDE);
    expect(cars(room).map(r => r.driver)).toEqual([0, NOBODY]);
    // Held on: he stays in.
    send(room, a, KEY.USE, 30);
    expect(st(room, a).mode).toBe(MODE.RIDE);
    expect(cars(room)[0].driver).toBe(0);
    // Let go and pressed again: out, beside it.
    send(room, a);
    send(room, a, KEY.USE);
    expect(st(room, a).mode).not.toBe(MODE.RIDE);
    expect(cars(room)[0].driver).toBe(NOBODY);
    expect(Math.abs(st(room, a).z - cars(room)[0].z)).toBeGreaterThan(ROVER.RB);
    // Too far from any rover, a press does nothing.
    send(room, a);
    Object.assign(st(room, a), { x: 6, z: 4 + ROVER.ENTER_R + 0.5 });
    use(room, a);
    expect(st(room, a).mode).not.toBe(MODE.RIDE);
  });

  it("takes the rider's seat when the wheel is taken, and nothing when both are", () => {
    const { room } = driven();
    const [b, c] = [join(room, 'Bob'), join(room, 'Cid')];
    stand(room, b);
    use(room, b);
    expect(cars(room)[0]).toMatchObject({ driver: 0, rider: 1 });
    expect(st(room, b).mode).toBe(MODE.RIDE);
    stand(room, c);
    use(room, c);
    expect(cars(room)[0]).toMatchObject({ driver: 0, rider: 1 });
    expect(st(room, c).mode).toBe(MODE.GROUND);
    // The rider gets out on his own press; the driver stays.
    use(room, b);
    expect(cars(room)[0]).toMatchObject({ driver: 0, rider: NOBODY });
    expect(st(room, b).mode).not.toBe(MODE.RIDE);
  });

  it("drives it with the driver's inputs and leaves a driverless one to the tick", () => {
    const { room, a, r } = driven();
    const far = cars(room)[1];
    ticks(room, 30);
    const still = { ...r };
    // No input, no step: the driven rover waits for its driver whatever the ticks.
    ticks(room, 60);
    expect(r).toEqual(still);
    // His inputs alone move it, with no tick between them.
    for (let k = 0; k < 5; k++) {
      room.receive(a, input(100 + k, KEY.FORWARD, EAST));
    }
    expect(r.x).toBeGreaterThan(still.x);
    expect(r.vx).toBeGreaterThan(0.5);
    send(room, a, KEY.FORWARD, 60);
    expect(r.x).toBeGreaterThan(still.x + 3);
    // The other one, pushed with nobody in it, rolls on the ticks and brakes to a stop.
    far.vx = 5;
    ticks(room, 10);
    expect(far.x).toBeGreaterThan(66.3);
    ticks(room, 120);
    expect(Math.abs(far.vx)).toBeLessThan(0.01);
  });

  it('carries the rider with the rover, and lets him shoot', () => {
    const { room, a, r } = driven();
    const b = join(room, 'Bob');
    stand(room, b);
    use(room, b);
    Object.assign(st(room, b), loaded({ ammo: 10 }));
    send(room, a, KEY.FORWARD, 90);
    expect(r.x).toBeGreaterThan(12);
    const sat = { ...st(room, b) };
    seat(sat, r, 1);
    expect(st(room, b)).toMatchObject({ x: sat.x, y: sat.y, z: sat.z, mode: MODE.RIDE });
    // His own inputs turn his look and work his gun, and leave his body on the seat.
    send(room, b, KEY.FIRE | KEY.FORWARD, 1, 1);
    send(room, b, KEY.FORWARD, 1, 1);
    expect(st(room, b)).toMatchObject({ shots: 1, ammo: 9, x: sat.x, z: sat.z });
    expect(st(room, b).yaw).toBeCloseTo(1, 3);
    expect(room['balls']).toHaveLength(1);
  });

  it("does not fire the driver's own gun, but the rover's two lasers, a salvo each GUN_COOL inputs", () => {
    const { room, a } = driven();
    Object.assign(st(room, a), loaded({ ammo: 10 }));
    send(room, a, KEY.FIRE, 1);
    expect(st(room, a)).toMatchObject({ shots: 0, ammo: 10, charge: 0 });
    const balls = () => room['balls'].filter(b => !b.burst);
    expect(balls()).toHaveLength(2);
    expect(balls().every(b => b.power === BOLT && b.by === 0)).toBe(true);
    expect(new Set(balls().map(b => b.id)).size).toBe(2);
    // Held: nothing more until the cooldown is over, then the next salvo, named apart.
    send(room, a, KEY.FIRE, ROVER.GUN_COOL - 1);
    expect(balls()).toHaveLength(2);
    send(room, a, KEY.FIRE, 1);
    expect(balls()).toHaveLength(4);
    expect(new Set(balls().map(b => b.id)).size).toBe(4);
    // Let go: no more, and they fly at BOLT_SPEED.
    const [b] = balls();
    const x = b.x;
    send(room, a, 0, 6);
    expect(balls().length).toBeLessThanOrEqual(4);
    expect(Math.hypot(b.x - x, 0)).toBeGreaterThan((5 * BOLT_SPEED * Math.abs(b.dx)) / TICK_HZ);
  });

  it("grazes an enemy with the rover's bolts like the laser rifle's, and spares a teammate", () => {
    const { room, a, r } = driven();
    const b = join(room, 'Bob');
    const c = join(room, 'Cid');
    // Bob (blue) and Cid (red) where the beams cross, east of the rover.
    const feet = { y: 1, vx: 0, vz: 0 };
    Object.assign(st(room, b), feet, { x: r.x + ROVER.GUN_AIM - 4, z: r.z });
    Object.assign(st(room, c), feet, { x: r.x + ROVER.GUN_AIM - 8, z: r.z });
    expect(who(room, b).info.team).not.toBe(who(room, a).info.team);
    expect(who(room, c).info.team).toBe(who(room, a).info.team);
    send(room, a, KEY.FIRE, 1);
    send(room, a, 0, 40);
    // Two bolts in him: RIFLE_HITS of them take one hp.
    expect(st(room, b).hp).toBe(HP_MAX - 2 / RIFLE_HITS);
    expect(st(room, c).hp).toBe(HP_MAX);
    expect(st(room, a).hits).toBe(2);
  });

  it('frees the seat when the occupant leaves, goes down, respawns or disconnects', () => {
    const board = () => {
      const { room, a, r } = driven();
      const b = join(room, 'Bob');
      stand(room, b);
      use(room, b);
      expect(r).toMatchObject({ driver: 0, rider: 1 });
      return { room, a, b, r };
    };
    // Leaves.
    let { room, a, b, r } = board();
    use(room, a);
    expect(r).toMatchObject({ driver: NOBODY, rider: 1 });
    // Goes down: in the air where he sat, with the rover's speed.
    ({ room, a, b, r } = board());
    send(room, a, KEY.FORWARD, 60);
    room['harm'](who(room, a), HP_MAX);
    expect(r).toMatchObject({ driver: NOBODY, rider: 1 });
    expect(st(room, a).mode).toBe(MODE.AIR);
    expect(st(room, a).down).toBeGreaterThan(0);
    expect(st(room, a).vx).toBe(r.vx);
    room['harm'](who(room, b), HP_MAX);
    expect(r.rider).toBe(NOBODY);
    // Respawns, or is thrown off by a stumble: off the rover at the next pass.
    ({ room, a, b, r } = board());
    respawn(st(room, b), lot, 1);
    stumble(st(room, a), 0, 1);
    room.tick();
    expect(r).toMatchObject({ driver: NOBODY, rider: NOBODY });
    expect(st(room, b)).toMatchObject({ mode: MODE.GROUND, x: 64 });
    // Disconnects.
    ({ room, a, b, r } = board());
    room.disconnect(a);
    expect(r).toMatchObject({ driver: NOBODY, rider: 1 });
    room.disconnect(b);
    expect(cars(room)[0].rider).toBe(NOBODY);
  });

  it("does not seat a new joiner who takes a leaver's id", () => {
    const { room, a, r } = driven();
    const b = join(room, 'Bob');
    send(room, a, KEY.FORWARD, 30);
    room.disconnect(a);
    const c = join(room, 'Cid');
    expect(roster(c).you).toBe(0);
    expect(r.driver).toBe(NOBODY);
    expect(st(room, c).mode).toBe(MODE.GROUND);
    ticks(room, 120);
    const at = r.x;
    send(room, c, KEY.FORWARD, 30);
    expect(r.x).toBe(at);
    expect(st(room, c).x).toBeGreaterThan(4.5);
    expect(snap(b).rovers![0].driver).toBe(NOBODY);
  });

  it('parks the rovers again on a new match, a new map and an empty room', () => {
    // An empty room.
    let { room, a } = driven();
    send(room, a, KEY.FORWARD, 60);
    expect(cars(room)).not.toEqual(PARKED);
    room.disconnect(a);
    expect(cars(room)).toEqual(PARKED);
    // A new match: everyone on foot at his spawn.
    room = new Room({ timeLimit: 1 }, LOT);
    a = join(room, 'Ann');
    use(room, a);
    send(room, a, KEY.FORWARD, 40);
    ticks(room, (END_SCREEN + 1) * TICK_HZ);
    expect(snap(a).over).toBe(false);
    expect(cars(room).map(r => [r.x, r.z, r.vx, r.driver])).toEqual(
      PARKED.map(r => [r.x, r.z, 0, NOBODY]),
    );
    expect(st(room, a)).toMatchObject({ mode: MODE.GROUND, x: 4, z: 4 });
    // A new map: its own rovers.
    use(room, a);
    room.receive(a, JSON.stringify({ t: 'map', map: 'tranquility' }));
    ticks(room, (END_SCREEN + 1) * TICK_HZ + SNAP_EVERY);
    expect(roster(a).map).toBe('tranquility');
    expect(snap(a).rovers).toHaveLength(MOON.rovers!.length);
    expect(snap(a).rovers!.map(r => [r.x, r.z, r.driver])).toEqual(
      MOON.rovers!.map(([x, , z]) => [x, z, NOBODY]),
    );
    expect(st(room, a).mode).toBe(MODE.GROUND);
  });

  it('puts a rover that fell in the rille back on its spawn, its occupants at theirs', () => {
    const { room, a, r } = driven();
    const b = join(room, 'Bob');
    stand(room, b);
    use(room, b);
    // Over the edge of the slab.
    Object.assign(r, { x: 120, vx: 10 });
    for (let k = 0; k < 600 && (r.x !== PARKED[0].x || r.rider !== NOBODY); k++) {
      send(room, a, KEY.FORWARD);
    }
    ticks(room, 60);
    expect(r.x).toBe(PARKED[0].x);
    expect(r.z).toBe(PARKED[0].z);
    expect(r).toMatchObject({ driver: NOBODY, rider: NOBODY, vx: 0 });
    expect(st(room, a)).toMatchObject({ mode: MODE.GROUND, x: 4, y: 1, z: 4 });
    // Bob, id 1, at the blue spawn of his id.
    expect(st(room, b)).toMatchObject({ mode: MODE.GROUND, x: 64, y: 1, z: 12 });
  });

  it('lets the carrier ride, not drive, and gives no flag to a driver', () => {
    const room = new Room({}, LOT);
    const [a, b, c] = [join(room, 'Ann'), join(room, 'Bob'), join(room, 'Cid')];
    // Ann takes the blue flag on foot, then goes to the rover: the rider's seat, the wheel free.
    Object.assign(st(room, a), { x: 30, z: 4 });
    ticks(room, SNAP_EVERY);
    expect(snap(a).flags[TEAM.BLUE]).toMatchObject({ state: FLAG.CARRIED, by: 0 });
    stand(room, a);
    use(room, a);
    expect(cars(room)[0]).toMatchObject({ driver: NOBODY, rider: 0 });
    // With that seat taken, a second carrier gets nothing.
    room['ctf'].flags[TEAM.RED] = { ...room['ctf'].flags[TEAM.RED], state: FLAG.CARRIED, by: 1 };
    stand(room, b);
    use(room, b);
    expect(st(room, b).mode).toBe(MODE.GROUND);
    expect(cars(room)[0]).toMatchObject({ driver: NOBODY, rider: 0 });
    room['ctf'].reset();
    use(room, a);

    // Cid drives onto the blue flag's stand: it stays home. Ann, beside him, takes it.
    stand(room, c);
    use(room, c);
    expect(cars(room)[0].driver).toBe(2);
    Object.assign(cars(room)[0], { x: 30, z: 4 });
    send(room, c, 0, 20);
    expect(snap(a).flags[TEAM.BLUE].state).toBe(FLAG.HOME);
    Object.assign(st(room, a), { x: 30, z: 6.5 });
    send(room, a, KEY.USE);
    expect(cars(room)[0]).toMatchObject({ driver: 2, rider: 0 });
    send(room, c, 0, 4);
    expect(snap(a).flags[TEAM.BLUE]).toMatchObject({ state: FLAG.CARRIED, by: 0 });
  });

  it('runs an enemy over above the speed that kills, bruises him under it, spares a teammate, and does not slow the rover', () => {
    /** Ann drives east at `v` m/s into who stands 4 m ahead: Bob (blue) or Cid (red). Returns him, her and the rover. */
    const charge = (v: number, victim: 'Bob' | 'Cid' | 'none', keys: number = KEY.FORWARD) => {
      const { room, a, r } = driven();
      const [b, c] = [join(room, 'Bob'), join(room, 'Cid')];
      const p = victim === 'Bob' ? b : c;
      if (victim !== 'none') {
        stand(room, p, 4);
      }
      Object.assign(r, { vx: Math.fround(v) });
      send(room, a, keys, 40);
      return { foe: st(room, p), me: st(room, a), r: { ...r } };
    };
    const free = charge(ROVER.SPLAT_KILL + 3, 'none');
    const kill = charge(ROVER.SPLAT_KILL + 3, 'Bob');
    expect(kill.foe.down).toBeGreaterThan(0);
    expect(kill.foe.hp).toBe(0);
    expect(kill.me.hits).toBe(1);
    // The rover is where it would be with nobody in its way, to the bit.
    expect(kill.r).toEqual(free.r);

    const v = (ROVER.SPLAT_MIN + ROVER.SPLAT_KILL) / 2;
    const bruise = charge(v, 'Bob');
    // Once, though the body is over him for many steps: thrown the rover's way, on his feet.
    expect(bruise.foe).toMatchObject({ hp: HP_MAX - 1, down: 0 });
    expect(bruise.foe.stun).toBeGreaterThan(0);
    expect(bruise.foe.vx).toBeGreaterThan(0);
    expect(bruise.me.hits).toBe(1);
    expect(bruise.r).toEqual(charge(v, 'none').r);

    const slow = charge(ROVER.SPLAT_MIN - 2, 'Bob', 0);
    expect(slow.foe).toMatchObject({ hp: HP_MAX, stun: 0 });
    const mate = charge(ROVER.SPLAT_KILL + 3, 'Cid');
    expect(mate.foe).toMatchObject({ hp: HP_MAX, down: 0, stun: 0 });
    expect(mate.me.hits).toBe(0);
  });

  it('rewinds a rider to the seat he was drawn in', () => {
    const { room, a, r } = driven();
    const b = join(room, 'Bob');
    stand(room, b);
    use(room, b);
    Object.assign(st(room, b), loaded({ ammo: 10 }));
    send(room, a, KEY.FORWARD, 180);
    expect(r.vx).toBeGreaterThan(15);
    // Bob fires north, across the rover's way, at a view 10 ticks back.
    const tick = room['ticks'];
    const view = tick - 10;
    const then = room['history'].find(h => h.tick === view)!.players.find(p => p.id === 1)!;
    const fire = (seq: number, keys: number) =>
      room.receive(b, encodeInput({ seq, keys, yaw: 0, pitch: 0, view }));
    fire(50, KEY.FIRE);
    fire(51, 0);
    const [ball] = room['balls'];
    expect(ball.x).toBeCloseTo(then.x, 3);
    expect(st(room, b).x - ball.x).toBeGreaterThan(2);
    // His body is still on the seat.
    const sat = { ...st(room, b) };
    seat(sat, r, 1);
    expect(st(room, b).x).toBe(sat.x);
  });

  it('stops a player on foot at a parked rover, and lets him stand on it', () => {
    const room = new Room({}, LOT);
    const b = join(room, 'Ann');
    stand(room, b, -5);
    send(room, b, KEY.FORWARD, 90);
    // Rover 0's tail is 1.15 + RB m west of its centre: he stops a body's radius short of it.
    const tail = 6 - ROVER.BODY[0] - ROVER.RB - PLAYER_R;
    expect(st(room, b).x).toBeCloseTo(tail, 3);
    expect(st(room, b).mode).toBe(MODE.GROUND);
    // Put on it, he stands on its top.
    Object.assign(st(room, b), { x: 6, y: 4, z: 4 });
    send(room, b, 0, 90);
    expect(st(room, b).y).toBeCloseTo(cars(room)[0].y - ROVER.WR - ROVER.L0 + ROVER.BODY_H, 3);
    expect(st(room, b).mode).toBe(MODE.GROUND);
  });

  it('stops a driven rover on a parked one, which stays where it is', () => {
    const { room, a, r } = driven();
    const other = cars(room)[1];
    Object.assign(other, { x: 20, z: 4, y: r.y });
    send(room, a, 0, 30);
    const parked = [other.x, other.z];
    send(room, a, KEY.FORWARD, 240);
    expect(r.x).toBeLessThan(20 - 2 * (ROVER.BODY[0] + ROVER.RB) + 0.01);
    expect(r.x).toBeGreaterThan(20 - 2 * (ROVER.BODY[0] + ROVER.RB) - 1);
    expect([other.x, other.z]).toEqual(parked);
  });

  it('sends the rovers in every snapshot', () => {
    const { room, a, r } = driven();
    send(room, a, KEY.FORWARD, 20);
    for (let k = 0; k < 6; k++) {
      send(room, a, KEY.FORWARD, SNAP_EVERY);
      expect(snap(a).rovers).toEqual(cars(room));
    }
    expect(snap(a).rovers![0]).toMatchObject({ driver: 0, x: r.x });
    // A map without any carries none.
    const bare = new Room({}, ARENA);
    const c = join(bare, 'Cid');
    ticks(bare, SNAP_EVERY);
    expect(snap(c).rovers).toBeUndefined();
  });
});
