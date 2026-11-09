import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACCEL,
  END_SCREEN,
  FLAG_RETURN,
  INPUT_BURST,
  MAX_NAME,
  MAX_PLAYERS,
  MAX_REWIND,
  RUN_SPEED,
  SNAP_EVERY,
  TEAM_COLOR,
  TICK_HZ,
} from './constants';
import { HIGHLINE } from './map';
import { MOON } from './moon';
import { decodeSnapshot, encodeInput } from './protocol';
import type { ServerText } from './protocol';
import { Room } from './room';
import { FLAG, KEY, TEAM, TEX } from './types';
import type { Conn, Every, Input, PlayerState, Snapshot } from './types';
import type { Spawn, WorldDef } from './world';
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
