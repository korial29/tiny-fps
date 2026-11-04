import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DROP_EVERY,
  EYE,
  FIRE_EVERY,
  GOAL_R,
  HARD_SPEED,
  HEAL,
  HEALTH,
  HIT_COOLDOWN,
  INPUT_BURST,
  MAX_NAME,
  MAX_PLAYERS,
  MAX_REWIND,
  MELEE_R,
  PICKUP_R,
  PLAYER_RESPAWN,
  SNAP_EVERY,
  TICK_HZ,
} from './constants';
import { compile } from './level';
import { HALL } from './map';
import { decodeSnapshot, encodeInput } from './protocol';
import type { ServerText } from './protocol';
import { Room } from './room';
import { body, fire } from './shoot';
import { EVENT, ITEM, KEY, MONSTER, PHASE, TEX } from './types';
import type { Conn, Every, Input, MapDef, PlayerState, Sector, Shot, Snapshot } from './types';

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
    const room = new Room({}, undefined, [HALL]);
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
    const room = new Room({}, undefined, [HALL]);
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
    const room = new Room({}, undefined, [HALL]);
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
    const room = new Room({}, undefined, [HALL]);
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
    const room = new Room({ maxPlayers: 2 }, undefined, [HALL]);
    join(room, 'a');
    join(room, 'b');
    expect(join(room, 'c').texts).toEqual([{ t: 'full' }]);
  });

  it('spawns at the first spawn point with nobody within 2 m, else round-robin', () => {
    const room = new Room({}, undefined, [HALL]);
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
    const room = new Room({}, undefined, [HALL]);
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
    const room = new Room({}, undefined, [HALL]);
    const a = join(room);
    room.receive(a, input(0, KEY.JUMP));
    ticks(room, SNAP_EVERY);
    expect(snap(a).players[0]).toMatchObject({ ground: false, ack: 0 });
    expect(snap(a).players[0].y).toBeGreaterThan(1.1);
    expect(snap(a).players[0].vy).toBeGreaterThan(6);
  });

  it('drops the inputs beyond the INPUT_BURST bank, unacked, and earns one per tick', () => {
    const room = new Room({}, undefined, [HALL]);
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
    const room = new Room({}, undefined, [HALL]);
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
    const room = new Room({}, undefined, [HALL]);
    const a = join(room);
    room.receive(a, new ArrayBuffer(3));
    room.receive(a, new ArrayBuffer(8));
    ticks(room, SNAP_EVERY);
    expect(snap(a).players[0]).toMatchObject({ ack: 65535, z: HALL.spawns[0][1] });
  });

  it('sends one snapshot every SNAP_EVERY ticks to every joined peer, and none to the others', () => {
    const room = new Room({}, undefined, [HALL]);
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
    const room = new Room({}, undefined, [HALL]);
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
    const room = new Room({}, undefined, [HALL]);
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
    const room = new Room({}, undefined, [HALL]);
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
    const room = new Room({}, undefined, [HALL]);
    const a = join(room, 'A');
    const b = join(room, 'B');
    // A long wait under the monsters' bullets: healed every tick, so nobody dies of it.
    for (let k = 0; k < pre; k++) {
      room.tick();
      room['players']().forEach(p => (p.hp = HEALTH));
    }
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
    const room = new Room({}, seed, [HALL]);
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

  it('does not bring the monsters back when they are all dead', () => {
    const { room, a } = soloRoom(1);
    ticks(room, 2);
    monstersOf(a).forEach(m => room['horde'].kill(m.id, 0));
    ticks(room, 2);
    expect(monstersOf(a)).toEqual([]);
    ticks(room, 1000);
    expect(monstersOf(a)).toEqual([]);
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

/** Progression: a purpose-built campaign, so each rule is tested on a map that shows only it. */
const EAST = (3 * Math.PI) / 2;
const WEST = Math.PI / 2;
const SOUTH = Math.PI;
const sector = (pts: [number, number][], floor = 0): Sector => ({
  pts,
  floor,
  ceil: 4,
  ft: TEX.TILE,
  wt: TEX.BRICK,
  ct: TEX.STONE,
});
/**
 * 0: the start room, which is the exit (10 x 10 m); 1: a doorway east, a gate for the red key; 2:
 * the far room, with the goal (10 x 10 m); 3: a yard south of the start room. The red key lies in
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
  items: [[6, 2, ITEM.KEY_RED]],
  gates: [{ sector: 1, key: ITEM.KEY_RED }],
  goal: [20, 5],
  exit: 0,
};
const arena = (over: Partial<MapDef> = {}): MapDef => ({ ...ARENA, ...over });

/** A room, its players' peers, joined in this order. */
const game = (levels: MapDef[] = [ARENA], names = ['A', 'B']) => {
  const room = new Room({}, 1, levels);
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
const ends = (c: Peer) => c.texts.filter(m => m.t === 'end');

describe('Room: health', () => {
  /** Player A and a flyer 5 m off, facing it: it sees A on its next look, chases and swings. */
  const flyer = (hp = HEALTH) => {
    const g = game([arena({ monsters: [[9.5, 5, WEST, MONSTER.FLYER]] })], ['A']);
    put(g.room, g.a, 4.5, 5);
    at(g.room, g.a).hp = hp;
    return { ...g, me: at(g.room, g.a) };
  };

  it('gives every player HEALTH on joining', () => {
    const { room, a } = game();
    expect(next(room, a).players.map(p => p.hp)).toEqual([HEALTH, HEALTH]);
  });

  it('takes 1 health per blow, then HIT_COOLDOWN ticks of grace, and tells only the hits that took it', () => {
    const { room, a, me } = flyer();
    const lost: number[] = [];
    let [hurts, swings, hp] = [0, 0, HEALTH];
    for (let k = 1; k <= 400; k++) {
      room.tick();
      if (me.hp < hp) {
        lost.push(k);
        hp = me.hp;
      }
      if (k % SNAP_EVERY === 0) {
        const { events } = snap(a);
        hurts += events.filter(e => e.type === EVENT.HURT && e.id === 0).length;
        swings += events.filter(e => e.type === EVENT.SWING).length;
      }
    }
    expect(lost.length).toBeGreaterThanOrEqual(3);
    // One health at a time, never two blows within the cooldown.
    lost.slice(1).forEach((t, i) => expect(t - lost[i]).toBeGreaterThanOrEqual(HIT_COOLDOWN));
    expect(me.hp).toBe(HEALTH - lost.length);
    // Every hit that took health is a HURT, and the blows the cooldown absorbed are not.
    expect(hurts).toBe(lost.length);
    expect(swings).toBeGreaterThan(hurts);
  });

  it('takes health from a bullet as well, shot from afar', () => {
    const { room, a } = game([arena({ monsters: [[9, 3, WEST, MONSTER.WALKER]] })], ['A']);
    put(room, a, 1, 5);
    const me = at(room, a);
    const types: number[] = [];
    for (let k = 1; k <= 600 && me.hp === HEALTH; k++) {
      room.tick();
      if (k % SNAP_EVERY === 0) {
        types.push(...snap(a).events.map(e => e.type));
      }
    }
    expect(me.hp).toBe(HEALTH - 1);
    const [m] = room['horde'].monsters();
    expect(Math.hypot(m.x - me.state.x, m.z - me.state.z)).toBeGreaterThan(MELEE_R);
    // The blow of a swing was never in reach: this one is a bullet.
    expect(types).not.toContain(EVENT.SWING);
    types.push(...next(room, a).events.map(e => e.type));
    expect(types.filter(t => t === EVENT.HURT)).toHaveLength(1);
  });

  /** A player with 1 health, killed by the flyer: the room at the tick it died. */
  const killed = () => {
    const g = flyer(1);
    for (let k = 0; g.me.hp && k < 2000; k++) {
      g.room.tick();
    }
    expect(g.me.hp).toBe(0);
    return { ...g, died: g.room['ticks'] };
  };

  it('dies at 0 health: its inputs are acked and move nothing, and the monsters let go of it', () => {
    const { room, a, me, died } = killed();
    const [x, z, ack] = [me.state.x, me.state.z, me.ack];
    // Pushed on a wall for a second: nothing moves, everything is acked.
    drive(room, a, KEY.FORWARD | KEY.JUMP, 0, 30);
    expect(next(room, a).players[0]).toMatchObject({ hp: 0, x, z, y: 0, ack: (ack + 30) & 0xffff });
    expect(me.ack).toBe((ack + 30) & 0xffff);
    // The flyer is back to patrolling and swings no more, though it stands next to the body.
    expect(room['horde'].monsters()[0].chase).toBe(false);
    let swings = 0;
    while (room['ticks'] < died + PLAYER_RESPAWN - 2) {
      room.tick();
      swings += +(
        room['ticks'] % SNAP_EVERY === 0 && snap(a).events.some(e => e.type === EVENT.SWING)
      );
    }
    expect(swings).toBe(0);
  });

  it('respawns PLAYER_RESPAWN ticks after dying, at a spawn point with full health', () => {
    const { room, a, me, died } = killed();
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

  it('lets a shot pass through a dead player', () => {
    const { room, a, b } = game();
    put(room, a, 8, 5);
    put(room, b, 4, 5);
    const fireAt = (): Shot => {
      room.receive(b, input((at(room, b).ack + 1) & 0xffff, KEY.FIRE, EAST));
      return next(room, b).shots[0];
    };
    expect(fireAt().hit).toBe(0);
    // The chaingun cools down one input at a time.
    drive(room, b, 0, EAST, FIRE_EVERY);
    at(room, a).hp = 0;
    at(room, a).hurt = room['ticks'];
    // Through the barred doorway too, to the far wall.
    const through = fireAt();
    expect(through.hit).toBe(-1);
    expect(through.x).toBeCloseTo(22, 0);
  });

  it('does not let a dead player shoot', () => {
    const { room, a } = game();
    at(room, a).hp = 0;
    room.receive(a, encodeInput({ seq: 0, keys: KEY.FIRE, yaw: EAST, pitch: 0 }));
    expect(next(room, a).shots).toEqual([]);
  });
});

describe('Room: items', () => {
  const HEALTHPACKS = (...at: [number, number][]) =>
    arena({ items: at.map(([x, z]) => [x, z, ITEM.HEALTH]) });

  it('lies the map items in the snapshot, ids from 0, on the floor', () => {
    const { room, a } = game([
      arena({
        sectors: ARENA.sectors.map((s, i) => ({ ...s, floor: i ? 0 : 1 })),
        items: [
          [6, 2, ITEM.KEY_RED],
          [7, 8, ITEM.HEALTH],
        ],
      }),
    ]);
    expect(next(room, a).items).toEqual([
      { id: 0, kind: ITEM.KEY_RED, x: 6, y: 1, z: 2 },
      { id: 1, kind: ITEM.HEALTH, x: 7, y: 1, z: 8 },
    ]);
  });

  it('opens the gates of a key for the whole team, whoever took it', () => {
    const { room, a, b } = game();
    // B walks at the shut doorway: it stops at the wall of the gate.
    put(room, b, 7, 5);
    drive(room, b, KEY.FORWARD, EAST, 60);
    expect(at(room, b).state.x).toBeCloseTo(10 - 0.4, 3);
    expect(next(room, b).keys).toBe(0);

    // A takes the key; it is gone from the level and in the team's hands.
    put(room, a, 6.3, 2);
    const s = next(room, a);
    expect(s.keys).toBe(1 << ITEM.KEY_RED);
    expect(s.items).toEqual([]);
    // B goes through the doorway it could not pass.
    drive(room, b, KEY.FORWARD, EAST, 80);
    expect(at(room, b).state.x).toBeGreaterThan(14);
  });

  it('is taken only within PICKUP_R, and only when the body is at the height of the floor', () => {
    const { room, a } = game();
    const [kx, kz] = [6, 2];
    put(room, a, kx + PICKUP_R + 0.1, kz);
    expect(next(room, a).items).toHaveLength(1);
    // Right above it, in the air: out of reach.
    put(room, a, kx, kz, 1.5);
    expect(next(room, a).items).toHaveLength(1);
    put(room, a, kx + PICKUP_R - 0.1, kz);
    const s = next(room, a);
    expect([s.items, s.keys]).toEqual([[], 1 << ITEM.KEY_RED]);
  });

  it('does not let a dead player take anything', () => {
    const { room, a } = game();
    put(room, a, 6, 2);
    at(room, a).hp = 0;
    at(room, a).hurt = room['ticks'];
    expect(next(room, a).items).toHaveLength(1);
    expect(snap(a).keys).toBe(0);
  });

  it('gives HEAL health from a pack below full health, and leaves it at full health', () => {
    const { room, a } = game([HEALTHPACKS([3, 5])]);
    put(room, a, 3, 5);
    // At full health: it stays.
    expect(next(room, a).items).toHaveLength(1);
    expect(at(room, a).hp).toBe(HEALTH);
    at(room, a).hp = 4;
    const s = next(room, a);
    expect(s.items).toEqual([]);
    expect(s.players.find(p => p.id === 0)!.hp).toBe(4 + HEAL);
  });

  it('caps the health at HEALTH, and takes the next pack only if there is room for it', () => {
    const { room, a } = game([HEALTHPACKS([3, 5], [3, 5.2])]);
    put(room, a, 3, 5);
    at(room, a).hp = HEALTH - 1;
    const s = next(room, a);
    expect(at(room, a).hp).toBe(HEALTH);
    // The first pack healed 1 (capped), the second finds it full and stays.
    expect(s.items.map(t => t.id)).toEqual([1]);
    at(room, a).hp = HEALTH - 2;
    next(room, a);
    expect(at(room, a).hp).toBe(HEALTH);
  });

  describe('drops', () => {
    /** One big room 1.5 m up, nine walkers in a row at its far end, and the shooter. */
    const field = () => {
      const g = game(
        [
          {
            sectors: [
              sector(
                [
                  [0, 0],
                  [80, 0],
                  [80, 30],
                  [0, 30],
                ],
                1.5,
              ),
            ],
            spawns: [[2, 15, EAST]],
            monsters: Array.from({ length: 2 * DROP_EVERY + 1 }, (_, k) => [
              60,
              3 + 3 * k,
              WEST,
              MONSTER.WALKER,
            ]),
          },
        ],
        ['A'],
      );
      let seq = 0;
      /** Shoots monster `id` dead from 4 m west of where it stands now. */
      const slay = (id: number) => {
        const m = room['horde'].monsters().find(q => q.id === id)!;
        const me = at(room, g.a);
        Object.assign(me.state, { x: m.x - 4, y: 1.5, z: m.z, vy: 0, ground: true, cool: 0 });
        me.hp = HEALTH;
        const pitch = Math.atan2(m.y + 0.9 - 1.5 - EYE, 4);
        const view = room['ticks'];
        room.receive(g.a, encodeInput({ seq: seq++, keys: KEY.FIRE, yaw: EAST, pitch, view }));
        room.tick();
        expect(room['horde'].monsters().some(q => q.id === id)).toBe(false);
        return m;
      };
      const { room } = g;
      return { ...g, slay };
    };

    it('leaves a HEALTH pack where every DROP_EVERY-th monster of the team dies, on the floor', () => {
      const { room, a, slay } = field();
      const dropped = [];
      for (let k = 0; k < 2 * DROP_EVERY; k++) {
        const m = slay(MAX_PLAYERS + k);
        const items = next(room, a).items;
        expect(items).toHaveLength(Math.floor((k + 1) / DROP_EVERY));
        if ((k + 1) % DROP_EVERY === 0) {
          dropped.push(items.at(-1)!);
          expect(items.at(-1)).toMatchObject({
            kind: ITEM.HEALTH,
            x: Math.fround(m.x),
            y: 1.5,
            z: Math.fround(m.z),
          });
        }
      }
      expect(new Set(dropped.map(t => t.id)).size).toBe(2);
    });
  });
});

describe('Room: goal and exit', () => {
  const [GOAL_X, GOAL_Z] = ARENA.goal!;
  const goal = (room: Room, c: Peer, off = 0) => put(room, c, GOAL_X + off, GOAL_Z);
  const EXIT_X = 5;

  it('bars the exit until the goal is touched: out of it you can go, back into it not', () => {
    const { room, a, b } = game();
    expect(next(room, a)).toMatchObject({ phase: PHASE.HUNT, level: 0 });
    // B walks south out of the start room into the yard, and back north at the exit.
    put(room, b, 5, 8);
    drive(room, b, KEY.FORWARD, SOUTH, 40);
    expect(at(room, b).state.z).toBeGreaterThan(11);
    drive(room, b, KEY.FORWARD, 0, 60);
    expect(at(room, b).state.z).toBeCloseTo(10 + 0.4, 3);

    // The goal is touched: the exit opens for everyone.
    goal(room, a);
    expect(next(room, a).phase).toBe(PHASE.RETURN);
    drive(room, b, KEY.FORWARD, 0, 40);
    expect(at(room, b).state.z).toBeLessThan(9);
  });

  it('turns to RETURN within GOAL_R of the goal, for a living player only', () => {
    const { room, a, b } = game();
    goal(room, a, GOAL_R + 0.2);
    expect(next(room, a).phase).toBe(PHASE.HUNT);
    // A dead player on the goal does nothing.
    goal(room, b);
    at(room, b).hp = 0;
    at(room, b).hurt = room['ticks'];
    expect(next(room, a).phase).toBe(PHASE.HUNT);
    // Nor one under it, a floor down.
    goal(room, a, 0.2);
    at(room, a).state.y = -3;
    expect(next(room, a).phase).toBe(PHASE.HUNT);
    goal(room, a, GOAL_R - 0.2);
    expect(next(room, a).phase).toBe(PHASE.RETURN);
    // It stays so, with the goal left behind.
    put(room, a, 15, EXIT_X);
    expect(next(room, a).phase).toBe(PHASE.RETURN);
  });

  const campaign = [ARENA, arena({ spawns: [[8, 2, EAST]] })];

  it('wins the level when every living player is in the exit, and not before', () => {
    const { room, a, b } = game(campaign);
    // Everyone starts in the exit, but the goal was not touched: no win.
    ticks(room, 20);
    expect(next(room, a).level).toBe(0);
    goal(room, a);
    ticks(room, 2);
    expect(snap(a).phase).toBe(PHASE.RETURN);
    // B is in the exit, A is not.
    ticks(room, 30);
    expect(next(room, a)).toMatchObject({ level: 0, phase: PHASE.RETURN });
    // A comes home: next level, at once.
    put(room, a, EXIT_X, 3);
    room.tick();
    expect(next(room, a)).toMatchObject({ level: 1, phase: PHASE.HUNT });
    expect(room['level']).toBe(1);
    void b;
  });

  it('does not wait for the dead, and does not win with nobody alive', () => {
    const { room, a, b } = game(campaign);
    goal(room, a);
    ticks(room, 2);
    // A is dead out at the goal, B alive in the exit: B alone brings the team home.
    at(room, a).hp = 0;
    at(room, a).hurt = room['ticks'];
    room.tick();
    expect(room['level']).toBe(1);

    // Both dead, both lying in the exit: nobody is alive, nobody wins.
    const g = game(campaign);
    goal(g.room, g.a);
    ticks(g.room, 2);
    for (const c of [g.a, g.b]) {
      at(g.room, c).hp = 0;
      at(g.room, c).hurt = g.room['ticks'];
    }
    ticks(g.room, 20);
    expect(g.room['level']).toBe(0);
    expect(next(g.room, g.a).phase).toBe(PHASE.RETURN);
    void b;
  });
});

describe('Room: levels and the end of a run', () => {
  const second = arena({
    spawns: [
      [8, 2, EAST],
      [8, 8, EAST],
    ],
    items: [[7, 8, ITEM.HEALTH]],
    monsters: [
      [20, 1, EAST, MONSTER.WALKER],
      [20, 9, EAST, MONSTER.FLYER],
    ],
  });
  const first = arena({ monsters: [[20, 1, EAST, MONSTER.WALKER]] });
  /** The goal, then everyone home: the win comes on the second tick. */
  const win = (room: Room, a: Peer, b: Peer) => {
    put(room, a, 20, 5);
    room.tick();
    put(room, a, 5, 3);
    put(room, b, 5, 7);
    room.tick();
  };

  it('starts the next level fresh: players, monsters, items, keys, phase', () => {
    const { room, a, b } = game([first, second]);
    // A level played: a key taken, a monster dead, a drop on the floor, A hurt and far away.
    put(room, a, 6.3, 2);
    ticks(room, 2);
    room['horde'].kill(MAX_PLAYERS, 0);
    room['drop'](ITEM.HEALTH, 3, 3);
    at(room, a).hp = 3;
    at(room, a).state.cool = 4;
    expect(next(room, a)).toMatchObject({ keys: 1 << ITEM.KEY_RED, level: 0 });
    expect(snap(a).items).toHaveLength(1);

    win(room, a, b);
    const s = next(room, a);
    expect([s.level, s.phase, s.keys, s.hard]).toEqual([1, PHASE.HUNT, 0, false]);
    // The second level's items only, ids from 0; its monsters, all alive.
    expect(s.items).toEqual([{ id: 0, kind: ITEM.HEALTH, x: 7, y: 0, z: 8 }]);
    expect(s.monsters.map(m => m.id)).toEqual([MAX_PLAYERS, MAX_PLAYERS + 1]);
    // Everyone on a spawn of it with full health, nobody within 2 m of another.
    expect(s.players.map(p => [p.id, p.hp, p.cool, p.x, p.z])).toEqual([
      [0, HEALTH, 0, 8, 2],
      [1, HEALTH, 0, 8, 8],
    ]);
    // The new exit is barred again, the gate is shut.
    expect([...room['lvl'].barred].sort()).toEqual([0, 1]);
    expect(s.shots).toEqual([]);
  });

  it('forgets the lag-compensation history of the level it leaves', () => {
    const { room, a, b } = game([first, second]);
    ticks(room, 30);
    expect(room['history'].length).toBeGreaterThan(5);
    win(room, a, b);
    const won = room['ticks'];
    expect(room['level']).toBe(1);
    expect(room['history'].every(h => h.tick >= won)).toBe(true);
  });

  it('sends the end of the run to every player after the last level, then starts again in hard mode', () => {
    const { room, a, b } = game([first]);
    const lurker = peer();
    room.connect(lurker);
    ticks(room, 100);
    win(room, a, b);
    // The run took every tick since the first one: 100, the goal, the win.
    expect(ends(a)).toEqual([{ t: 'end', ticks: 102, hard: false, stats: [] }]);
    expect(ends(b)).toEqual(ends(a));
    expect(lurker.texts).toEqual([]);
    expect(next(room, a)).toMatchObject({ level: 0, hard: true, phase: PHASE.HUNT, keys: 0 });
    expect(snap(a).players.map(p => p.hp)).toEqual([HEALTH, HEALTH]);
    expect(snap(a).monsters).toHaveLength(1);

    // The second run is timed from its own start, and stays hard.
    ticks(room, 50);
    win(room, a, b);
    expect(ends(a).at(-1)).toEqual({ t: 'end', ticks: room['ticks'] - 102, hard: true, stats: [] });
    expect(next(room, a).hard).toBe(true);
  });

  /** Metres the only monster of a room walks per tick on patrol, over 40 ticks. */
  const pace = (room: Room): number => {
    let [last] = room['horde'].monsters();
    let sum = 0;
    for (let k = 0; k < 40; k++) {
      room.tick();
      const [m] = room['horde'].monsters();
      sum += Math.hypot(m.x - last.x, m.z - last.z);
      last = m;
    }
    return sum / 40;
  };

  it('runs the second run with a faster horde', () => {
    const { room, a, b } = game([arena({ monsters: [[17, 5, EAST, MONSTER.WALKER]] })]);
    const easy = pace(room);
    win(room, a, b);
    expect(room['hard']).toBe(true);
    const hard = pace(room);
    expect(easy).toBeCloseTo(1 / TICK_HZ, 3);
    expect(hard / easy).toBeCloseTo(HARD_SPEED, 1);
  });
});
