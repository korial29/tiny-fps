import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HEALTH,
  INPUT_BURST,
  MAX_NAME,
  MAX_PLAYERS,
  MAX_REWIND,
  PLAYER_RESPAWN,
  SNAP_EVERY,
  TICK_HZ,
} from './constants';
import { HALL } from './map';
import { decodeSnapshot, encodeInput } from './protocol';
import type { ServerText } from './protocol';
import { Room } from './room';
import { KEY, TEX } from './types';
import type { Conn, Every, Input, MapDef, PlayerState, Sector, Snapshot } from './types';

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
    const room = new Room({}, HALL);
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
    const room = new Room({}, HALL);
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
    const room = new Room({}, HALL);
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

  it('gives each player a distinct colour and the smallest free id', () => {
    const room = new Room({}, HALL);
    const a = join(room, 'a');
    for (let n = 1; n < MAX_PLAYERS; n++) {
      join(room, `p${n}`);
    }
    const colors = roster(a).players.map(p => p.color);
    expect(new Set(colors).size).toBe(MAX_PLAYERS);
    colors.forEach(c => expect(c).toMatch(/^#[0-9a-f]{6}$/));

    // The room is full: told so, and the roster does not change.
    const late = join(room, 'late');
    expect(late.texts).toEqual([{ t: 'full' }]);
    expect(roster(a).players).toHaveLength(MAX_PLAYERS);
    expect(room.size).toBe(MAX_PLAYERS);

    // A freed id (and its colour) goes to the next one.
    const color = roster(a).players[0].color;
    room.disconnect(a);
    const b = join(room, 'b');
    expect(roster(b).you).toBe(0);
    expect(roster(b).players[0]).toMatchObject({ id: 0, name: 'b', color });
  });

  it('honours rules.maxPlayers', () => {
    const room = new Room({ maxPlayers: 2 }, HALL);
    join(room, 'a');
    join(room, 'b');
    expect(join(room, 'c').texts).toEqual([{ t: 'full' }]);
  });

  it('spawns at the first spawn point with nobody within 2 m, else round-robin', () => {
    const room = new Room({}, HALL);
    const a = join(room);
    ticks(room, SNAP_EVERY);
    const at = (c: Peer, id: number) => snap(c).players.find(p => p.id === id)!;
    expect([at(a, 0).x, at(a, 0).z, at(a, 0).yaw]).toEqual([
      HALL.spawns[0][0],
      HALL.spawns[0][1],
      HALL.spawns[0][2],
    ]);
    // On the floor of the start room (1 m), not at 0: the host would drop him through it.
    expect(at(a, 0)).toMatchObject({ y: 1, vy: 0, ground: true });
    // Walk away from spawn 0 and back in: the second joiner then takes spawn 0 again.
    for (let k = 0; k < 60; k++) {
      room.receive(a, input(k, KEY.RIGHT));
      room.tick();
    }
    const b = join(room);
    ticks(room, SNAP_EVERY);
    expect([at(b, 1).x, at(b, 1).z]).toEqual([HALL.spawns[0][0], HALL.spawns[0][1]]);

    // Standing on spawn 0, a third one takes spawn 1, and so on: nobody within 2 m.
    for (let n = 2; n < HALL.spawns.length; n++) {
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
    // Every spawn point is taken or within 2 m of a player: the next joiner still gets one.
    join(room);
    join(room);
    ticks(room, SNAP_EVERY);
    expect(snap(a).players).toHaveLength(HALL.spawns.length + 2);
  });
});

describe('Room: inputs and snapshots', () => {
  it('moves a player with each input at once, and acks its seq', () => {
    const room = new Room({}, HALL);
    const a = join(room);
    const [x0, z0] = [HALL.spawns[0][0], HALL.spawns[0][1]];
    ticks(room, SNAP_EVERY);
    // Nothing applied yet: seq 65535 is acked, the one before the client's first (0).
    expect(snap(a).players[0]).toMatchObject({ x: x0, z: z0, ack: 65535 });

    // Yaw 0 faces -z: 6 inputs forward = 0.6 m.
    for (let k = 0; k < 6; k++) {
      room.receive(a, input(k, KEY.FORWARD));
    }
    ticks(room, SNAP_EVERY);
    const p = snap(a).players[0];
    expect(p.ack).toBe(5);
    expect(p.z).toBeCloseTo(z0 - 0.6, 2);
    expect(p.x).toBeCloseTo(x0, 2);
    expect(p.ground).toBe(true);
    expect(p.y).toBeCloseTo(1, 2);
  });

  it('applies jumps and gravity through the shared physics', () => {
    const room = new Room({}, HALL);
    const a = join(room);
    room.receive(a, input(0, KEY.JUMP));
    ticks(room, SNAP_EVERY);
    expect(snap(a).players[0]).toMatchObject({ ground: false, ack: 0 });
    expect(snap(a).players[0].y).toBeGreaterThan(1.1);
    expect(snap(a).players[0].vy).toBeGreaterThan(6);
  });

  it('drops the inputs beyond the INPUT_BURST bank, unacked, and earns one per tick', () => {
    const room = new Room({}, HALL);
    const a = join(room);
    for (let k = 0; k < INPUT_BURST + 5; k++) {
      room.receive(a, input(k, KEY.FORWARD));
    }
    ticks(room, SNAP_EVERY);
    // INPUT_BURST steps of 0.1 m, the last acked seq is the INPUT_BURST-th.
    expect(snap(a).players[0].ack).toBe(INPUT_BURST - 1);
    expect(snap(a).players[0].z).toBeCloseTo(HALL.spawns[0][1] - INPUT_BURST * 0.1, 2);

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
    const room = new Room({}, HALL);
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
    const room = new Room({}, HALL);
    const a = join(room);
    room.receive(a, new ArrayBuffer(3));
    room.receive(a, new ArrayBuffer(8));
    ticks(room, SNAP_EVERY);
    expect(snap(a).players[0]).toMatchObject({ ack: 65535, z: HALL.spawns[0][1] });
  });

  it('sends one snapshot every SNAP_EVERY ticks to every joined peer, and none to the others', () => {
    const room = new Room({}, HALL);
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
    const room = new Room({}, HALL);
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
    const room = new Room({}, HALL);
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
    const room = new Room({}, HALL);
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
    const room = new Room({}, HALL);
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

/** A purpose-built map, so each rule is tested on a map that shows only it. */
const EAST = (3 * Math.PI) / 2;
const sector = (pts: [number, number][], floor = 0): Sector => ({
  pts,
  floor,
  ceil: 4,
  ft: TEX.TILE,
  wt: TEX.BRICK,
  ct: TEX.STONE,
});
/**
 * 0: the start room (10 x 10 m); 1: a doorway east; 2: a far room (10 x 10 m); 3: a yard south of
 * the start room.
 */
const ARENA: MapDef = {
  sectors: [
    sector([
      [0, 0],
      [10, 0],
      [10, 4],
      [10, 6],
      [10, 10],
      [0, 10],
    ]),
    sector([
      [10, 4],
      [12, 4],
      [12, 6],
      [10, 6],
    ]),
    sector([
      [12, 0],
      [22, 0],
      [22, 10],
      [12, 10],
      [12, 6],
      [12, 4],
    ]),
    sector([
      [0, 10],
      [10, 10],
      [10, 16],
      [0, 16],
    ]),
  ],
  spawns: [
    [2, 5, EAST],
    [2, 2, EAST],
    [2, 8, EAST],
  ],
};

/** A room, its players' peers, joined in this order. */
const game = (levels: MapDef[] = [ARENA], names = ['A', 'B']) => {
  const room = new Room({}, levels[0]);
  const [a, b] = names.map(n => join(room, n));
  return { room, a, b };
};
const at = (room: Room, c: Peer) => room['peers'].get(c)!;
/** Stands the player on the floor at (x, z), at rest. */
const put = (room: Room, c: Peer, x: number, z: number, floor = 0): void => {
  Object.assign(at(room, c).state, { x, y: floor, z, vy: 0, ground: true });
};
/** Ticks until a snapshot goes out, and decodes it. */
const next = (room: Room, c: Peer): Snapshot => {
  const n = c.bins.length;
  for (let k = 0; c.bins.length === n && k < 10; k++) {
    room.tick();
  }
  return snap(c);
};
/** One input per tick for n ticks, with the next seqs of the player. */
const drive = (room: Room, c: Peer, keys: number, yaw: number, n: number): void => {
  for (let k = 0; k < n; k++) {
    room.receive(c, input((at(room, c).ack + 1) & 0xffff, keys, yaw));
    room.tick();
  }
};

describe('Room: health', () => {
  it('gives every player HEALTH on joining', () => {
    const { room, a } = game();
    expect(next(room, a).players.map(p => p.hp)).toEqual([HEALTH, HEALTH]);
  });

  /** `c` dies: no health, and PLAYER_RESPAWN ticks to come back. */
  const kill = (room: Room, c: Peer) => {
    at(room, c).hp = 0;
    at(room, c).hurt = room['ticks'];
  };

  it('moves nothing of a dead player, and acks its inputs', () => {
    const { room, a } = game();
    put(room, a, 5, 5);
    kill(room, a);
    const ack = at(room, a).ack;
    // Pushed on a wall for a second: nothing moves, everything is acked.
    drive(room, a, KEY.FORWARD | KEY.JUMP, 0, 30);
    expect(next(room, a).players[0]).toMatchObject({
      hp: 0,
      x: 5,
      z: 5,
      y: 0,
      ack: (ack + 30) & 0xffff,
    });
  });

  it('respawns PLAYER_RESPAWN ticks after dying, at a spawn point with full health', () => {
    const { room, a } = game();
    const me = at(room, a);
    kill(room, a);
    const died = room['ticks'];
    while (room['ticks'] < died + PLAYER_RESPAWN - 1) {
      room.tick();
    }
    expect(me.hp).toBe(0);
    room.tick();
    expect(me.hp).toBe(HEALTH);
    const [sx, sz] = ARENA.spawns[0];
    expect([me.state.x, me.state.z, me.state.y]).toEqual([sx, sz, 0]);
    expect(next(room, a).players[0]).toMatchObject({ hp: HEALTH, x: sx, z: sz });
    // And its inputs move it again.
    drive(room, a, KEY.FORWARD, EAST, 10);
    expect(me.state.x).toBeCloseTo(sx + 1, 3);
  });

  it('takes the spawn of the level that is on, away from the others', () => {
    const { room, a, b } = game();
    at(room, a).hp = 0;
    at(room, a).hurt = room['ticks'];
    ticks(room, PLAYER_RESPAWN);
    // B stands on spawn 1: A comes back on spawn 0, 3 m off.
    expect(at(room, a).hp).toBe(HEALTH);
    expect([at(room, a).state.x, at(room, a).state.z]).toEqual([2, 5]);
    expect(at(room, b).hp).toBe(HEALTH);
  });

  it('leaves a dead player out of the rewind', () => {
    const { room, b } = game();
    expect(room.rewind(0).map(p => p.id)).toEqual([1]);
    kill(room, b);
    expect(room.rewind(0)).toEqual([]);
  });
});
