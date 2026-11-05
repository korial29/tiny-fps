import { describe, expect, it } from 'vitest';
import {
  DASH_SPEED,
  STUMBLE_KNOCK,
  STUMBLE_TICKS,
  TACKLE_COOLDOWN,
  TACKLE_REACH,
  PLAYER_R,
  SNAP_EVERY,
} from './constants';
import { decodeSnapshot, encodeInput } from './protocol';
import { Room } from './room';
import { reaches, tackling } from './tackle';
import { STILL, spawn } from './physics';
import { FLAG, KEY, MODE, TEAM, TEX } from './types';
import type { Conn, PlayerState, Snapshot } from './types';
import type { Spawn, WorldDef } from './world';
import { duo } from '../../test/teams';

const { FORWARD, SPRINT, DASH, CROUCH } = KEY;
const EAST = (3 * Math.PI) / 2;

const SPAWNS: Spawn[] = [
  [4, 1, 4, EAST],
  [4, 1, 12, EAST],
  [8, 1, 8, EAST],
  [12, 1, 4, EAST],
];
/** A flat slab at y = 1 with the red base far to the west and the blue one far to the east. */
const ARENA: WorldDef = {
  brushes: [{ min: [-100, -5, -100], max: [100, 1, 100], top: TEX.TILE, side: TEX.BRICK }],
  teams: [
    { base: [-60, 1, 4], spawns: SPAWNS },
    { base: [60, 1, 4], spawns: SPAWNS.map(([x, y, z, yaw]): Spawn => [x + 40, y, z, yaw]) },
  ],
  floor: -20,
  sun: { dir: [0, 1, 0], color: [1, 1, 1] },
  sky: [
    [0, 0, 1],
    [1, 1, 1],
  ],
};

type Peer = Conn & { bins: ArrayBuffer[] };

/**
 * Four players, who join in this order: Ann (id 0) and Cy (2) are red, Bob (1) and Dee (3) blue.
 * Nobody carries a flag, and everyone stands still on the slab.
 */
const match = () => {
  const room = new Room({}, ARENA);
  const seqs = new Map<Peer, number>();
  const join = (name: string): Peer => {
    const c: Peer = { bins: [], send: d => typeof d !== 'string' && c.bins.push(d) };
    room.connect(c);
    room.receive(c, JSON.stringify({ t: 'join', name }));
    return c;
  };
  const [ann, bob, cy, dee] = ['Ann', 'Bob', 'Cy', 'Dee'].map(join);
  const state = (c: Peer): PlayerState => room['peers'].get(c)!.state;
  const api = {
    room,
    ann,
    bob,
    cy,
    dee,
    state,
    /** Stands the player at (x, z) on the slab, at rest, facing east. */
    put: (c: Peer, x: number, z = 0, over: Partial<PlayerState> = {}) =>
      Object.assign(state(c), STILL, { x, y: 1, z, vy: 0, yaw: EAST, ground: true }, over),
    /** The player carries the other team's flag. */
    carry: (c: Peer) => {
      const id = room['peers'].get(c)!.info.id;
      const team = room['peers'].get(c)!.info.team;
      room['ctf'].flags[1 - team] = { state: FLAG.CARRIED, by: id, x: 0, y: 0, z: 0, left: 0 };
    },
    ticks: (n: number) => {
      for (let k = 0; k < n; k++) {
        room.tick();
      }
    },
    /** Ticks on to an even one, so the view tick of the next input is a snapshot tick exactly. */
    even: () => {
      do {
        room.tick();
      } while (room['ticks'] % SNAP_EVERY);
      return room['ticks'];
    },
    /** One input of the player, seeing the others as they were at `view` (this tick by default). */
    send: (c: Peer, keys: number, view = room['ticks'], yaw = EAST) => {
      const seq = seqs.get(c) ?? 0;
      seqs.set(c, seq + 1);
      room.receive(c, encodeInput({ seq, keys, yaw, pitch: 0, view }));
    },
    snap: (c: Peer): Snapshot => decodeSnapshot(c.bins.at(-1)!)!,
    /** The flag of team `k`. */
    flag: (k: number) => room['ctf'].flags[k],
  };
  return api;
};

/** Sends the same input up to `n` times, until `stop` holds; returns whether it did. */
const until = (stop: () => boolean, go: () => void, n = 20): boolean => {
  for (let k = 0; k < n && !stop(); k++) {
    go();
  }
  return stop();
};

describe('the tackle rule', () => {
  it('tackles an enemy carrier with a dash: the flag drops under him and he stumbles along the dash', () => {
    const m = match();
    m.put(m.cy, 0);
    m.put(m.bob, 2);
    m.carry(m.bob);
    m.ticks(SNAP_EVERY);
    expect(m.flag(TEAM.RED).state).toBe(FLAG.CARRIED);

    expect(
      until(
        () => m.flag(TEAM.RED).state === FLAG.DROPPED,
        () => m.send(m.cy, FORWARD | DASH),
      ),
    ).toBe(true);
    // Under him, where he stood.
    expect(m.flag(TEAM.RED)).toMatchObject({ x: 2, y: 1, z: 0 });
    expect(m.state(m.bob)).toMatchObject({ stun: STUMBLE_TICKS, vx: Math.fround(STUMBLE_KNOCK) });
    expect(m.state(m.bob).vz).toBeCloseTo(0, 5);
    // The tackler's own move is untouched: he is still dashing at full speed.
    expect(m.state(m.cy).vx).toBeCloseTo(DASH_SPEED, 4);

    // The snapshot says who tackled, while the stumble lasts, then nothing.
    m.ticks(SNAP_EVERY);
    expect(m.snap(m.cy).players.find(p => p.id === 1)).toMatchObject({
      stun: STUMBLE_TICKS,
      by: 2,
    });
    for (let k = 0; k < STUMBLE_TICKS; k++) {
      m.send(m.bob, 0);
      m.ticks(1);
    }
    m.ticks(SNAP_EVERY);
    expect(m.snap(m.cy).players.find(p => p.id === 1)).toMatchObject({ stun: 0, by: 0 });
  });

  it('tackles with a slide too', () => {
    const m = match();
    m.put(m.cy, 0, 0, { mode: MODE.SLIDE, t: 5, vx: 8 });
    m.put(m.bob, 1.8);
    m.carry(m.bob);
    m.ticks(SNAP_EVERY);
    expect(
      until(
        () => m.flag(TEAM.RED).state === FLAG.DROPPED,
        () => m.send(m.cy, FORWARD | CROUCH),
      ),
    ).toBe(true);
    expect(m.state(m.cy).mode).toBe(MODE.SLIDE);
    expect(m.state(m.bob).stun).toBe(STUMBLE_TICKS);
    expect(m.state(m.bob).vx).toBeGreaterThan(0);
  });

  it('does not tackle with a walk, a run or a sprint into him', () => {
    const m = match();
    m.put(m.cy, 0);
    m.put(m.bob, 2);
    m.carry(m.bob);
    m.ticks(SNAP_EVERY);
    for (let k = 0; k < 40; k++) {
      m.send(m.cy, FORWARD | SPRINT);
      m.ticks(1);
    }
    // He has run through him and out the other side.
    expect(m.state(m.cy).x).toBeGreaterThan(3);
    expect(m.flag(TEAM.RED).state).toBe(FLAG.CARRIED);
    expect(m.state(m.bob).stun).toBe(0);
  });

  it('does not tackle a teammate carrier', () => {
    const m = match();
    m.put(m.cy, 0);
    m.put(m.ann, 2);
    // Ann carries the blue flag: she is Cy's teammate.
    m.carry(m.ann);
    m.ticks(SNAP_EVERY);
    for (let k = 0; k < 10; k++) {
      m.send(m.cy, FORWARD | DASH);
    }
    expect(m.state(m.cy).x).toBeGreaterThan(2);
    expect(m.flag(TEAM.BLUE).state).toBe(FLAG.CARRIED);
    expect(m.state(m.ann).stun).toBe(0);
  });

  it('does not tackle an enemy who carries nothing: it is about the flag', () => {
    const m = match();
    m.put(m.cy, 0);
    m.put(m.bob, 2);
    m.ticks(SNAP_EVERY);
    for (let k = 0; k < 10; k++) {
      m.send(m.cy, FORWARD | DASH);
    }
    expect(m.state(m.cy).x).toBeGreaterThan(2);
    expect(m.state(m.bob).stun).toBe(0);
    expect(m.state(m.bob).vx).toBe(0);
  });

  it('does not tackle a carrier out of reach, and does tackle one at the edge of it', () => {
    const reach = 2 * PLAYER_R + TACKLE_REACH;
    const [a, b] = [spawn(0, build1(), 0), spawn(1, build1(), 0)];
    const at = (x: number, y = 0) => Object.assign({}, b, { x: a.x + x, y: a.y + y });
    expect(reaches(a, at(reach - 0.01))).toBe(true);
    expect(reaches(a, at(reach + 0.01))).toBe(false);
    // Over his head, or under his feet.
    expect(reaches(a, at(0, 1.7))).toBe(true);
    expect(reaches(a, at(0, 1.9))).toBe(false);
    expect(reaches(at(0, 1.9), a)).toBe(false);
    // A slide is low: a body 1 m up passes over it.
    expect(reaches({ ...a, mode: MODE.SLIDE }, at(0, 1))).toBe(false);
  });

  it('tackles from the dash timer or the slide mode, not after the burst', () => {
    const s = spawn(0, build1(), 0);
    expect(tackling(s)).toBe(false);
    expect(tackling({ ...s, dash: 60 })).toBe(true);
    expect(tackling({ ...s, dash: 51 })).toBe(true);
    expect(tackling({ ...s, dash: 50 })).toBe(false);
    expect(tackling({ ...s, mode: MODE.SLIDE })).toBe(true);
    expect(tackling({ ...s, mode: MODE.CROUCH })).toBe(false);
  });
});

describe('the tackle with lag', () => {
  it('counts a tackle that hit where the tackler saw the carrier, though he has moved on', () => {
    const m = match();
    m.put(m.cy, 0);
    m.put(m.bob, 2);
    m.carry(m.bob);
    const seen = m.even();
    // Bob is 8 m further by the time Cy's inputs arrive, on the host...
    m.put(m.bob, 10);
    m.ticks(SNAP_EVERY * 2);
    expect(m.state(m.bob).x).toBe(10);
    // ...but Cy dashes at where he drew him: 4 ticks of history back.
    expect(
      until(
        () => m.flag(TEAM.RED).state === FLAG.DROPPED,
        () => m.send(m.cy, FORWARD | DASH, seen),
      ),
    ).toBe(true);
    expect(m.state(m.bob).stun).toBe(STUMBLE_TICKS);
    // Not under him where he is now: the flag lies where he stands on the host.
    expect(m.flag(TEAM.RED).x).toBe(10);
  });

  it('does not count one that missed in the tackler view, though the carrier is there now', () => {
    const m = match();
    m.put(m.cy, 0);
    m.put(m.bob, 10);
    m.carry(m.bob);
    const seen = m.even();
    // Bob has come to 2 m on the host since; Cy drew him at 10 m.
    m.put(m.bob, 2);
    m.ticks(SNAP_EVERY * 2);
    for (let k = 0; k < 10; k++) {
      m.send(m.cy, FORWARD | DASH, seen);
    }
    expect(m.state(m.cy).x).toBeGreaterThan(2);
    expect(m.flag(TEAM.RED).state).toBe(FLAG.CARRIED);
    expect(m.state(m.bob).stun).toBe(0);
    // With the view of now, the same dash would hit.
    const n = match();
    n.put(n.cy, 0);
    n.put(n.bob, 2);
    n.carry(n.bob);
    n.ticks(SNAP_EVERY);
    expect(
      until(
        () => n.flag(TEAM.RED).state === FLAG.DROPPED,
        () => n.send(n.cy, FORWARD | DASH),
      ),
    ).toBe(true);
  });
});

describe('the tackle cooldown', () => {
  it('lets one dash tackle one carrier, and the same player tackle again after TACKLE_COOLDOWN ticks', () => {
    const m = match();
    m.put(m.cy, 0);
    m.put(m.bob, 1.9);
    m.put(m.dee, 1.9, 0.3);
    m.carry(m.bob);
    m.ticks(SNAP_EVERY);
    expect(
      until(
        () => m.flag(TEAM.RED).state === FLAG.DROPPED,
        () => m.send(m.cy, FORWARD | DASH),
      ),
    ).toBe(true);
    // The tackler is by the flag, but a tackled flag lies FLAG_LOCK seconds before anyone sends it
    // home: Dee, the carrier's teammate, picks it up where it lies, in the same dash's way.
    m.ticks(1);
    expect(m.flag(TEAM.RED)).toMatchObject({ state: FLAG.CARRIED, by: 3 });
    m.send(m.cy, FORWARD | DASH);
    m.send(m.cy, FORWARD | DASH);
    expect(m.state(m.dee).stun).toBe(0);
    expect(m.flag(TEAM.RED)).toMatchObject({ state: FLAG.CARRIED, by: 3 });
    // After the cooldown, and the dash's own, he tackles again.
    m.send(m.cy, 0);
    m.ticks(Math.max(TACKLE_COOLDOWN, 60));
    m.put(m.cy, 0);
    m.put(m.dee, 1.9, 0.3);
    m.carry(m.dee);
    m.ticks(SNAP_EVERY);
    expect(
      until(
        () => m.flag(TEAM.RED).state === FLAG.DROPPED,
        () => m.send(m.cy, FORWARD | DASH),
      ),
    ).toBe(true);
    expect(m.state(m.dee).stun).toBe(STUMBLE_TICKS);
  });
});

/** A world to read a spawn from. */
function build1() {
  return Object.assign(Object.create(null), {
    def: { teams: duo(SPAWNS) },
  });
}
