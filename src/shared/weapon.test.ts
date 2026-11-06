import { describe, expect, it } from 'vitest';
import {
  AMMO_MAX,
  AMMO_PACK,
  DOWN_TICKS,
  END_SCREEN,
  FLAG_LOCK,
  GUN_COOLDOWN,
  HP_MAX,
  PACK_BACK,
  PACK_HP,
  SNAP_EVERY,
  TICK_HZ,
} from './constants';
import { decodeSnapshot, encodeInput } from './protocol';
import { Room } from './room';
import { STILL, spawn } from './physics';
import { FLAG, KEY, MODE, TEAM, TEX } from './types';
import type { Conn, PlayerState, Rules, Snapshot } from './types';
import type { Spawn, WorldDef } from './world';
import { duo } from '../../test/teams';

const { FORWARD, LEFT, FIRE, SPRINT, JUMP } = KEY;
const EAST = (3 * Math.PI) / 2;

const SPAWNS: Spawn[] = [
  [4, 1, 4, EAST],
  [4, 1, 12, EAST],
  [8, 1, 8, EAST],
  [12, 1, 4, EAST],
];
/**
 * A flat slab at y = 1, x and z from -100 to 100, with a wall across x = 30 that is 6 m high and
 * 20 m wide, a rack for each team and two health packs.
 */
const ARENA: WorldDef = {
  brushes: [
    { min: [-100, -5, -100], max: [100, 1, 100], top: TEX.TILE, side: TEX.BRICK },
    { min: [30, 1, -10], max: [30.5, 7, 10], top: TEX.STEEL, side: TEX.STEEL },
  ],
  teams: [
    { ...duo(SPAWNS)[0], base: [-60, 1, 4], rack: [-20, 1, 40] },
    {
      base: [60, 1, 4],
      spawns: SPAWNS.map(([x, y, z, yaw]): Spawn => [x + 40, y, z, yaw]),
      rack: [60, 1, 40],
    },
  ],
  packs: [
    [20, 1, 20],
    [-20, 1, 20],
  ],
  ammo: [
    [20, 1, -20],
    [-20, 1, -20],
  ],
  floor: -20,
  sun: { dir: [0, 1, 0], color: [1, 1, 1] },
  sky: [
    [0, 0, 1],
    [1, 1, 1],
  ],
};

type Peer = Conn & { bins: ArrayBuffer[] };
interface Look {
  view?: number;
  yaw?: number;
  pitch?: number;
}

/**
 * Four players, who join in this order: Ann (id 0) and Cy (2) are red, Bob (1) and Dee (3) blue.
 * Nobody carries a flag and everyone stands still on the slab, with no gun, facing east.
 */
const match = (rules: Partial<Rules> = {}) => {
  const room = new Room(rules, ARENA);
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
    /** Stands the player at (x, z) on the slab, at rest, facing east, with the gun when `ammo` says. */
    put: (c: Peer, x: number, z = 0, over: Partial<PlayerState> = {}) =>
      Object.assign(state(c), STILL, { x, y: 1, z, vy: 0, yaw: EAST, ground: true }, over),
    carry: (c: Peer) => {
      const { id, team } = room['peers'].get(c)!.info;
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
    send: (c: Peer, keys: number, { view = room['ticks'], yaw = EAST, pitch = 0 }: Look = {}) => {
      const seq = seqs.get(c) ?? 0;
      seqs.set(c, seq + 1);
      room.receive(c, encodeInput({ seq, keys, yaw, pitch, view }));
    },
    /** n inputs of the player, one a tick. */
    hold: (c: Peer, n: number, keys: number, look: Look = {}) => {
      for (let k = 0; k < n; k++) {
        api.send(c, keys, look);
        room.tick();
      }
    },
    /**
     * Holds FIRE until the player has fired `n` more shots. The history the host rewinds to is
     * written at snapshot ticks, so two ticks first let it see the puts of the test.
     */
    fire: (c: Peer, n = 1, look: Look = {}) => {
      api.ticks(SNAP_EVERY);
      const to = (state(c).shots + n) & 255;
      for (let k = 0; k < 200 && state(c).shots !== to; k++) {
        api.hold(c, 1, FIRE, look);
      }
    },
    snap: (c: Peer): Snapshot => decodeSnapshot(c.bins.at(-1)!)!,
    flag: (k: number) => room['ctf'].flags[k],
  };
  return api;
};

const GUN = { ammo: AMMO_MAX };

describe('a shot', () => {
  it('hits the enemy in front: he loses 1 hp and the shooter counts a hit', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.put(m.bob, 10);
    m.fire(m.cy);
    expect(m.state(m.bob).hp).toBe(HP_MAX - 1);
    expect(m.state(m.bob).down).toBe(0);
    expect([m.state(m.cy).shots, m.state(m.cy).hits, m.state(m.cy).ammo]).toEqual([
      1,
      1,
      AMMO_MAX - 1,
    ]);
    // Nobody else paid for it.
    expect([m.state(m.ann).hp, m.state(m.dee).hp, m.state(m.cy).hp]).toEqual([
      HP_MAX,
      HP_MAX,
      HP_MAX,
    ]);
    // The snapshot shows all of it.
    m.ticks(SNAP_EVERY);
    const players = m.snap(m.ann).players;
    expect(players.find(p => p.id === 1)).toMatchObject({ hp: HP_MAX - 1, down: 0 });
    expect(players.find(p => p.id === 2)).toMatchObject({ shots: 1, hits: 1, ammo: AMMO_MAX - 1 });
  });

  it('fires with no hit when nobody is there, and counts a shot but no hit', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.put(m.bob, 10, 5);
    m.fire(m.cy, 2);
    expect([m.state(m.cy).shots, m.state(m.cy).hits]).toEqual([2, 0]);
    expect(m.state(m.bob).hp).toBe(HP_MAX);
  });

  it('does not hit a teammate, and goes through him to the enemy behind', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.put(m.ann, 5);
    m.fire(m.cy);
    expect([m.state(m.ann).hp, m.state(m.cy).hits]).toEqual([HP_MAX, 0]);
    m.put(m.bob, 10);
    m.fire(m.cy);
    expect([m.state(m.ann).hp, m.state(m.bob).hp, m.state(m.cy).hits]).toEqual([
      HP_MAX,
      HP_MAX - 1,
      1,
    ]);
  });

  it('hits the nearest of two enemies in line', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.put(m.dee, 14);
    m.put(m.bob, 8);
    m.fire(m.cy);
    expect([m.state(m.bob).hp, m.state(m.dee).hp]).toEqual([HP_MAX - 1, HP_MAX]);
  });

  it('goes where the look goes: the yaw and the pitch of the input', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.put(m.bob, 10);
    // Up over his head, away to the side.
    m.fire(m.cy, 1, { pitch: 0.2 });
    m.fire(m.cy, 1, { yaw: EAST + 0.2 });
    expect(m.state(m.bob).hp).toBe(HP_MAX);
    // A little low, at his chest.
    m.fire(m.cy, 1, { pitch: -0.03 });
    expect(m.state(m.bob).hp).toBe(HP_MAX - 1);
    expect(m.state(m.cy).shots).toBe(3);
  });

  it('does not go through a brush, and does hit one in front of the wall', () => {
    const m = match();
    // The wall at x = 30 spans z from -10 to 10.
    m.put(m.cy, 20, 0, GUN);
    m.put(m.bob, 40);
    m.fire(m.cy);
    expect(m.state(m.bob).hp).toBe(HP_MAX);
    m.put(m.bob, 26);
    m.fire(m.cy);
    expect(m.state(m.bob).hp).toBe(HP_MAX - 1);
    // Round the end of the wall, it does not stop him.
    m.put(m.cy, 20, 12, { ...GUN, cool: 0 });
    m.put(m.bob, 40, 12);
    m.fire(m.cy);
    expect(m.state(m.bob).hp).toBe(HP_MAX - 1);
  });

  it('does not reach past GUN_RANGE', () => {
    const m = match();
    m.put(m.cy, -90, 0, GUN);
    m.put(m.bob, -5);
    m.fire(m.cy);
    expect(m.state(m.bob).hp).toBe(HP_MAX);
    m.put(m.bob, -15);
    m.fire(m.cy);
    expect(m.state(m.bob).hp).toBe(HP_MAX - 1);
  });

  it('hits a low target only below the standing eye: a crouched one is passed over', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.put(m.bob, 10);
    m.send(m.bob, KEY.CROUCH);
    m.ticks(SNAP_EVERY * 2);
    m.fire(m.cy);
    expect(m.state(m.bob).mode).toBe(MODE.CROUCH);
    expect(m.state(m.bob).hp).toBe(HP_MAX);
  });

  it('counts the hits modulo 256', () => {
    const m = match();
    m.put(m.cy, 0, 0, { ...GUN, hits: 255 });
    m.put(m.bob, 10);
    m.fire(m.cy);
    expect(m.state(m.cy).hits).toBe(0);
  });
});

describe('a shot as the shooter saw it', () => {
  it('hits where the target was on the shooter’s screen, though he has moved on', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.put(m.bob, 10);
    const seen = m.even();
    // Eight metres off the line on the host by the time the input arrives...
    m.put(m.bob, 10, 8);
    m.ticks(SNAP_EVERY * 2);
    // ...but Cy fired at where he drew him.
    m.send(m.cy, FIRE, { view: seen });
    expect(m.state(m.cy).shots).toBe(1);
    expect(m.state(m.bob).hp).toBe(HP_MAX - 1);
    expect(m.state(m.bob).z).toBe(8);
  });

  it('misses one who was off the line on the shooter’s screen, though he is on it now', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.put(m.bob, 10, 8);
    const seen = m.even();
    m.put(m.bob, 10);
    m.ticks(SNAP_EVERY * 2);
    m.send(m.cy, FIRE, { view: seen });
    expect(m.state(m.cy).shots).toBe(1);
    expect(m.state(m.bob).hp).toBe(HP_MAX);
    // With the view of now, the same shot hits.
    m.hold(m.cy, GUN_COOLDOWN, 0);
    m.send(m.cy, FIRE);
    expect(m.state(m.bob).hp).toBe(HP_MAX - 1);
  });

  it('cannot hit one who lies down now, nor one who was down then', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.put(m.bob, 10, 0, { hp: 0, down: 50 });
    m.fire(m.cy);
    expect([m.state(m.bob).hp, m.state(m.cy).hits]).toEqual([0, 0]);
    // Behind a body that lies down: the laser goes over him to the next one.
    m.put(m.dee, 14);
    m.fire(m.cy);
    expect([m.state(m.dee).hp, m.state(m.cy).hits]).toEqual([HP_MAX - 1, 1]);
    // He was down at the tick the shooter drew, up again now: the shooter saw a body on the floor.
    const n = match();
    n.put(n.cy, 0, 0, GUN);
    n.put(n.bob, 10, 0, { hp: 0, down: 50 });
    const seen = n.even();
    n.ticks(SNAP_EVERY);
    n.put(n.bob, 10);
    n.ticks(SNAP_EVERY * 2);
    n.send(n.cy, FIRE, { view: seen });
    expect([n.state(n.cy).shots, n.state(n.bob).hp]).toEqual([1, HP_MAX]);
  });
});

describe('going down', () => {
  it('takes HP_MAX hits: down for DOWN_TICKS, health 0, the gun gone', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.put(m.bob, 10, 0, { ammo: 20, cool: 3 });
    for (let k = 1; k < HP_MAX; k++) {
      m.fire(m.cy);
      expect([m.state(m.bob).hp, m.state(m.bob).down], `hit ${k}`).toEqual([HP_MAX - k, 0]);
    }
    m.fire(m.cy);
    expect(m.state(m.bob)).toMatchObject({ hp: 0, down: DOWN_TICKS, ammo: -1, cool: 0 });
    expect(m.state(m.cy).hits).toBe(HP_MAX);
    // On the wire: health 0 with `down` running says he is down.
    m.ticks(SNAP_EVERY);
    expect(m.snap(m.dee).players.find(p => p.id === 1)).toMatchObject({
      hp: 0,
      down: DOWN_TICKS,
      ammo: -1,
    });
    // One more shot passes through the body: no hit.
    m.fire(m.cy);
    expect([m.state(m.cy).hits, m.state(m.bob).hp]).toEqual([HP_MAX, 0]);
  });

  it('cannot move or fire while down, only fall; then he is back at a spawn of his team', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.put(m.bob, 10, 0, GUN);
    for (let k = 0; k < HP_MAX; k++) {
      m.fire(m.cy);
    }
    const [x, z] = [m.state(m.bob).x, m.state(m.bob).z];
    // He pushes every key, aims at Cy and fires.
    for (let k = 1; k < DOWN_TICKS; k++) {
      m.hold(m.bob, 1, FORWARD | LEFT | FIRE | SPRINT | JUMP, { yaw: (3 * Math.PI) / 2 + 1.5707 });
      expect(m.state(m.bob).down).toBe(DOWN_TICKS - k);
    }
    expect([m.state(m.bob).x, m.state(m.bob).z, m.state(m.bob).y]).toEqual([x, z, 1]);
    expect([m.state(m.bob).shots, m.state(m.cy).hp]).toEqual([0, HP_MAX]);
    m.hold(m.bob, 1, FORWARD);
    // Spawn n = his id in the blue list (x + 40).
    const at = spawn(1, room(m), 1, TEAM.BLUE);
    expect(m.state(m.bob)).toMatchObject({
      x: at.x,
      z: at.z,
      y: at.y,
      hp: HP_MAX,
      ammo: -1,
      cool: 0,
      down: 0,
    });
    // He plays again.
    m.hold(m.bob, 30, FORWARD);
    expect(m.state(m.bob).x).toBeGreaterThan(at.x + 1);
  });

  it('falls on the spot when he went down in the air', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    // 3 m up, hanging in the air for the host: the eye is at 2.6, so the look is up at his chest.
    m.put(m.bob, 10, 0, { y: 4, ground: false, mode: MODE.AIR, coyote: 0 });
    m.fire(m.cy, HP_MAX, { pitch: Math.atan2(4 + 0.9 - 2.6, 10) });
    expect(m.state(m.bob).down).toBe(DOWN_TICKS);
    m.hold(m.bob, 90, FORWARD);
    expect(m.state(m.bob).y).toBe(1);
    expect(m.state(m.bob).x).toBe(10);
    expect(m.state(m.bob).down).toBe(DOWN_TICKS - 90);
  });

  it('drops a carried flag where he fell, with the lock, and a lying body takes none', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.put(m.bob, 10);
    m.carry(m.bob);
    for (let k = 0; k < HP_MAX - 1; k++) {
      m.fire(m.cy);
    }
    expect(m.flag(TEAM.RED).state).toBe(FLAG.CARRIED);
    m.fire(m.cy);
    expect(m.flag(TEAM.RED)).toMatchObject({ state: FLAG.DROPPED, x: 10, y: 1, z: 0 });
    // Past the lock he does not pick it up again: he is lying on it, down.
    m.ticks(FLAG_LOCK * TICK_HZ + 5);
    expect(m.flag(TEAM.RED).state).toBe(FLAG.DROPPED);
    // A red player cannot send it home within the lock (the shooter's team, standing on it)...
    const n = match();
    n.put(n.cy, 0, 0, GUN);
    n.put(n.bob, 10);
    n.carry(n.bob);
    n.fire(n.cy, HP_MAX);
    n.put(n.ann, 10, 0);
    n.ticks(FLAG_LOCK * TICK_HZ - 10);
    expect(n.flag(TEAM.RED).state).toBe(FLAG.DROPPED);
    // ...and does once it has lain its time.
    n.ticks(15);
    expect(n.flag(TEAM.RED).state).toBe(FLAG.HOME);
  });

  it('is shot down only by the enemy’s shots: friendly fire changes nothing', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.put(m.ann, 10);
    m.fire(m.cy, HP_MAX + 2);
    expect(m.state(m.ann)).toMatchObject({ hp: HP_MAX, down: 0 });
  });
});

describe('health packs', () => {
  const PACKS = 0b11;
  const packs = (m: ReturnType<typeof match>) => {
    m.ticks(SNAP_EVERY);
    // The health packs' bits only: the ammo packs follow them.
    return m.snap(m.ann).packs! & 0b11;
  };

  it('are all there at the start, and show in the snapshot', () => {
    const m = match();
    expect(packs(m)).toBe(PACKS);
  });

  it('heal a hurt player by PACK_HP, and are gone PACK_BACK seconds', () => {
    const m = match();
    m.put(m.bob, 20, 20, { hp: 1 });
    m.ticks(1);
    expect(m.state(m.bob).hp).toBe(1 + PACK_HP);
    expect(PACK_HP).toBe(2);
    // The first pack is gone for everyone: the snapshot says so.
    expect(packs(m)).toBe(0b10);
    // A second hurt player standing there gets nothing (the first one walks off).
    m.state(m.bob).x = 50;
    m.put(m.dee, 20, 20, { hp: 1 });
    m.ticks(SNAP_EVERY * 2);
    expect(m.state(m.dee).hp).toBe(1);
    // It is back after PACK_BACK s (from the tick it was taken), and then it heals the one waiting.
    m.ticks(PACK_BACK * TICK_HZ - 2 * SNAP_EVERY - 5);
    expect(m.state(m.dee).hp).toBe(1);
    expect(packs(m)).toBe(0b10);
    m.ticks(10);
    expect(m.state(m.dee).hp).toBe(1 + PACK_HP);
    expect(packs(m)).toBe(0b10);
    // The other pack was there all along.
    m.put(m.cy, -20, 20, { hp: 4 });
    m.ticks(1);
    expect(m.state(m.cy).hp).toBe(HP_MAX);
    expect(packs(m)).toBe(0);
  });

  it('give up to HP_MAX, and are not taken at full health', () => {
    const m = match();
    m.put(m.bob, 20, 20);
    m.ticks(SNAP_EVERY * 5);
    expect(m.state(m.bob).hp).toBe(HP_MAX);
    expect(packs(m)).toBe(PACKS);
    m.state(m.bob).hp = HP_MAX - 1;
    m.ticks(1);
    expect(m.state(m.bob).hp).toBe(HP_MAX);
    expect(packs(m)).toBe(0b10);
  });

  it('need the feet within PACK_R and about a metre of the pack’s height, and nobody who lies down', () => {
    const m = match();
    // 1 m off, past PACK_R (0.9).
    m.put(m.bob, 21, 20, { hp: 2 });
    // On the pack's spot, 3 m above it.
    m.put(m.dee, 20, 20, { hp: 2, y: 4, ground: false, mode: MODE.AIR });
    // And one lying on it.
    m.put(m.cy, -20, 20, { hp: 0, down: 40 });
    m.ticks(1);
    expect([m.state(m.bob).hp, m.state(m.dee).hp, m.state(m.cy).hp]).toEqual([2, 2, 0]);
    expect(packs(m)).toBe(PACKS);
    // Close enough, 0.8 m, takes it.
    m.state(m.bob).x = 20.8;
    m.ticks(1);
    expect(m.state(m.bob).hp).toBe(4);
  });

  it('are for every team', () => {
    const m = match();
    m.put(m.ann, -20, 20, { hp: 3 });
    m.ticks(1);
    expect(m.state(m.ann).hp).toBe(5);
  });
});

describe('ammo packs', () => {
  const bits = (m: ReturnType<typeof match>) => {
    m.ticks(SNAP_EVERY);
    return m.snap(m.ann).packs;
  };

  it('come after the health packs in the snapshot, all there at the start', () => {
    const m = match();
    expect(bits(m)).toBe(0b1111);
    // A health pack taken clears bit 0; an ammo pack bit 2 (health packs: 2).
    m.put(m.bob, 20, 20, { hp: 1 });
    m.put(m.dee, -20, -20, { ammo: 5 });
    m.ticks(1);
    expect(bits(m)).toBe(0b0110);
  });

  it('give AMMO_PACK shots up to AMMO_MAX, and are gone PACK_BACK seconds', () => {
    const m = match();
    m.put(m.cy, 20, -20, { ammo: 10 });
    m.ticks(1);
    expect(m.state(m.cy).ammo).toBe(10 + AMMO_PACK);
    expect(AMMO_PACK).toBe(20);
    expect(bits(m)! & 0b0100).toBe(0);
    // A second player with a gun gets nothing from the gone pack...
    m.put(m.ann, 20, -20, { ammo: 10 });
    m.ticks(SNAP_EVERY * 2);
    expect(m.state(m.ann).ammo).toBe(10);
    // ...until it is back, after PACK_BACK s from the pick-up.
    m.ticks(PACK_BACK * TICK_HZ - SNAP_EVERY * 4 - 5);
    expect(m.state(m.ann).ammo).toBe(10);
    m.ticks(10);
    expect(m.state(m.ann).ammo).toBe(10 + AMMO_PACK);
  });

  it('stops at AMMO_MAX, and is not taken with a full gun', () => {
    const m = match();
    m.put(m.cy, 20, -20, { ammo: AMMO_MAX - 5 });
    m.ticks(1);
    expect(m.state(m.cy).ammo).toBe(AMMO_MAX);
    const n = match();
    n.put(n.cy, -20, -20, { ammo: AMMO_MAX });
    n.ticks(SNAP_EVERY * 3);
    expect(n.snap(n.ann).packs).toBe(0b1111);
  });

  it('are not taken without the gun, nor by a player who lies down, nor from out of reach', () => {
    const m = match();
    m.put(m.cy, 20, -20);
    m.put(m.bob, -20, -20, { ammo: 3, hp: 0, down: 30 });
    // 1 m off, past PACK_R, and 3 m above the pack.
    m.put(m.dee, 21, -20, { ammo: 3 });
    m.put(m.ann, 20, -20, { ammo: 3, y: 4, ground: false, mode: MODE.AIR });
    m.ticks(SNAP_EVERY * 2);
    expect([
      m.state(m.cy).ammo,
      m.state(m.bob).ammo,
      m.state(m.dee).ammo,
      m.state(m.ann).ammo,
    ]).toEqual([-1, 3, 3, 3]);
    expect(bits(m)).toBe(0b1111);
    // An empty gun (0 shots) is a gun: it takes it.
    m.put(m.cy, 20, -20, { ammo: 0 });
    m.ticks(1);
    expect(m.state(m.cy).ammo).toBe(AMMO_PACK);
  });

  it('are back for a new match, which also takes the guns', () => {
    const m = match({ timeLimit: 1 });
    m.put(m.cy, 20, -20, { ammo: 10 });
    m.ticks(1);
    expect(m.room['gone'][2]).toBeGreaterThan(0);
    m.ticks(TICK_HZ + END_SCREEN * TICK_HZ + 2);
    expect(m.snap(m.ann).packs).toBe(0b1111);
    expect(m.state(m.cy).ammo).toBe(-1);
  });
});

describe('the rack through the room', () => {
  it('gives the gun at the team’s rack, the other team’s rack nothing', () => {
    const m = match();
    m.put(m.cy, -20, 40);
    m.put(m.bob, -20, 40);
    m.hold(m.cy, 1, 0);
    m.hold(m.bob, 1, 0);
    expect([m.state(m.cy).ammo, m.state(m.bob).ammo]).toEqual([AMMO_MAX, -1]);
    // Down, he has none and takes none.
    m.put(m.ann, -20, 40, { hp: 0, down: 20 });
    m.hold(m.ann, 1, 0);
    expect(m.state(m.ann).ammo).toBe(-1);
  });
});

describe('the rack, arrival only', () => {
  it('fills on arrival, lets him stay and fire to the end of the gun, shows the bit in the snapshot', () => {
    const m = match();
    m.put(m.cy, -30, 40);
    m.hold(m.cy, 1, 0);
    expect(m.state(m.cy)).toMatchObject({ ammo: -1, rack: false });
    m.state(m.cy).x = -20;
    m.hold(m.cy, 1, 0);
    expect(m.state(m.cy)).toMatchObject({ ammo: AMMO_MAX, rack: true });
    // On the rack, FIRE held for 100 steps: 15 shots, no refill.
    m.hold(m.cy, 100, FIRE);
    expect([m.state(m.cy).shots, m.state(m.cy).ammo]).toEqual([15, AMMO_MAX - 15]);
    m.ticks(SNAP_EVERY);
    expect(m.snap(m.ann).players.find(p => p.id === 2)).toMatchObject({
      rack: true,
      ammo: AMMO_MAX - 15,
    });
    // He leaves the circle and comes back: filled again.
    m.state(m.cy).x = -10;
    m.hold(m.cy, 1, 0);
    expect(m.state(m.cy).rack).toBe(false);
    m.state(m.cy).x = -20;
    m.hold(m.cy, 1, 0);
    expect(m.state(m.cy).ammo).toBe(AMMO_MAX);
  });

  it('does not count a respawn at a far spawn as being on the rack', () => {
    const m = match();
    m.put(m.cy, -20, 40, { hp: 0, down: 1, rack: true });
    m.hold(m.cy, 1, 0);
    expect(m.state(m.cy)).toMatchObject({ rack: false, ammo: -1, hp: HP_MAX });
  });
});

describe('a match', () => {
  it('does not let anyone fire or take a rack while the end screen shows', () => {
    const m = match({ timeLimit: 1 });
    m.put(m.cy, 0, 0, GUN);
    m.put(m.bob, 10);
    m.ticks(TICK_HZ + 1);
    expect(m.snap(m.ann).over).toBe(true);
    m.hold(m.cy, GUN_COOLDOWN * 2, FIRE);
    expect([m.state(m.cy).shots, m.state(m.bob).hp, m.state(m.cy).ammo]).toEqual([0, HP_MAX, 60]);
    m.put(m.ann, -20, 40);
    m.hold(m.ann, 3, 0);
    expect(m.state(m.ann).ammo).toBe(-1);
  });

  it('starts again with full health, no guns, every pack there and the counters going on', () => {
    const m = match({ timeLimit: 1 });
    m.put(m.cy, 0, 0, { ...GUN, shots: 40, hits: 30 });
    m.put(m.bob, 10, 0, { hp: 2, ammo: 9 });
    m.put(m.dee, 20, 20, { hp: 1 });
    m.put(m.ann, 0, 30, { hp: 0, down: 90 });
    m.ticks(2);
    expect(m.state(m.dee).hp).toBe(1 + PACK_HP);
    m.ticks(TICK_HZ + END_SCREEN * TICK_HZ + 2);
    expect(m.snap(m.ann).over).toBe(false);
    for (const c of [m.ann, m.bob, m.cy, m.dee]) {
      expect(m.state(c), `player ${m.state(c).id}`).toMatchObject({
        hp: HP_MAX,
        ammo: -1,
        cool: 0,
        down: 0,
      });
    }
    expect([m.state(m.cy).shots, m.state(m.cy).hits]).toEqual([40, 30]);
    expect(m.snap(m.ann).packs).toBe(0b1111);
  });

  it('resets the packs when the room empties', () => {
    const m = match();
    m.put(m.bob, 20, 20, { hp: 1 });
    m.ticks(1);
    expect(m.room['gone'][0]).toBeGreaterThan(0);
    for (const c of [m.ann, m.bob, m.cy, m.dee]) {
      m.room.disconnect(c);
    }
    expect(m.room['gone']).toEqual([0, 0, 0, 0]);
  });
});

/** The world of a match's room. */
function room(m: ReturnType<typeof match>) {
  return m.room['world'];
}

describe('random fire', () => {
  it('keeps every gun field in range, and the snapshot equal to the state, whoever shoots whom', () => {
    const m = match();
    const all = [m.ann, m.bob, m.cy, m.dee];
    let s = 4242;
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    all.forEach((c, k) => m.put(c, 4 + k * 3, 2 + k, GUN));
    const keys = new Map(all.map(c => [c, 0]));
    const down = new Set<number>();
    let hits = 0;
    let went = 0;
    let respawned = 0;
    let taken = 0;
    let prev = all.map(c => ({ ...m.state(c) }));
    for (let k = 0; k < 6000; k++) {
      all.forEach((c, n) => {
        if (k % 5 === 0) {
          // FIRE half of the time, and a walk, a hop or nothing with it.
          keys.set(
            c,
            (rnd() < 0.6 ? FIRE : 0) | (rnd() < 0.5 ? FORWARD : 0) | (rnd() < 0.1 ? JUMP : 0),
          );
        }
        // At a random enemy, with a little noise, or at nothing.
        const foes = all.filter((_, j) => j % 2 !== n % 2);
        const f = m.state(foes[Math.floor(rnd() * foes.length)]);
        const me = m.state(c);
        const yaw =
          rnd() < 0.8 ? Math.atan2(-(f.x - me.x), -(f.z - me.z)) + (rnd() - 0.5) * 0.2 : rnd() * 6;
        m.send(c, keys.get(c)!, { yaw, pitch: (rnd() - 0.5) * 0.2 });
      });
      m.ticks(1);
      // Out of ammo or in the ground? Fill it from the rack now and then, and keep them on the slab.
      all.forEach((c, n) => {
        const p = m.state(c);
        const label = `tick ${k}, player ${p.id}`;
        expect(p.hp, label).toBeGreaterThanOrEqual(0);
        expect(p.hp, label).toBeLessThanOrEqual(HP_MAX);
        expect(p.ammo, label).toBeGreaterThanOrEqual(-1);
        expect(p.ammo, label).toBeLessThanOrEqual(AMMO_MAX);
        expect(p.cool, label).toBeLessThanOrEqual(GUN_COOLDOWN);
        expect(p.down, label).toBeLessThanOrEqual(DOWN_TICKS);
        // Down is health 0 and no gun, and health 0 is down.
        expect(p.down > 0, label).toBe(p.hp === 0);
        if (p.down) {
          expect(p.ammo, label).toBe(-1);
          down.add(p.id);
        }
        for (const v of [p.shots, p.hits]) {
          expect(Number.isInteger(v) && v >= 0 && v < 256, label).toBe(true);
        }
        // A counter moves forward by one at most per tick (a shot every GUN_COOLDOWN inputs).
        expect((p.shots - prev[n].shots) & 255, label).toBeLessThanOrEqual(1);
        expect((p.hits - prev[n].hits) & 255, label).toBeLessThanOrEqual(1);
        hits += (p.hits - prev[n].hits) & 255;
        went += +(p.down > 0 && prev[n].down === 0);
        respawned += +(p.down === 0 && prev[n].down > 0);
        // Ammo only goes up at a rack or an ammo pack.
        if (p.ammo > prev[n].ammo) {
          expect(p.ammo === AMMO_MAX || p.ammo - prev[n].ammo === AMMO_PACK, label).toBe(true);
          taken += +(p.ammo - prev[n].ammo === AMMO_PACK);
        }
        prev[n] = { ...p };
      });
      if (k % 50 === 0) {
        // Give the dead their guns back, so the run keeps firing: a rack is far away.
        all.forEach(c => {
          if (m.state(c).ammo <= 0 && !m.state(c).down) {
            m.state(c).ammo = AMMO_MAX;
          }
        });
        // And keep everyone near each other.
        all.forEach((c, n) => {
          const p = m.state(c);
          if (Math.hypot(p.x - 12, p.z - 8) > 14) {
            Object.assign(p, { x: 4 + n * 3, z: 2 + n });
          }
        });
        // The snapshot of this very tick.
        m.even();
        const back = new Map(m.snap(m.ann).players.map(p => [p.id, p]));
        for (const c of all) {
          const p = m.state(c);
          expect(back.get(p.id), `tick ${k}`).toMatchObject({
            hp: p.hp,
            ammo: p.ammo,
            cool: p.cool,
            down: p.down,
            shots: p.shots,
            hits: p.hits,
          });
        }
        prev = all.map(c => ({ ...m.state(c) }));
        // Now and then one with a half empty gun stands on an ammo pack (they are far off the fight).
        if (k % 200 === 0 && !m.state(all[1]).down) {
          Object.assign(m.state(all[1]), { x: 20, z: -20, ammo: 10 });
        }
        prev = all.map(c => ({ ...m.state(c) }));
      }
    }
    // The run is not a trivial one: shots hit, players went down and came back.
    expect(hits).toBeGreaterThan(50);
    expect(went).toBeGreaterThan(3);
    expect(respawned).toBeGreaterThan(1);
    expect(taken).toBeGreaterThan(2);
    expect(down.size).toBeGreaterThan(1);
  }, 60_000);
});
