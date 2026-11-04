import { afterEach, describe, expect, it, vi } from 'vitest';
import { INPUT_BURST, MAX_NAME, MAX_PLAYERS, SNAP_EVERY, TICK_HZ } from './constants';
import { HALL } from './map';
import { decodeSnapshot, encodeInput } from './protocol';
import type { ServerText } from './protocol';
import { Room } from './room';
import { KEY } from './types';
import type { Conn, Every, Input, Snapshot } from './types';

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
