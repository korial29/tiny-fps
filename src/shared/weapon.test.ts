import { describe, expect, it } from 'vitest';
import {
  AMMO_MAX,
  AMMO_PACK,
  CHARGE_MAX,
  CHARGE_TICKS,
  LOCK_BREAK,
  LOCK_HP,
  LOCK_TICKS,
  LOCK_WIN,
  CUTS,
  DOWN_TICKS,
  END_SCREEN,
  FLAG_LOCK,
  GUN_COOLDOWN,
  GUN_RANGE,
  HP_MAX,
  PACK_BACK,
  PACK_HP,
  PLASMA_MAX,
  PLASMA_R,
  PLAYER_R,
  RAIL_CELL,
  RAIL_MAX,
  RAIL_RANGE,
  RAIL_TICKS,
  RUN_SPEED,
  SLOW_SPEED,
  SHOCK_KNOCK,
  SHOCK_TICKS,
  SNAP_EVERY,
  TICK_HZ,
} from './constants';
import { PLAYER_H } from './constants';
import { cutOf } from './blade';
import { decodeSnapshot, encodeInput } from './protocol';
import { Room } from './room';
import { STILL, spawn, speedOf } from './physics';
import { PLASMA_LAG, PLASMA_STEP, launch } from './plasma';
import { CUT, FLAG, KEY, LIMB, MODE, TEAM, TEX } from './types';
import type { Conn, PlayerState, Rules, Snapshot } from './types';
import type { Spawn, WorldDef } from './world';
import { duo } from '../../test/teams';

const { FORWARD, LEFT, RIGHT, BACK, FIRE, SPRINT, JUMP, DASH, BLADE, RAIL } = KEY;
const EAST = (3 * Math.PI) / 2;

const SPAWNS: Spawn[] = [
  [4, 1, 4, EAST],
  [4, 1, 12, EAST],
  [8, 1, 8, EAST],
  [12, 1, 4, EAST],
];
/**
 * A flat slab at y = 1, x and z from -100 to 100, with a wall across x = 30 that is 6 m high and
 * 20 m wide, a gun rack, a katana rack and a rail rack for each team and two health packs, two ammo packs.
 */
const ARENA: WorldDef = {
  brushes: [
    { min: [-100, -5, -100], max: [100, 1, 100], top: TEX.TILE, side: TEX.BRICK },
    { min: [30, 1, -10], max: [30.5, 7, 10], top: TEX.STEEL, side: TEX.STEEL },
  ],
  teams: [
    {
      ...duo(SPAWNS)[0],
      base: [-60, 1, 4],
      rack: [-20, 1, 40],
      blade: [-20, 1, 43],
      rail: [-20, 1, 46],
    },
    {
      base: [60, 1, 4],
      spawns: SPAWNS.map(([x, y, z, yaw]): Spawn => [x + 40, y, z, yaw]),
      rack: [60, 1, 40],
      blade: [60, 1, 43],
      rail: [60, 1, 46],
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
const match = (rules: Partial<Rules> = {}, def = ARENA) => {
  const room = new Room(rules, def);
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
    /** A tap of FIRE: pressed, then let go on a second input, both seeing `look`: the release fires. */
    tap: (c: Peer, look: Look = {}) => {
      api.send(c, FIRE, look);
      api.send(c, 0, look);
    },
    /** n inputs of the player with `keys`, one a tick, tapping FIRE: pressed on one, let go on the next. */
    taps: (c: Peer, n: number, keys = 0, look: Look = {}) => {
      for (let k = 0; k < n; k++) {
        api.send(c, keys | (k % 2 ? 0 : FIRE), look);
        room.tick();
      }
    },
    /** n inputs of the player, one a tick. */
    hold: (c: Peer, n: number, keys: number, look: Look = {}) => {
      for (let k = 0; k < n; k++) {
        api.send(c, keys, look);
        room.tick();
      }
    },
    /**
     * Taps FIRE until the player has fired `n` more shots, then ticks until their balls are
     * spent. The history the host rewinds to is written at snapshot ticks, so two ticks first let
     * it see the puts of the test.
     */
    fire: (c: Peer, n = 1, look: Look = {}) => {
      api.ticks(SNAP_EVERY);
      const to = (state(c).shots + n) & 255;
      for (let k = 0; k < 400 && state(c).shots !== to; k++) {
        api.hold(c, 1, k % 2 ? 0 : FIRE, look);
      }
      api.land();
    },
    /** Ticks until no ball flies. */
    land: () => {
      for (let k = 0; k < 300 && room['balls'].length; k++) {
        room.tick();
      }
    },
    snap: (c: Peer): Snapshot => decodeSnapshot(c.bins.at(-1)!)!,
    flag: (k: number) => room['ctf'].flags[k],
  };
  return api;
};

const GUN = { ammo: AMMO_MAX };
const RAILGUN = { rail: RAIL_MAX };

describe('the rail gun', () => {
  /**
   * n steps of `c` holding the bolt, one a tick, after two ticks for the history to see the puts;
   * `also` sends a step of each of them with no keys at each tick, so their drain runs.
   */
  const bolt = (
    m: ReturnType<typeof match>,
    c: Peer,
    n = 1,
    also: Peer[] = [],
    look: Look = {},
  ) => {
    m.ticks(SNAP_EVERY);
    for (let k = 0; k < n; k++) {
      m.send(c, RAIL | FIRE, look);
      also.forEach(o => m.send(o, 0));
      m.room.tick();
    }
  };

  it('is taken at its rack on arrival with RAIL_MAX ticks of lightning, and is in hand when wanted', () => {
    const m = match();
    m.put(m.cy, -20, 46);
    m.hold(m.cy, 1, RAIL);
    expect(m.state(m.cy)).toMatchObject({ rail: RAIL_MAX, railed: true, inRail: true, ammo: -1 });
    // With the gun too, the gun is in hand unless the rail gun is wanted.
    m.put(m.cy, 0, 0, { ...GUN, ...RAILGUN });
    m.hold(m.cy, 1, 0);
    expect(m.state(m.cy)).toMatchObject({ railed: false, wield: false });
    m.hold(m.cy, 1, RAIL);
    expect(m.state(m.cy).railed).toBe(true);
  });

  it('spends a tick of lightning on each step held, and goes out when let go or empty', () => {
    const m = match();
    m.put(m.cy, 0, 0, RAILGUN);
    m.hold(m.cy, 30, RAIL | FIRE, { yaw: 0 });
    expect(m.state(m.cy)).toMatchObject({ rail: RAIL_MAX - 30, zapping: true, shots: 0 });
    m.hold(m.cy, 1, RAIL, { yaw: 0 });
    expect(m.state(m.cy)).toMatchObject({ rail: RAIL_MAX - 30, zapping: false });
    m.put(m.cy, 0, 0, { rail: 1 });
    m.hold(m.cy, 2, RAIL | FIRE, { yaw: 0 });
    expect(m.state(m.cy)).toMatchObject({ rail: 0, zapping: false });
  });

  it('touches the first enemy on the look: 1 hp and a hit at the first touch, drained and slowed', () => {
    const m = match();
    m.put(m.cy, 0, 0, RAILGUN);
    m.put(m.bob, 10);
    m.put(m.dee, 20);
    bolt(m, m.cy, 5);
    expect(m.state(m.bob)).toMatchObject({ hp: HP_MAX - 1, slow: RAIL_TICKS });
    expect(m.state(m.dee)).toMatchObject({ hp: HP_MAX });
    // One hit for the touch, however long it is held; no ball.
    expect(m.state(m.cy)).toMatchObject({ hits: 1, rail: RAIL_MAX - 5 });
    expect(m.room['balls']).toHaveLength(0);
  });

  it('drains 1 hp a second while it holds him, and for 3 s after it lets go', () => {
    const m = match();
    m.put(m.cy, 0, 0, RAILGUN);
    m.put(m.bob, 10);
    const hp = () => m.state(m.bob).hp;
    bolt(m, m.cy, 59, [m.bob]);
    expect(hp()).toBe(HP_MAX - 1);
    bolt(m, m.cy, 1, [m.bob]);
    expect(hp()).toBe(HP_MAX - 2);
    // Let go: 179 ticks of drain left, two more seconds of it.
    m.hold(m.bob, 200, 0);
    expect([hp(), m.state(m.bob).slow]).toEqual([HP_MAX - 4, 0]);
  });

  it('slows him under SLOW_SPEED while drained, and he runs again after', () => {
    const m = match();
    m.put(m.cy, 0, 0, RAILGUN);
    m.put(m.bob, 10, 0, { hp: HP_MAX });
    bolt(m, m.cy);
    m.hold(m.bob, 60, FORWARD | SPRINT, { yaw: Math.PI });
    expect(speedOf(m.state(m.bob))).toBeLessThanOrEqual(SLOW_SPEED + 1e-6);
    m.hold(m.bob, RAIL_TICKS, FORWARD, { yaw: Math.PI });
    expect(speedOf(m.state(m.bob))).toBeCloseTo(RUN_SPEED, 3);
  });

  it('stops at a brush and at RAIL_RANGE, and passes over a teammate to the enemy behind', () => {
    const m = match();
    m.put(m.cy, 25, 0, RAILGUN);
    m.put(m.bob, 35);
    bolt(m, m.cy);
    expect(m.state(m.bob).hp).toBe(HP_MAX);
    m.put(m.cy, -10, 0, RAILGUN);
    m.put(m.bob, -10 + RAIL_RANGE + 1);
    bolt(m, m.cy);
    expect(m.state(m.bob).hp).toBe(HP_MAX);
    m.put(m.cy, 0, 0, RAILGUN);
    m.put(m.ann, 5);
    m.put(m.bob, 10);
    bolt(m, m.cy);
    expect([m.state(m.ann).hp, m.state(m.bob).hp]).toEqual([HP_MAX, HP_MAX - 1]);
  });

  it('disintegrates a foe it puts down: fried, the drain over, his own rail gun gone', () => {
    const m = match();
    m.put(m.cy, 0, 0, RAILGUN);
    m.put(m.bob, 10, 0, { hp: 1, rail: 4, railed: true });
    bolt(m, m.cy);
    expect(m.state(m.bob)).toMatchObject({
      hp: 0,
      down: DOWN_TICKS,
      slow: 0,
      rail: -1,
      fried: true,
    });
    m.ticks(SNAP_EVERY);
    expect(m.snap(m.ann).players.find(p => p.id === 1)).toMatchObject({ fried: true });
    // Back up, he is whole again.
    m.hold(m.bob, DOWN_TICKS + 1, 0);
    expect(m.state(m.bob)).toMatchObject({ down: 0, fried: false });
  });

  it('does not disintegrate one it does not put down', () => {
    const m = match();
    m.put(m.cy, 0, 0, RAILGUN);
    m.put(m.bob, 10, 0, { hp: 3 });
    bolt(m, m.cy);
    expect(m.state(m.bob).fried).toBe(false);
  });
});

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

describe('a charged shot', () => {
  /** Cy holds FIRE `n` steps at Bob, 10 m east, then lets go; then the ball lands. */
  const charged = (n: number) => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.put(m.bob, 10);
    m.ticks(SNAP_EVERY);
    m.hold(m.cy, n, FIRE);
    const held = { ...m.state(m.cy) };
    m.tap(m.cy);
    // The tap's own press starts a new charge of 1; its release fires nothing more: the cooldown.
    const ball = m.room['balls'].find(b => b.by === 2);
    m.land();
    return { m, held, ball };
  };

  it('puts any foe down at the full charge, spending CHARGE_MAX shots on one ball', () => {
    const { m, held, ball } = charged(CHARGE_TICKS + 20);
    expect([held.charge, held.shots, held.ammo]).toEqual([CHARGE_TICKS, 0, AMMO_MAX]);
    expect(ball!.power).toBe(CHARGE_MAX);
    expect(m.state(m.cy)).toMatchObject({ shots: 1, hits: 1, ammo: AMMO_MAX - CHARGE_MAX });
    expect(m.state(m.bob)).toMatchObject({ hp: 0, down: DOWN_TICKS, ammo: -1 });
  });

  it('takes as much health as its strength: half a charge is 3', () => {
    const { m, ball } = charged(35);
    expect(ball!.power).toBe(3);
    expect(m.state(m.bob).hp).toBe(HP_MAX - 3);
    expect(m.state(m.cy).ammo).toBe(AMMO_MAX - 3);
  });

  it('shows the charge and the ball’s strength in the snapshot', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.hold(m.cy, 40, FIRE);
    m.ticks(SNAP_EVERY);
    expect(m.snap(m.ann).players.find(p => p.id === 2)!.charge).toBe(40);
    m.send(m.cy, 0);
    m.ticks(SNAP_EVERY);
    expect(m.snap(m.ann).balls?.[0]).toMatchObject({ by: 2, power: 3 });
  });
});

describe('a ball and the shooter’s lag', () => {
  /** Where the ball of Cy's next shot starts: the eye, flown on by his lag (`back` ticks). */
  const start = (back: number, view?: number) => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.ticks(40);
    m.tap(m.cy, { view: view ?? m.room['ticks'] - back });
    return m.room['balls'][0];
  };

  it('starts where the shooter saw it start: flown on by the ticks from his view to now', () => {
    expect(start(0).x).toBe(0);
    expect(start(6).x).toBeCloseTo(6 * PLASMA_STEP, 9);
    expect(start(2.5).x).toBeCloseTo(2.5 * PLASMA_STEP, 9);
    // At most PLASMA_LAG ticks, and none for a view ahead of now.
    expect(PLASMA_LAG).toBe(12);
    expect(start(30).x).toBeCloseTo(PLASMA_LAG * PLASMA_STEP, 9);
    expect(start(-3).x).toBe(0);
    // An input with no view (it saw no snapshot) reads 0: far back, the most.
    expect(start(0, 0).x).toBeCloseTo(PLASMA_LAG * PLASMA_STEP, 9);
  });

  it('hits on that stretch an enemy who is on it now, and bursts on a brush there', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.put(m.bob, 4);
    m.ticks(SNAP_EVERY);
    m.tap(m.cy, { view: m.room['ticks'] - 6 });
    // At once, with the input: no tick has run.
    expect([m.state(m.bob).hp, m.state(m.cy).hits]).toEqual([HP_MAX - 1, 1]);
    expect(m.room['balls'][0]).toMatchObject({
      burst: true,
      x: expect.closeTo(4 - PLAYER_R - PLASMA_R, 6),
    });
    const n = match();
    // The wall at x = 30.
    n.put(n.cy, 25, 0, GUN);
    n.ticks(SNAP_EVERY);
    n.tap(n.cy, { view: n.room['ticks'] - 8 });
    expect(n.room['balls'][0]).toMatchObject({ burst: true, x: expect.closeTo(30 - PLASMA_R, 6) });
  });

  it('can be dodged: a target that steps off the line before the ball arrives is not hit', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.put(m.bob, 30);
    m.ticks(SNAP_EVERY);
    m.tap(m.cy);
    // The ball takes 45 ticks to come 30 m; after 20 he steps a metre aside.
    m.ticks(20);
    expect(m.room['balls'][0].x).toBeCloseTo(20 * PLASMA_STEP, 9);
    m.put(m.bob, 30, 1);
    m.land();
    expect([m.state(m.bob).hp, m.state(m.cy).hits]).toEqual([HP_MAX, 0]);
    // One who steps into its way is hit.
    m.put(m.cy, 0, 0, GUN);
    m.put(m.bob, 30, 3);
    m.ticks(SNAP_EVERY);
    m.tap(m.cy);
    m.ticks(20);
    m.put(m.bob, 30, 0);
    m.land();
    expect([m.state(m.bob).hp, m.state(m.cy).hits]).toEqual([HP_MAX - 1, 1]);
  });

  it('passes through one who lies down, to the next one', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.put(m.bob, 10, 0, { hp: 0, down: 80 });
    m.fire(m.cy);
    expect([m.state(m.bob).hp, m.state(m.cy).hits]).toEqual([0, 0]);
    m.put(m.dee, 14);
    m.fire(m.cy);
    expect([m.state(m.dee).hp, m.state(m.cy).hits]).toEqual([HP_MAX - 1, 1]);
  });
});

describe('the balls on the wire', () => {
  it('go in every snapshot while they fly, named by the shooter’s shots, and once more where they burst', () => {
    const m = match();
    m.put(m.cy, 0, 0, { ...GUN, shots: 41 });
    m.put(m.bob, 20);
    m.even();
    m.tap(m.cy);
    const seen: Snapshot[] = [];
    for (let k = 0; k < 40; k++) {
      m.room.tick();
      if (m.room['ticks'] % SNAP_EVERY === 0) {
        seen.push(m.snap(m.ann));
      }
    }
    const flying = seen.filter(s => s.balls?.some(b => !b.burst));
    const burst = seen.filter(s => s.balls?.some(b => b.burst));
    expect(flying.length).toBeGreaterThan(10);
    expect(burst).toHaveLength(1);
    expect(seen.at(-1)!.balls).toBeUndefined();
    const [b] = flying[0].balls!;
    expect(b).toMatchObject({ id: 42, by: 2, burst: false, y: 2.59375, z: 0 });
    expect([b.dx, b.dy, b.dz]).toEqual([
      expect.closeTo(1, 9),
      expect.closeTo(0, 9),
      expect.closeTo(0, 9),
    ]);
    // Each snapshot 2 ticks further on, to 1/32 m.
    const x = flying.map(s => s.balls![0].x);
    x.slice(1).forEach((v, k) => expect(v - x[k]).toBeCloseTo(2 * PLASMA_STEP, 1));
    // It burst in front of Bob, who lost 1 hp.
    expect(burst[0].balls![0].x).toBeCloseTo(20 - PLAYER_R - PLASMA_R, 1);
    expect(m.state(m.bob).hp).toBe(HP_MAX - 1);
  });

  it('are gone without a burst when they have flown GUN_RANGE', () => {
    const m = match();
    m.put(m.cy, -50, 50, { ...GUN, yaw: EAST });
    m.tap(m.cy);
    let last: Snapshot | undefined;
    for (let k = 0; k < 130; k++) {
      const flies = m.room['balls'].length > 0;
      m.room.tick();
      if (flies && m.room['ticks'] % SNAP_EVERY === 0) {
        last = m.snap(m.ann);
      }
    }
    expect(m.room['balls']).toHaveLength(0);
    expect(last!.balls!.every(b => !b.burst)).toBe(true);
    expect(last!.balls![0].x).toBeCloseTo(-50 + GUN_RANGE, 0);
  });

  it('are PLASMA_MAX in flight at most: past it, the oldest bursts', () => {
    const m = match();
    m.put(m.cy, 0, -50, GUN);
    const many = Array.from({ length: PLASMA_MAX }, (_, k) =>
      Object.assign(launch(m.state(m.cy)), { id: k, x: k, z: 60 }),
    );
    m.room['balls'].push(...many);
    m.tap(m.cy);
    expect(m.room['balls']).toHaveLength(PLASMA_MAX + 1);
    expect(m.room['balls'].filter(b => b.burst).map(b => b.id)).toEqual([0]);
    m.even();
    const { balls } = m.snap(m.ann);
    expect(balls).toHaveLength(PLASMA_MAX + 1);
    expect(balls!.filter(b => b.burst).map(b => b.id)).toEqual([0]);
    expect(m.room['balls']).toHaveLength(PLASMA_MAX);
  });

  it('are dropped with the last player', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.tap(m.cy);
    for (const c of [m.ann, m.bob, m.cy, m.dee]) {
      m.room.disconnect(c);
    }
    m.room.tick();
    expect(m.room['balls']).toHaveLength(0);
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

describe('rail cells', () => {
  /** The arena with two rail cells, after its two health packs and two ammo packs. */
  const CELLED: WorldDef = {
    ...ARENA,
    cells: [
      [0, 1, -30],
      [10, 1, -30],
    ],
  };
  const bits = (m: ReturnType<typeof match>) => {
    m.ticks(SNAP_EVERY);
    return m.snap(m.ann).packs;
  };

  it('come after the ammo packs in the snapshot, and give RAIL_CELL of lightning up to RAIL_MAX', () => {
    const m = match({}, CELLED);
    expect(bits(m)).toBe(0b111111);
    m.put(m.cy, 0, -30, { rail: 10, railed: true });
    m.ticks(1);
    expect(m.state(m.cy).rail).toBe(10 + RAIL_CELL);
    expect(bits(m)).toBe(0b101111);
    m.put(m.cy, 10, -30, { rail: RAIL_MAX - 5 });
    m.ticks(1);
    expect(m.state(m.cy).rail).toBe(RAIL_MAX);
    expect(bits(m)).toBe(0b001111);
  });

  it('are not taken without the rail gun, nor with a full one, nor by a gun or a hurt player', () => {
    const m = match({}, CELLED);
    m.put(m.cy, 0, -30, { ammo: 5, hp: 2 });
    m.put(m.dee, 10, -30, { rail: RAIL_MAX });
    m.ticks(SNAP_EVERY * 2);
    expect([m.state(m.cy).ammo, m.state(m.cy).hp, m.state(m.dee).rail]).toEqual([5, 2, RAIL_MAX]);
    expect(bits(m)).toBe(0b111111);
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
    // On the rack, FIRE tapped for 100 steps: 13 shots, no refill.
    m.taps(m.cy, 100);
    expect([m.state(m.cy).shots, m.state(m.cy).ammo]).toEqual([13, AMMO_MAX - 13]);
    m.ticks(SNAP_EVERY);
    expect(m.snap(m.ann).players.find(p => p.id === 2)).toMatchObject({
      rack: true,
      ammo: AMMO_MAX - 13,
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
    m.taps(m.cy, GUN_COOLDOWN * 4);
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

const SWORD = { blade: true, ammo: -1 };

/**
 * The player holds FIRE with `keys` up to the strike tick of the cut those keys give, and the room
 * has resolved it when this returns. The history the host rewinds to is written at snapshot ticks,
 * so two ticks first let it see the puts of the test.
 */
const swing = (m: ReturnType<typeof match>, c: Peer, keys = 0, look: Look = {}) => {
  m.ticks(SNAP_EVERY);
  m.hold(c, CUTS[cutOf(keys)].strike + 1, FIRE | keys, look);
};

describe('a saber lock', () => {
  const WEST = Math.PI / 2;
  /**
   * Cy (red, at 0 facing east) and Bob (blue, 2 m east facing west) both thrust on the same ticks,
   * to the strike: the blades lock. Returns the match.
   */
  const lock = () => {
    const m = match();
    m.put(m.cy, 0, 0, SWORD);
    m.put(m.bob, 2, 0, { ...SWORD, yaw: WEST });
    m.ticks(SNAP_EVERY);
    for (let k = 0; k <= CUTS[CUT.THRUST].strike; k++) {
      m.send(m.cy, FIRE | FORWARD);
      m.send(m.bob, FIRE | FORWARD, { yaw: WEST });
      m.ticks(1);
    }
    return m;
  };
  /** n steps of each, Cy's keys and Bob's. */
  const both = (
    m: ReturnType<typeof match>,
    n: number,
    cy: (k: number) => number,
    bob: (k: number) => number,
  ) => {
    for (let k = 0; k < n; k++) {
      m.send(m.cy, cy(k));
      m.send(m.bob, bob(k), { yaw: WEST });
      m.ticks(1);
    }
  };

  it('locks the blades when two foes face to face strike at the same time: no cut lands', () => {
    const m = lock();
    for (const [c, foe] of [
      [m.cy, 1],
      [m.bob, 2],
    ] as const) {
      expect(m.state(c)).toMatchObject({ foe, hp: HP_MAX, swing: 0, wield: true });
      expect(m.state(c).lock).toBeGreaterThan(LOCK_TICKS - 5);
    }
    expect([m.state(m.cy).hits, m.state(m.bob).hits]).toEqual([0, 0]);
    // It is in the snapshot.
    m.ticks(SNAP_EVERY);
    expect(m.snap(m.ann).players.find(p => p.id === 2)).toMatchObject({ foe: 1 });
  });

  it('holds both where they stand: the keys do not move them', () => {
    const m = lock();
    const [x, z] = [m.state(m.cy).x, m.state(m.cy).z];
    both(
      m,
      20,
      () => FORWARD | SPRINT,
      () => FORWARD,
    );
    expect([m.state(m.cy).x, m.state(m.cy).z]).toEqual([x, z]);
  });

  it('is won by the faster clicker: LOCK_WIN presses ahead, and the other takes LOCK_HP and the shock', () => {
    const m = lock();
    // Cy taps every other step, Bob every fourth: Cy pulls ahead.
    let k = 0;
    for (; k < 200 && m.state(m.cy).lock; k++) {
      both(
        m,
        1,
        () => (k % 2 ? 0 : FIRE),
        () => (k % 4 ? 0 : FIRE),
      );
    }
    expect(m.state(m.cy)).toMatchObject({ lock: 0, hp: HP_MAX });
    expect(m.state(m.bob)).toMatchObject({ lock: 0, hp: HP_MAX - LOCK_HP, zap: true });
    expect(m.state(m.bob).stun).toBeGreaterThan(0);
    // Thrown back along Cy's look, east.
    expect(m.state(m.bob).vx).toBeGreaterThan(0);
    expect(m.state(m.cy).hits).toBe(1);
    // Some 2 x LOCK_WIN steps for Cy to lead by LOCK_WIN, the two clicking at 2 to 1.
    expect(k).toBeLessThan(4 * LOCK_WIN + 4);
  });

  it('counts a press, not a held button: holding FIRE wins nothing', () => {
    const m = lock();
    for (let k = 0; k < 60 && m.state(m.cy).lock; k++) {
      both(
        m,
        1,
        () => FIRE,
        () => (k % 2 ? 0 : FIRE),
      );
    }
    expect(m.state(m.bob).lock).toBe(0);
    expect([m.state(m.cy).hp, m.state(m.bob).hp]).toEqual([HP_MAX - LOCK_HP, HP_MAX]);
  });

  it('lets one step out with a side or back key held LOCK_BREAK steps: both free, no harm', () => {
    for (const key of [LEFT, RIGHT, BACK]) {
      const m = lock();
      both(
        m,
        LOCK_BREAK - 1,
        () => key,
        () => 0,
      );
      expect(m.state(m.cy).lock).toBeGreaterThan(0);
      both(
        m,
        1,
        () => key,
        () => 0,
      );
      expect([m.state(m.cy).lock, m.state(m.bob).lock]).toEqual([0, 0]);
      expect([m.state(m.cy).hp, m.state(m.bob).hp]).toEqual([HP_MAX, HP_MAX]);
      expect([m.state(m.cy).stun, m.state(m.bob).stun]).toEqual([0, 0]);
      // And he walks away.
      both(
        m,
        20,
        () => key,
        () => 0,
      );
      expect(Math.hypot(m.state(m.cy).x, m.state(m.cy).z)).toBeGreaterThan(0.5);
    }
  });

  it('parts them after LOCK_TICKS without a winner, each stumbling back from the other', () => {
    const m = lock();
    both(
      m,
      LOCK_TICKS,
      () => 0,
      () => 0,
    );
    expect([m.state(m.cy).lock, m.state(m.bob).lock]).toEqual([0, 0]);
    expect([m.state(m.cy).hp, m.state(m.bob).hp]).toEqual([HP_MAX, HP_MAX]);
    expect(m.state(m.cy).vx).toBeLessThan(0);
    expect(m.state(m.bob).vx).toBeGreaterThan(0);
  });

  it('does not lock a cut on a foe who is not cutting, nor on one who is not facing him', () => {
    const m = match();
    m.put(m.cy, 0, 0, SWORD);
    m.put(m.bob, 2, 0, { ...SWORD, yaw: WEST });
    swing(m, m.cy, FORWARD);
    expect([m.state(m.cy).lock ?? 0, m.state(m.bob).hp]).toEqual([0, HP_MAX - CUTS[CUT.THRUST].hp]);
    // Bob cuts at the same time but faces away.
    const n = match();
    n.put(n.cy, 0, 0, SWORD);
    n.put(n.bob, 2, 0, { ...SWORD, yaw: EAST });
    n.ticks(SNAP_EVERY);
    for (let k = 0; k <= CUTS[CUT.THRUST].strike; k++) {
      n.send(n.cy, FIRE | FORWARD);
      n.send(n.bob, FIRE | FORWARD);
      n.ticks(1);
    }
    expect(n.state(n.cy).lock ?? 0).toBe(0);
    expect(n.state(n.bob).hp).toBe(HP_MAX - CUTS[CUT.THRUST].hp);
  });

  it('ends when the other goes down or leaves', () => {
    const m = lock();
    m.room.disconnect(m.bob);
    both(
      m,
      1,
      () => 0,
      () => 0,
    );
    expect(m.state(m.cy).lock).toBe(0);
  });
});

describe('a cut', () => {
  it('thrusts into the enemy in front: he loses 2 hp, the cutter counts one hit and no shot', () => {
    const m = match();
    m.put(m.cy, 0, 0, SWORD);
    m.put(m.bob, 2);
    swing(m, m.cy, FORWARD);
    expect(m.state(m.bob).hp).toBe(HP_MAX - CUTS[CUT.THRUST].hp);
    expect(m.state(m.bob).down).toBe(0);
    expect([m.state(m.cy).hits, m.state(m.cy).shots, m.state(m.cy).ammo]).toEqual([1, 0, -1]);
    // Nobody else paid for it.
    expect([m.state(m.ann).hp, m.state(m.dee).hp, m.state(m.cy).hp]).toEqual([
      HP_MAX,
      HP_MAX,
      HP_MAX,
    ]);
    // The snapshot shows the hit, the swing under way and the shock.
    m.ticks(SNAP_EVERY);
    const players = m.snap(m.ann).players;
    expect(players.find(p => p.id === 2)).toMatchObject({
      hits: 1,
      blade: true,
      wield: true,
      cut: CUT.THRUST,
      swing: CUTS[CUT.THRUST].ticks - CUTS[CUT.THRUST].strike,
    });
    expect(players.find(p => p.id === 1)).toMatchObject({
      hp: HP_MAX - 2,
      zap: true,
      stun: SHOCK_TICKS,
      by: 2,
    });
  });

  it('slashes for 3 hp, and cuts across for 2', () => {
    for (const [keys, hp] of [
      [0, CUTS[CUT.SLASH].hp],
      [LEFT, CUTS[CUT.LEFT].hp],
      [RIGHT, CUTS[CUT.RIGHT].hp],
    ]) {
      const m = match();
      m.put(m.cy, 0, 0, SWORD);
      m.put(m.bob, 1.5);
      swing(m, m.cy, keys);
      expect(m.state(m.bob).hp, `keys ${keys}`).toBe(HP_MAX - hp);
      expect(m.state(m.cy).hits, `keys ${keys}`).toBe(1);
    }
    expect([CUTS[CUT.SLASH].hp, CUTS[CUT.LEFT].hp]).toEqual([3, 2]);
  });

  it('does nothing before the strike tick, and strikes exactly once per swing', () => {
    const m = match();
    m.put(m.cy, 0, 0, SWORD);
    m.put(m.bob, 2);
    m.ticks(SNAP_EVERY);
    const { strike, ticks } = CUTS[CUT.THRUST];
    m.hold(m.cy, strike, FIRE | FORWARD);
    expect([m.state(m.bob).hp, m.state(m.cy).hits]).toEqual([HP_MAX, 0]);
    expect(m.state(m.cy).swing).toBe(ticks - strike + 1);
    m.hold(m.cy, 1, FIRE | FORWARD);
    expect([m.state(m.bob).hp, m.state(m.cy).hits]).toEqual([HP_MAX - 2, 1]);
    // The rest of the swing hits nothing more, he is only out of reach by then or not: one strike.
    m.put(m.bob, 4);
    m.hold(m.cy, ticks - strike, 0);
    expect([m.state(m.bob).hp, m.state(m.cy).hits, m.state(m.cy).swing]).toEqual([HP_MAX, 1, 0]);
  });

  it('hits nobody out of reach, off the line, behind, or a teammate: a swing, no hit', () => {
    const m = match();
    m.put(m.cy, 0, 0, SWORD);
    // Out of reach once FORWARD has carried Cy 0.8 m on to the strike.
    m.put(m.bob, 4);
    m.put(m.dee, 1.5, 3);
    m.put(m.ann, 1.5);
    swing(m, m.cy, FORWARD);
    expect([m.state(m.bob).hp, m.state(m.dee).hp, m.state(m.ann).hp]).toEqual([
      HP_MAX,
      HP_MAX,
      HP_MAX,
    ]);
    expect([m.state(m.cy).hits, m.state(m.cy).swing]).toEqual([
      0,
      CUTS[CUT.THRUST].ticks - CUTS[CUT.THRUST].strike,
    ]);
    expect(m.state(m.bob).stun).toBe(0);
    // Behind him.
    const n = match();
    n.put(n.cy, 0, 0, SWORD);
    n.put(n.bob, -1.5);
    swing(n, n.cy, 0);
    expect(n.state(n.bob).hp).toBe(HP_MAX);
  });

  it('hits every enemy in the arc at once, and counts a single hit', () => {
    const m = match();
    m.put(m.cy, 0, 0, SWORD);
    m.put(m.bob, 1.5, 0.6);
    m.put(m.dee, 1.5, -0.6);
    m.put(m.ann, 1.5);
    swing(m, m.cy, LEFT);
    expect([m.state(m.bob).hp, m.state(m.dee).hp]).toEqual([HP_MAX - 2, HP_MAX - 2]);
    expect(m.state(m.ann).hp).toBe(HP_MAX);
    expect(m.state(m.cy).hits).toBe(1);
    expect([m.state(m.bob).zap, m.state(m.dee).zap]).toEqual([true, true]);
    // Both are shocked by the cutter.
    expect([m.room['peers'].get(m.bob)!.by, m.room['peers'].get(m.dee)!.by]).toEqual([2, 2]);
  });

  it('does not cut through a wall', () => {
    const m = match();
    // The wall of the arena, x 30 to 30.5, 6 m high.
    m.put(m.cy, 28.2, 0, SWORD);
    m.put(m.bob, 31.2);
    swing(m, m.cy, FORWARD);
    expect([m.state(m.bob).hp, m.state(m.cy).hits]).toEqual([HP_MAX, 0]);
    // The same two without the wall between them.
    const n = match();
    n.put(n.cy, 22, 0, SWORD);
    n.put(n.bob, 24.8);
    swing(n, n.cy, FORWARD);
    expect(n.state(n.bob).hp).toBe(HP_MAX - 2);
  });

  it('counts the hits modulo 256, and the same counter as the laser', () => {
    const m = match();
    m.put(m.cy, 0, 0, { ...SWORD, hits: 255 });
    m.put(m.bob, 2);
    swing(m, m.cy, FORWARD);
    expect(m.state(m.cy).hits).toBe(0);
  });

  it('is not made by a player whose hands are busy, who is down, or while the match is over', () => {
    const m = match();
    m.put(m.cy, 0, 0, { ...SWORD, hp: 0, down: 50 });
    m.put(m.bob, 2);
    m.hold(m.cy, 40, FIRE | FORWARD);
    expect([m.state(m.bob).hp, m.state(m.cy).hits, m.state(m.cy).swing]).toEqual([HP_MAX, 0, 0]);
    const n = match({ timeLimit: 1 });
    n.put(n.cy, 0, 0, SWORD);
    n.put(n.bob, 2);
    n.ticks(TICK_HZ + 1);
    expect(n.snap(n.ann).over).toBe(true);
    n.hold(n.cy, 40, FIRE | FORWARD);
    expect([n.state(n.bob).hp, n.state(n.cy).swing]).toEqual([HP_MAX, 0]);
  });
});

describe('the shock', () => {
  it('stumbles him for SHOCK_TICKS, thrown SHOCK_KNOCK m/s along the look for a thrust and a slash', () => {
    // A slash with no key held: the cutter stands where he is.
    for (const keys of [FORWARD, 0]) {
      const m = match();
      m.put(m.cy, 0, 0, SWORD);
      m.put(m.bob, 1.8);
      swing(m, m.cy, keys);
      const bob = m.state(m.bob);
      expect([bob.stun, bob.zap, bob.vx], `keys ${keys}`).toEqual([
        SHOCK_TICKS,
        true,
        Math.fround(SHOCK_KNOCK),
      ]);
      expect(bob.vz).toBeCloseTo(0, 5);
    }
    expect(SHOCK_TICKS).toBe(24);
    expect(SHOCK_KNOCK).toBe(4);
  });

  it('throws a cut from the left to the cutter’s right and one from the right to his left', () => {
    // Looking east, his right is +z.
    for (const [keys, way] of [
      [LEFT, 1],
      [RIGHT, -1],
    ]) {
      const m = match();
      m.put(m.cy, 0, 0, SWORD);
      m.put(m.bob, 1.5);
      swing(m, m.cy, keys);
      const bob = m.state(m.bob);
      expect(bob.vz, `keys ${keys}`).toBeCloseTo(way * SHOCK_KNOCK, 4);
      expect(bob.vx, `keys ${keys}`).toBeCloseTo(0, 4);
      expect([bob.stun, bob.zap]).toEqual([SHOCK_TICKS, true]);
    }
    // And along a look to the north: a thrust goes north.
    const n = match();
    n.put(n.cy, 0, 0, SWORD);
    n.put(n.bob, 0, -1.8);
    swing(n, n.cy, FORWARD, { yaw: 0 });
    expect(n.state(n.bob).vz).toBeCloseTo(-SHOCK_KNOCK, 4);
    expect(n.state(n.bob).vx).toBeCloseTo(0, 4);
  });

  it('runs out: the stumble counts down on his own steps, and zap goes with it', () => {
    const m = match();
    m.put(m.cy, 0, 0, SWORD);
    m.put(m.bob, 2);
    swing(m, m.cy, FORWARD);
    for (let k = 1; k < SHOCK_TICKS; k++) {
      m.hold(m.bob, 1, 0);
      expect([m.state(m.bob).stun, m.state(m.bob).zap], `step ${k}`).toEqual([
        SHOCK_TICKS - k,
        true,
      ]);
    }
    m.hold(m.bob, 1, 0);
    expect([m.state(m.bob).stun, m.state(m.bob).zap]).toEqual([0, false]);
    m.ticks(SNAP_EVERY);
    expect(m.snap(m.ann).players.find(p => p.id === 1)).toMatchObject({
      stun: 0,
      zap: false,
      by: 0,
    });
  });

  it('keeps a carried flag: only going down drops it', () => {
    const m = match();
    m.put(m.cy, 0, 0, SWORD);
    m.put(m.bob, 1.8);
    m.carry(m.bob);
    swing(m, m.cy, FORWARD);
    expect(m.state(m.bob).hp).toBe(HP_MAX - 2);
    expect(m.flag(TEAM.RED)).toMatchObject({ state: FLAG.CARRIED, by: 1 });
    // The next cut, 3 hp: he is down, and the flag lies where he fell.
    m.put(m.cy, 0, 0, SWORD);
    m.put(m.bob, 1.8, 0, { hp: 3 });
    m.carry(m.bob);
    swing(m, m.cy, 0);
    expect(m.state(m.bob).down).toBe(DOWN_TICKS);
    expect(m.flag(TEAM.RED).state).toBe(FLAG.DROPPED);
  });

  it('is not a tackle: a tackle’s stumble is not a zap, and a shock after a tackle is one', () => {
    const m = match();
    m.put(m.cy, 0);
    m.put(m.bob, 2, 0, { zap: true, stun: 10 });
    m.carry(m.bob);
    m.ticks(SNAP_EVERY);
    for (let k = 0; k < 20 && m.flag(TEAM.RED).state !== FLAG.DROPPED; k++) {
      m.send(m.cy, FORWARD | DASH);
    }
    expect(m.flag(TEAM.RED).state).toBe(FLAG.DROPPED);
    expect(m.state(m.bob)).toMatchObject({ stun: 48, zap: false });
    // A cut on a stumbling player shocks him: the stumble becomes a zap of SHOCK_TICKS.
    const n = match();
    n.put(n.cy, 0, 0, SWORD);
    n.put(n.bob, 1.8, 0, { stun: 40, zap: false });
    swing(n, n.cy, FORWARD);
    expect(n.state(n.bob)).toMatchObject({ stun: SHOCK_TICKS, zap: true });
  });
});

describe('a cut, down', () => {
  it('goes down on the cut that takes the last hp: 2 from 2, 3 from 3, and not 2 from 3', () => {
    for (const [keys, hp, down] of [
      [FORWARD, 2, true],
      [FORWARD, 3, false],
      [0, 3, true],
      [0, 4, false],
      [LEFT, 1, true],
    ] as const) {
      const m = match();
      m.put(m.cy, 0, 0, SWORD);
      m.put(m.bob, 1.5, 0, { hp });
      swing(m, m.cy, keys);
      expect(m.state(m.bob).down > 0, `keys ${keys} hp ${hp}`).toBe(down);
      expect(m.state(m.bob).hp, `keys ${keys} hp ${hp}`).toBe(down ? 0 : hp - CUTS[cutOf(keys)].hp);
    }
  });

  it('lies down like after a laser: DOWN_TICKS, health 0, and the gun, the katana and the swing gone', () => {
    const m = match();
    m.put(m.cy, 0, 0, SWORD);
    m.put(m.bob, 1.8, 0, {
      hp: 2,
      ammo: 20,
      cool: 3,
      blade: true,
      wield: true,
      swing: 9,
      cut: CUT.LEFT,
    });
    swing(m, m.cy, FORWARD);
    expect(m.state(m.bob)).toMatchObject({
      hp: 0,
      down: DOWN_TICKS,
      ammo: -1,
      cool: 0,
      blade: false,
      wield: false,
      swing: 0,
    });
    expect(m.state(m.cy).hits).toBe(1);
    // A body that is down takes no shock, and no more cuts.
    expect(m.state(m.bob).zap).toBe(false);
    m.hold(m.cy, CUTS[CUT.THRUST].ticks, FIRE | FORWARD);
    expect(m.state(m.cy).hits).toBe(1);
    // He is back at a spawn with neither weapon.
    m.hold(m.bob, DOWN_TICKS, 0);
    expect(m.state(m.bob)).toMatchObject({ down: 0, hp: HP_MAX, ammo: -1, blade: false, swing: 0 });
  });

  it('loses the katana to a laser too', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.put(m.bob, 10, 0, { hp: 1, blade: true, wield: true, swing: 5 });
    m.fire(m.cy);
    expect(m.state(m.bob)).toMatchObject({ hp: 0, blade: false, wield: false, swing: 0 });
  });

  it('is not made by a cutter who went down in mid swing: the swing went with him', () => {
    const m = match();
    m.put(m.cy, 0, 0, SWORD);
    m.put(m.bob, 2);
    m.ticks(SNAP_EVERY);
    m.hold(m.cy, 4, FIRE | FORWARD);
    expect(m.state(m.cy).swing).toBeGreaterThan(0);
    // A laser from Dee takes the last hp.
    m.put(m.dee, 10, 0, GUN);
    Object.assign(m.state(m.cy), { hp: 1, x: 0, z: 0 });
    m.state(m.dee).yaw = (Math.PI * 1) / 2;
    m.fire(m.dee, 1, { yaw: Math.PI / 2 });
    expect(m.state(m.cy).down).toBeGreaterThan(0);
    expect(m.state(m.cy).swing).toBe(0);
    m.hold(m.cy, 12, FIRE | FORWARD);
    expect([m.state(m.bob).hp, m.state(m.cy).hits]).toEqual([HP_MAX, 0]);
  });
});

describe('a cut, the limb', () => {
  /** The pitch that puts the blade's line, from the chest, at a share of a standing foe's height, 1.5 m ahead. */
  const aim = (share: number) => Math.atan(((share - 0.7) * PLAYER_H) / 1.5);

  it('takes off the limb the blade crosses when the cut puts him down, and shows it in the snapshot', () => {
    // Bob has his back to Cy (both face east), 1.5 m ahead.
    for (const [keys, pitch, z, hp, lost] of [
      [LEFT, aim(0.6), 0, 2, LIMB.ARM_L],
      [RIGHT, aim(0.6), 0, 2, LIMB.ARM_R],
      [RIGHT, aim(0.25), 0, 2, LIMB.LEG_R],
      // The thrust carries Cy about 0.8 m closer: a steep look up.
      [FORWARD, 0.8, 0, 2, LIMB.HEAD],
      [FORWARD, aim(0.6), 0, 2, LIMB.NONE],
      [FORWARD, aim(0.6), 0.3, 2, LIMB.ARM_L],
      [0, aim(0.25), 0, 3, LIMB.HEAD],
      [0, 0, -0.3, 3, LIMB.ARM_R],
    ] as const) {
      const label = `keys ${keys} pitch ${pitch} z ${z}`;
      const m = match();
      m.put(m.cy, 0, 0, SWORD);
      m.put(m.bob, 1.5, z, { hp });
      swing(m, m.cy, keys, { pitch });
      expect(m.state(m.bob).down, label).toBe(DOWN_TICKS);
      expect(m.state(m.bob).lost, label).toBe(lost);
      m.ticks(SNAP_EVERY);
      expect(m.snap(m.ann).players.find(p => p.id === 1)?.lost, label).toBe(lost);
    }
  });

  it('takes none on a cut that does not put him down: a shock', () => {
    const m = match();
    m.put(m.cy, 0, 0, SWORD);
    m.put(m.bob, 1.5, 0, { hp: 3 });
    swing(m, m.cy, LEFT, { pitch: aim(0.6) });
    expect(m.state(m.bob)).toMatchObject({ hp: 1, down: 0, zap: true, lost: LIMB.NONE });
  });

  it('is back on when he is back up', () => {
    const m = match();
    m.put(m.cy, 0, 0, SWORD);
    m.put(m.bob, 1.5, 0, { hp: 2 });
    swing(m, m.cy, LEFT, { pitch: aim(0.6) });
    expect(m.state(m.bob).lost).toBe(LIMB.ARM_L);
    m.hold(m.bob, DOWN_TICKS - 1, 0);
    expect(m.state(m.bob)).toMatchObject({ down: 1, lost: LIMB.ARM_L });
    m.hold(m.bob, 1, 0);
    expect(m.state(m.bob)).toMatchObject({ down: 0, hp: HP_MAX, lost: LIMB.NONE });
    m.ticks(SNAP_EVERY);
    expect(m.snap(m.ann).players.find(p => p.id === 1)?.lost).toBe(LIMB.NONE);
  });

  it('is never taken by a shot, whatever was left on the state', () => {
    const m = match();
    m.put(m.cy, 0, 0, GUN);
    m.put(m.bob, 10, 0, { hp: 1, lost: LIMB.HEAD });
    m.fire(m.cy);
    expect(m.state(m.bob)).toMatchObject({ hp: 0, down: DOWN_TICKS, lost: LIMB.NONE });
  });

  it('is taken from the foe as the cutter saw him', () => {
    const m = match();
    m.put(m.cy, 0, 0, SWORD);
    m.put(m.bob, 1.5, 0.3, { hp: 2 });
    const seen = m.even();
    // He has stepped to the other side of the line since: on the host, the line passes his left.
    m.put(m.bob, 1.5, -0.3, { hp: 2 });
    m.ticks(SNAP_EVERY * 2);
    m.hold(m.cy, CUTS[CUT.THRUST].strike + 1, FIRE | FORWARD, { view: seen, pitch: aim(0.6) });
    expect(m.state(m.bob)).toMatchObject({ down: DOWN_TICKS, lost: LIMB.ARM_L });
  });
});

describe('a cut as the cutter saw it', () => {
  it('hits where the target was on the cutter’s screen, though he has moved on', () => {
    const m = match();
    m.put(m.cy, 0, 0, SWORD);
    m.put(m.bob, 2);
    const seen = m.even();
    m.put(m.bob, 2, 8);
    m.ticks(SNAP_EVERY * 2);
    m.hold(m.cy, CUTS[CUT.THRUST].strike + 1, FIRE | FORWARD, { view: seen });
    expect(m.state(m.bob).hp).toBe(HP_MAX - 2);
    expect(m.state(m.bob).z).toBe(8);
  });

  it('misses one who was out of reach on the cutter’s screen, though he is in it now', () => {
    const m = match();
    m.put(m.cy, 0, 0, SWORD);
    m.put(m.bob, 2, 8);
    const seen = m.even();
    m.put(m.bob, 2);
    m.ticks(SNAP_EVERY * 2);
    m.hold(m.cy, CUTS[CUT.THRUST].strike + 1, FIRE | FORWARD, { view: seen });
    expect([m.state(m.bob).hp, m.state(m.cy).hits]).toEqual([HP_MAX, 0]);
  });

  it('cannot hit one who lies down now, nor one who was down then', () => {
    const m = match();
    m.put(m.cy, 0, 0, SWORD);
    m.put(m.bob, 2, 0, { hp: 0, down: 50 });
    swing(m, m.cy, FORWARD);
    expect([m.state(m.bob).hp, m.state(m.cy).hits]).toEqual([0, 0]);
    const n = match();
    n.put(n.cy, 0, 0, SWORD);
    n.put(n.bob, 2, 0, { hp: 0, down: 50 });
    const seen = n.even();
    n.ticks(SNAP_EVERY);
    n.put(n.bob, 2);
    n.ticks(SNAP_EVERY * 2);
    n.hold(n.cy, CUTS[CUT.THRUST].strike + 1, FIRE | FORWARD, { view: seen });
    expect([n.state(n.cy).hits, n.state(n.bob).hp]).toEqual([0, HP_MAX]);
  });
});

describe('the katana rack through the room', () => {
  it('gives the katana at the team’s rack, the other team’s rack nothing, and shows it in the snapshot', () => {
    const m = match();
    m.put(m.cy, -20, 43);
    m.put(m.bob, -20, 43);
    m.hold(m.cy, 1, 0);
    m.hold(m.bob, 1, 0);
    expect([m.state(m.cy).blade, m.state(m.bob).blade]).toEqual([true, false]);
    // No gun, so it is in hand.
    expect([m.state(m.cy).wield, m.state(m.bob).wield]).toEqual([true, false]);
    m.ticks(SNAP_EVERY);
    expect(m.snap(m.ann).players.find(p => p.id === 2)).toMatchObject({ blade: true, wield: true });
    // Down, he has none and takes none.
    m.put(m.ann, -20, 43, { hp: 0, down: 20 });
    m.hold(m.ann, 1, 0);
    expect(m.state(m.ann).blade).toBe(false);
  });

  it('is kept on the move, and a player with the gun swaps with BLADE', () => {
    const m = match();
    m.put(m.cy, -20, 43, GUN);
    m.hold(m.cy, 1, 0);
    expect([m.state(m.cy).blade, m.state(m.cy).wield]).toEqual([true, false]);
    m.hold(m.cy, 1, BLADE);
    expect(m.state(m.cy).wield).toBe(true);
    // Far from the rack, the gun is the one that fires with BLADE let go.
    m.state(m.cy).x = 0;
    m.state(m.cy).z = 0;
    m.taps(m.cy, 10, FORWARD);
    expect([m.state(m.cy).blade, m.state(m.cy).shots]).toEqual([true, 2]);
  });

  it('is not taken while the end screen shows, and a new match takes it with the rest', () => {
    const m = match({ timeLimit: 1 });
    m.put(m.cy, 0, 0, { ...SWORD, swing: 10, wield: true });
    m.put(m.ann, -20, 43);
    m.ticks(TICK_HZ + 1);
    m.hold(m.ann, 3, 0);
    expect(m.state(m.ann).blade).toBe(false);
    m.ticks(TICK_HZ + END_SCREEN * TICK_HZ + 2);
    expect(m.state(m.cy)).toMatchObject({ blade: false, wield: false, swing: 0 });
  });
});

describe('random cuts', () => {
  it('keeps the katana fields in range, and the snapshot equal to the state, whoever cuts whom', () => {
    const m = match();
    const all = [m.ann, m.bob, m.cy, m.dee];
    let s = 777;
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    all.forEach((c, k) => m.put(c, 4 + k * 2, 2 + k, { ...SWORD, ...(k % 2 ? GUN : {}) }));
    const keys = new Map(all.map(c => [c, 0]));
    let hits = 0;
    let went = 0;
    let zaps = 0;
    let limbs = 0;
    let prev = all.map(c => ({ ...m.state(c) }));
    for (let k = 0; k < 6000; k++) {
      all.forEach((c, n) => {
        if (k % 5 === 0) {
          keys.set(
            c,
            (rnd() < 0.7 ? FIRE : 0) |
              (rnd() < 0.5 ? BLADE : 0) |
              (rnd() < 0.3 ? FORWARD : 0) |
              (rnd() < 0.2 ? LEFT : 0) |
              (rnd() < 0.2 ? RIGHT : 0) |
              (rnd() < 0.1 ? BACK : 0),
          );
        }
        const foes = all.filter((_, j) => j % 2 !== n % 2);
        const f = m.state(foes[Math.floor(rnd() * foes.length)]);
        const me = m.state(c);
        const yaw =
          rnd() < 0.8 ? Math.atan2(-(f.x - me.x), -(f.z - me.z)) + (rnd() - 0.5) * 0.4 : rnd() * 6;
        m.send(c, keys.get(c)!, { yaw, pitch: (rnd() - 0.5) * 0.2 });
      });
      m.ticks(1);
      all.forEach((c, n) => {
        const p = m.state(c);
        const label = `tick ${k}, player ${p.id}`;
        expect(p.hp, label).toBeGreaterThanOrEqual(0);
        expect(p.hp, label).toBeLessThanOrEqual(HP_MAX);
        expect(p.swing, label).toBeGreaterThanOrEqual(0);
        expect(p.swing, label).toBeLessThanOrEqual(CUTS[p.cut ?? 0].ticks);
        expect(p.cut, label).toBeLessThan(4);
        expect(p.stun, label).toBeLessThanOrEqual(48);
        // A zap is a stumble; down is health 0 with nothing in hand.
        expect(!p.zap || p.stun > 0, label).toBe(true);
        expect(p.down > 0, label).toBe(p.hp === 0);
        if (p.down) {
          expect([p.blade, p.wield, p.swing], label).toEqual([false, false, 0]);
        }
        // A limb is lost only while down.
        expect(!p.lost || p.down > 0, label).toBe(true);
        limbs += +(!!p.lost && !prev[n].lost);
        // In hand only with the katana, and the swing runs only with the katana in hand.
        expect(!p.wield || p.blade, label).toBe(true);
        expect(!p.swing || p.wield, label).toBe(true);
        expect((p.hits - prev[n].hits) & 255, label).toBeLessThanOrEqual(1);
        hits += (p.hits - prev[n].hits) & 255;
        went += +(p.down > 0 && prev[n].down === 0);
        zaps += +(!!p.zap && !prev[n].zap);
        prev[n] = { ...p };
      });
      if (k % 50 === 0) {
        // Give the dead their katana back, and keep everyone near each other.
        all.forEach((c, n) => {
          const p = m.state(c);
          if (!p.down && !p.blade) {
            p.blade = true;
          }
          if (Math.hypot(p.x - 12, p.z - 8) > 10) {
            Object.assign(p, { x: 4 + n * 2, z: 2 + n });
          }
        });
        m.even();
        const back = new Map(m.snap(m.ann).players.map(p => [p.id, p]));
        for (const c of all) {
          const p = m.state(c);
          expect(back.get(p.id), `tick ${k}`).toMatchObject({
            hp: p.hp,
            blade: !!p.blade,
            wield: !!p.wield,
            swing: p.swing ?? 0,
            cut: p.cut ?? 0,
            zap: !!p.zap,
            stun: p.stun,
            hits: p.hits,
            lost: p.lost ?? 0,
          });
        }
        prev = all.map(c => ({ ...m.state(c) }));
      }
    }
    expect(hits).toBeGreaterThan(30);
    expect(went).toBeGreaterThan(2);
    expect(zaps).toBeGreaterThan(10);
    expect(limbs).toBeGreaterThan(0);
  }, 60_000);
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
        // Shots go up by one at most a tick (one every GUN_COOLDOWN inputs); hits by two, for two
        // balls in flight, a near one after a far one, can land on the same tick.
        expect((p.shots - prev[n].shots) & 255, label).toBeLessThanOrEqual(1);
        expect((p.hits - prev[n].hits) & 255, label).toBeLessThanOrEqual(2);
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
