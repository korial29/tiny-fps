import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EYE,
  FIRE_EVERY,
  INPUT_BURST,
  MAX_NAME,
  MAX_PLAYERS,
  MAX_REWIND,
  RESPAWN_AFTER,
  SNAP_EVERY,
  TICK_HZ,
} from './constants';
import { compile } from './level';
import { HALL } from './map';
import { decodeSnapshot, encodeInput } from './protocol';
import type { ServerText } from './protocol';
import { Room } from './room';
import { body, fire } from './shoot';
import { EVENT, KEY } from './types';
import type { Conn, Every, Input, PlayerState, Shot, Snapshot } from './types';

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
    const room = new Room();
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
    const room = new Room();
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
    const room = new Room();
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
    const room = new Room();
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
    const room = new Room({ maxPlayers: 2 });
    join(room, 'a');
    join(room, 'b');
    expect(join(room, 'c').texts).toEqual([{ t: 'full' }]);
  });

  it('spawns at the first spawn point with nobody within 2 m, else round-robin', () => {
    const room = new Room();
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
    const room = new Room();
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
    const room = new Room();
    const a = join(room);
    room.receive(a, input(0, KEY.JUMP));
    ticks(room, SNAP_EVERY);
    expect(snap(a).players[0]).toMatchObject({ ground: false, ack: 0 });
    expect(snap(a).players[0].y).toBeGreaterThan(1.1);
    expect(snap(a).players[0].vy).toBeGreaterThan(6);
  });

  it('drops the inputs beyond the INPUT_BURST bank, unacked, and earns one per tick', () => {
    const room = new Room();
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
    const room = new Room();
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
    const room = new Room();
    const a = join(room);
    room.receive(a, new ArrayBuffer(3));
    room.receive(a, new ArrayBuffer(8));
    ticks(room, SNAP_EVERY);
    expect(snap(a).players[0]).toMatchObject({ ack: 65535, z: HALL.spawns[0][1] });
  });

  it('sends one snapshot every SNAP_EVERY ticks to every joined peer, and none to the others', () => {
    const room = new Room();
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
    const room = new Room();
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
    const room = new Room();
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
    const room = new Room();
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

describe('Room: chaingun', () => {
  const lvl = compile(HALL);
  const { FIRE, RIGHT } = KEY;

  /** Yaw and pitch that look from the eye of a standing player at (x, z) to the point. */
  const lookAt = (from: PlayerState, to: [number, number, number]) => {
    const [dx, dy, dz] = [to[0] - from.x, to[1] - (from.y + EYE), to[2] - from.z];
    return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
  };

  /** Two players, A (id 0, at rest) and B (id 1), and everything the room sends A. */
  const duel = (pre = 0) => {
    const room = new Room();
    const a = join(room, 'A');
    const b = join(room, 'B');
    ticks(room, pre);
    let tick = pre;
    let seq = 0;
    /** B's state in every snapshot, by absolute tick. */
    const bAt = new Map<number, PlayerState>();
    let seen = 0;
    const collect = () => {
      for (; seen < a.bins.length; seen++) {
        const s = decodeSnapshot(a.bins[seen])!;
        bAt.set(
          tick,
          s.players.find(p => p.id === 1)!,
        );
      }
    };
    return {
      room,
      a,
      b,
      bAt,
      get tick() {
        return tick;
      },
      /** B runs sideways (+x) one step per tick for n ticks. */
      run: (n: number) => {
        for (let k = 0; k < n; k++) {
          room.receive(b, input(seq++ & 0xffff, RIGHT));
          room.tick();
          tick++;
          collect();
        }
      },
      /** A's input, then ticks until the next snapshot. Returns what that snapshot carries. */
      fire: (yaw: number, pitch: number, view?: number, keys = FIRE, n = 0): Shot[] => {
        const i = { seq: 7 + n, keys, yaw, pitch, view };
        room.receive(a, encodeInput(i));
        do {
          room.tick();
          tick++;
        } while (tick % SNAP_EVERY);
        collect();
        return snap(a).shots;
      },
      aState: () => snap(a).players.find(p => p.id === 0)!,
    };
  };

  it('resolves a shot on the input and sends it with the next snapshot, once', () => {
    const d = duel();
    ticks(d.room, 2);
    const a = d.aState();
    const b = snap(d.a).players.find(p => p.id === 1)!;
    const { yaw, pitch } = lookAt(a, [b.x, b.y + 0.9, b.z]);
    d.room.receive(d.a, encodeInput({ seq: 7, keys: FIRE, yaw, pitch }));
    // Nothing goes out before the snapshot.
    const before = d.a.bins.length;
    d.room.tick();
    expect(d.a.bins).toHaveLength(before);
    d.room.tick();
    expect(snap(d.a).shots).toEqual([expect.objectContaining({ id: 0, hit: 1 })]);
    ticks(d.room, 2);
    expect(snap(d.a).shots).toEqual([]);
    // The same snapshot goes to everyone.
    expect(snap(d.b).shots).toEqual([]);
  });

  it('puts a shot into the wall on a miss, and in the snapshot of every peer', () => {
    const d = duel();
    // Along +x from A (4, 4): the room wall at x = 16.
    const shots = d.fire(Math.PI * 1.5, 0);
    expect(shots).toHaveLength(1);
    expect(shots[0].hit).toBe(-1);
    expect(shots[0].x).toBeCloseTo(16, 0);
    expect(snap(d.b).shots).toEqual(shots);
  });

  it('fires every FIRE_EVERY inputs while the trigger is held, and keeps the cooldown in the snapshot', () => {
    const d = duel();
    for (let k = 0; k < 2 * FIRE_EVERY + 1; k++) {
      d.room.receive(d.a, input(k, FIRE, Math.PI * 1.5));
      if (k === 0) {
        d.room.tick();
        d.room.tick();
        expect(snap(d.a).players.find(p => p.id === 0)!.cool).toBe(FIRE_EVERY);
      }
    }
    d.room.tick();
    d.room.tick();
    // Steps 0, 5 and 10; the first went out with the earlier snapshot.
    expect(snap(d.a).shots).toHaveLength(2);
    expect(snap(d.a).players.find(p => p.id === 0)!.cool).toBe(FIRE_EVERY);
  });

  it('does not fire for an input dropped by the bank', () => {
    const d = duel();
    for (let k = 0; k < INPUT_BURST + 5; k++) {
      d.room.receive(d.a, input(k, FIRE, Math.PI * 1.5));
    }
    ticks(d.room, 2);
    // INPUT_BURST inputs applied: steps 0 and 5.
    expect(snap(d.a).shots).toHaveLength(2);
  });

  /**
   * B as A's client would draw it at the absolute tick: its recorded states, kept and clamped
   * like the room does, interpolated linearly between the two snapshots around it.
   */
  const drawn = (d: ReturnType<typeof duel>, at: number, now = d.tick): PlayerState => {
    const kept = [...d.bAt.keys()]
      .filter(t => t >= now - MAX_REWIND && t <= now)
      .sort((x, y) => x - y);
    const t = Math.min(Math.max(at, kept[0]), kept.at(-1)!);
    const lo = kept.filter(k => k <= t).at(-1)!;
    const hi = kept.find(k => k >= t)!;
    const [p, q] = [d.bAt.get(lo)!, d.bAt.get(hi)!];
    const u = hi > lo ? (t - lo) / (hi - lo) : 0;
    return { ...q, x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u, z: p.z + (q.z - p.z) * u };
  };

  /** Fires from A at B as drawn at `at` (a view given as `view`) and checks the room's shot. */
  const rewound = (d: ReturnType<typeof duel>, at: number, view: number) => {
    const target = drawn(d, at);
    const look = lookAt(d.aState(), [target.x, target.y + 0.9, target.z]);
    const now = d.tick;
    const shots = d.fire(look.yaw, look.pitch, view);
    expect(shots).toHaveLength(1);
    // What fire() gives against B where the room should have put it (A's yaw and pitch are the
    // wire's).
    const a = { ...d.aState() };
    const want = fire(lvl, a, 7, [target].map(body));
    expect(shots[0].hit).toBe(want.hit);
    expect([shots[0].x, shots[0].y, shots[0].z]).toEqual(
      [want.x, want.y, want.z].map(v => expect.closeTo(v, 3)),
    );
    return { shot: shots[0], now, target };
  };

  it('rewinds the targets to the view tick: a shot at where B was drawn hits, where B is now misses', () => {
    const d = duel();
    d.run(60);
    const now = d.tick;
    const view = now - 20;
    const { shot, target } = rewound(d, view, view);
    expect(shot.hit).toBe(1);
    // B has run 2 m since: A aiming at it now (no rewind) would miss.
    const bNow = d.bAt.get(now)!;
    expect(bNow.x - target.x).toBeCloseTo(2, 3);
    const look = lookAt(d.aState(), [target.x, target.y + 0.9, target.z]);
    const a = { ...d.aState(), ...look };
    expect(fire(lvl, a, 7, [bNow].map(body)).hit).toBe(-1);
  });

  it('interpolates between the two snapshots around a fractional view', () => {
    const d = duel();
    d.run(60);
    const view = d.tick - 20 + 0.5;
    const { target } = rewound(d, view, view);
    // Not on a snapshot: B is where it was drawn halfway, 0.05 m past the earlier one.
    const lo = d.bAt.get(Math.floor(view / 2) * 2)!;
    expect(target.x - lo.x).toBeGreaterThan(0.04);
    expect(target.x - lo.x).toBeLessThan(0.11);
  });

  it('clamps a view older than MAX_REWIND to the oldest kept tick, and a future one to the newest', () => {
    // Ticks 82, 84, ... 112 are kept at 112: the oldest is 82. (A fresh duel per shot: the
    // cooldown counts inputs.)
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

  it('stands a player the history does not hold where it is', () => {
    const d = duel();
    d.run(10);
    // C joins after the last snapshot: there is nothing to rewind it to.
    const c = join(d.room, 'C');
    const cState = d.room['peers'].get(c)!.state;
    expect(cState).toBeDefined();
    const look = lookAt(d.aState(), [cState.x, cState.y + 0.9, cState.z]);
    d.room.receive(d.a, encodeInput({ seq: 7, keys: FIRE, ...look, view: d.tick - 10 }));
    ticks(d.room, 2);
    expect(snap(d.a).shots).toEqual([expect.objectContaining({ hit: 2 })]);
  });
});

describe('Room: monsters', () => {
  const { FIRE } = KEY;
  /** The horde ticks run: tick() and then the newest snapshot of the peer. */
  const monstersOf = (c: Peer) => snap(c).monsters;
  const soloRoom = (seed?: number) => {
    const room = new Room({}, seed);
    return { room, a: join(room, 'A') };
  };

  it('puts the map monsters in every snapshot, with ids from MAX_PLAYERS', () => {
    const { room, a } = soloRoom(1);
    ticks(room, 2);
    const s = snap(a);
    expect(s.monsters.map(m => m.id)).toEqual(HALL.monsters!.map((_, i) => MAX_PLAYERS + i));
    expect(s.monsters.map(m => m.kind)).toEqual(HALL.monsters!.map(m => m[3]));
    expect([s.bullets, s.events]).toEqual([[], []]);
  });

  it('steps the monsters every tick while a player is there, and not when the room is empty', () => {
    const { room, a } = soloRoom(1);
    ticks(room, 2);
    const first = JSON.stringify(monstersOf(a));
    ticks(room, 120);
    expect(JSON.stringify(monstersOf(a))).not.toBe(first);
    room.disconnect(a);
    const peers = room['horde'].monsters();
    ticks(room, 120);
    expect(room['horde'].monsters()).toEqual(peers);
  });

  it('plays the same game from the same seed, a different one from another', () => {
    const play = (seed: number) => {
      const { room, a } = soloRoom(seed);
      ticks(room, 600);
      return a.bins.map(b => [...new Uint8Array(b)].join(',')).join(';');
    };
    expect(play(7)).toBe(play(7));
    expect(play(7)).not.toBe(play(8));
  });

  /** A at a spot of the hall, looking at the monster `id` where it is now. */
  const aimAt = (room: Room, a: Peer, id: number) => {
    const mob = room['horde'].monsters().find(m => m.id === id)!;
    const p = room['peers'].get(a)!.state;
    // The west arm of the hall, 6 m due south of the walker at (24, 2) facing the pit.
    [p.x, p.y, p.z] = [mob.x, 1, mob.z + 6];
    const [dx, dy, dz] = [0, mob.y + 0.9 - p.y - EYE, -6];
    return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, 6) };
  };

  it('kills the monster a shot hits: a DIE in the next snapshot, then the monster is gone', () => {
    const { room, a } = soloRoom(1);
    ticks(room, 4);
    const look = aimAt(room, a, MAX_PLAYERS);
    // View of the host's own tick: no rewind.
    room.receive(a, encodeInput({ seq: 0, keys: FIRE, ...look, view: room['ticks'] }));
    ticks(room, 2);
    const s = snap(a);
    expect(s.shots).toEqual([expect.objectContaining({ id: 0, hit: MAX_PLAYERS })]);
    expect(s.events.filter(e => e.type === EVENT.DIE)).toEqual([
      expect.objectContaining({ id: MAX_PLAYERS }),
    ]);
    expect(s.monsters.map(m => m.id)).not.toContain(MAX_PLAYERS);
    expect(s.monsters).toHaveLength(HALL.monsters!.length - 1);
    // Events go out once.
    ticks(room, 2);
    expect(snap(a).events.filter(e => e.type === EVENT.DIE)).toEqual([]);
  });

  it('brings the monsters back RESPAWN_AFTER ticks after the last death', () => {
    const { room, a } = soloRoom(1);
    ticks(room, 2);
    monstersOf(a).forEach(m => room['horde'].kill(m.id, 0));
    ticks(room, 2);
    expect(monstersOf(a)).toEqual([]);
    ticks(room, RESPAWN_AFTER);
    expect(monstersOf(a)).toHaveLength(HALL.monsters!.length);
  });

  it('keeps the events of a busy tick for the next snapshot when a u8 cannot count them', () => {
    const { room, a } = soloRoom(1);
    ticks(room, 2);
    for (let k = 0; k < 300; k++) {
      room['horde'].events.push({ type: EVENT.BOOM, id: k & 255, x: 0, y: 0, z: 0 });
    }
    ticks(room, 2);
    expect(snap(a).events).toHaveLength(255);
    ticks(room, 2);
    expect(snap(a).events.length).toBeGreaterThanOrEqual(45);
  });
});
