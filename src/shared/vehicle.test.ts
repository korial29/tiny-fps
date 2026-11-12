// A vehicle's health through the room (the user, 2026-11-12): what each weapon takes from a hull,
// whose shots count, the hull and its crew apart, the explosion at 0, the wreck and the vehicle
// parked afresh.
import { describe, expect, it } from 'vitest';
import { loaded } from '../../test/loaded';
import { duo } from '../../test/teams';
import { swingOf } from './blade';
import {
  AMMO_MAX,
  CHARGE_MAX,
  CHARGE_TICKS,
  CUTS,
  END_SCREEN,
  HP_MAX,
  NADE_HP,
  NADE_MAX,
  RAIL_DRAIN,
  RAIL_MAX,
  RAIL_TICKS,
  RIFLE_COOL,
  RIFLE_MAX,
  SNAP_EVERY,
  TICK_HZ,
  VEHICLE,
} from './constants';
import { STILL } from './physics';
import { blast } from './plasma';
import { decodeSnapshot, encodeInput } from './protocol';
import { Room } from './room';
import { ROVER, homeOf, park, reach, solid, struck } from './rover';
import { PODS, SHIP, point } from './ship';
import { CUT, FLAG, KEY, MODE, NOBODY, TEX } from './types';
import type { Conn, PlayerState, Rover, Rules } from './types';
import { build } from './world';
import type { Spawn, WorldDef } from './world';

const { FORWARD, FIRE, RAIL, RIFLE, SPECIAL, USE } = KEY;
const EAST = (3 * Math.PI) / 2;
const SPAWNS: Spawn[] = [
  [-60, 1, -60, EAST],
  [-60, 1, -56, EAST],
];
/**
 * A flat slab at y = 1 with a wall across x = 30. Red's rover (vehicle 0) at (10, 0), blue's (1) at
 * (10, 20), both nose to the east; red's ship (2) at (-40, -30), blue's (3) at (-40, 30).
 */
const LOT: WorldDef = {
  brushes: [
    { min: [-100, -5, -100], max: [100, 1, 100], top: TEX.TILE, side: TEX.BRICK },
    { min: [30, 1, -10], max: [30.5, 7, 10], top: TEX.STEEL, side: TEX.STEEL },
  ],
  teams: [
    { ...duo(SPAWNS)[0], base: [-80, 1, -60] },
    { base: [80, 1, 60], spawns: SPAWNS.map(([x, y, z, yaw]): Spawn => [-x, y, -z, yaw]) },
  ],
  rovers: [
    [10, 1, 0, EAST],
    [10, 1, 20, EAST],
  ],
  ships: [
    [-40, 1, -30, EAST],
    [-40, 1, 30, EAST],
  ],
  floor: -20,
  sun: { dir: [0, 1, 0], color: [1, 1, 1] },
  sky: [
    [0, 0, 1],
    [1, 1, 1],
  ],
};
const W = build(LOT);
/** A look a little down: from a standing eye onto a rover's body, which is lower than it. */
const DOWN = { pitch: -0.1 };
/** The rear of a parked rover's body, on its axis. */
const REAR = 10 + ROVER.BODY[2] - ROVER.RB;

type Peer = Conn & { bins: ArrayBuffer[] };
interface Look {
  view?: number;
  yaw?: number;
  pitch?: number;
}

/** Ann (id 0) and Cy (2) are red, Bob (1) and Dee (3) blue: all at rest, unarmed, far from the vehicles. */
const match = (rules: Partial<Rules> = {}) => {
  const room = new Room(rules, LOT);
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
    cars: (): Rover[] => room['rovers'],
    /** Stands the player at (x, z) on the slab, at rest, facing east. */
    put: (c: Peer, x: number, z = 0, over: Partial<PlayerState> = {}) =>
      Object.assign(state(c), STILL, { x, y: 1, z, vy: 0, yaw: EAST, ground: true }, loaded(over)),
    ticks: (n: number) => {
      for (let k = 0; k < n; k++) {
        room.tick();
      }
    },
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
    /** A press of USE and its release. */
    use: (c: Peer) => {
      api.hold(c, 1, USE);
      api.hold(c, 1, 0);
    },
    /** Ticks until no ball flies. */
    land: () => {
      for (let k = 0; k < 300 && room['balls'].length; k++) {
        room.tick();
      }
    },
    /** The player taps FIRE with the gun (a plain shot), `n` times, and the balls land. */
    shoot: (c: Peer, n = 1, look: Look = DOWN) => {
      api.ticks(SNAP_EVERY);
      const to = (state(c).shots + n) & 255;
      for (let k = 0; k < 600 && state(c).shots !== to; k++) {
        api.hold(c, 1, k % 2 ? 0 : FIRE, look);
      }
      api.land();
    },
    /** Seats the player at the wheel (or beside it) of vehicle `k`, put by its side first. */
    board: (c: Peer, k: number) => {
      const r = api.cars()[k];
      api.put(c, r.x, r.z + (r.ship ? 3 : 2));
      state(c).y = r.ship ? 1 : 1;
      api.use(c);
      expect(state(c).mode).toBe(MODE.RIDE);
    },
    carry: (c: Peer) => {
      const { id, team } = room['peers'].get(c)!.info;
      room['ctf'].flags[1 - team] = { state: FLAG.CARRIED, by: id, x: 0, y: 0, z: 0, left: 0 };
    },
    flag: (k: number) => room['ctf'].flags[k],
    snap: (c: Peer) => decodeSnapshot(c.bins.at(-1)!)!,
  };
  return api;
};
type Match = ReturnType<typeof match>;

/** Cy, 6 m west of the rear of blue's rover, with what `over` gives him. */
const gunner = (m: Match, over: Partial<PlayerState> = { ammo: AMMO_MAX }, x = REAR - 6, z = 20) =>
  m.put(m.cy, x, z, over);
const hp = (m: Match) => m.cars().map(r => r.hp);

describe('a vehicle parked afresh', () => {
  it('has VEHICLE.HP of health and is no wreck, a rover and a ship alike', () => {
    expect(VEHICLE).toMatchObject({ HP: 10, WRECK: 5 * TICK_HZ, FADE: TICK_HZ });
    expect(park(W).map(r => [r.hp, r.wreck, !!r.ship])).toEqual([
      [10, 0, false],
      [10, 0, false],
      [10, 0, true],
      [10, 0, true],
    ]);
    // The first half of the rovers, and of the ships, are red's.
    expect([0, 1, 2, 3].map(k => homeOf(W, k))).toEqual([0, 1, 0, 1]);
  });

  it('is hit on its body: a rover on its three circles up to BODY_H, and reach() is the gap to them', () => {
    const [r] = park(W);
    const y = r.y - ROVER.L0 - ROVER.WR;
    // From the west, along its axis, at mid height: the rear circle.
    expect(struck(r, [0, y + 0.7, 0], [1, 0, 0], 50)).toBeCloseTo(REAR, 4);
    // Over the body, short of it, beside it: nothing.
    expect(struck(r, [0, y + ROVER.BODY_H + 0.1, 0], [1, 0, 0], 50)).toBe(Infinity);
    expect(struck(r, [0, y + 0.7, 0], [1, 0, 0], REAR - 0.1)).toBe(Infinity);
    expect(struck(r, [0, y + 0.7, ROVER.RB + 0.1], [1, 0, 0], 50)).toBe(Infinity);
    expect(reach(r, [REAR - 2, y + 0.7, 0])).toBeCloseTo(2, 4);
    expect(reach(r, [10, y + ROVER.BODY_H + 1, 0])).toBeCloseTo(1, 4);
    expect(reach(r, [10, y + 0.5, 0])).toBe(0);
  });
});

describe('what each weapon takes from an enemy vehicle', () => {
  it('a plasma ball takes its power: 1 a plain shot, CHARGE_MAX a full charge', () => {
    const m = match();
    gunner(m);
    m.shoot(m.cy);
    expect(hp(m)).toEqual([10, 9, 10, 10]);
    expect(m.state(m.cy).hits).toBe(1);
    m.shoot(m.cy, 2);
    expect(hp(m)[1]).toBe(7);
    // Held a second, then let go: one ball worth CHARGE_MAX.
    m.hold(m.cy, CHARGE_TICKS + 20, FIRE, DOWN);
    m.hold(m.cy, 2, 0, DOWN);
    m.land();
    expect(hp(m)[1]).toBe(7 - CHARGE_MAX);
    // The snapshot carries it.
    m.ticks(SNAP_EVERY);
    expect(m.snap(m.ann).rovers!.map(r => [r.hp, r.wreck])).toEqual([
      [10, 0],
      [7 - CHARGE_MAX, 0],
      [10, 0],
      [10, 0],
    ]);
  });

  it('the laser rifle’s rounds graze it: every VEHICLE.GRAZE on the hull take 1', () => {
    const m = match();
    gunner(m, { rifle: RIFLE_MAX });
    m.hold(m.cy, 1, RIFLE);
    m.ticks(SNAP_EVERY);
    const rounds = (n: number) => {
      m.hold(m.cy, RIFLE_COOL * n, RIFLE | FIRE, DOWN);
      m.hold(m.cy, 1, RIFLE, DOWN);
      m.land();
    };
    rounds(VEHICLE.GRAZE - 1);
    expect(m.state(m.cy).shots).toBe(VEHICLE.GRAZE - 1);
    expect(hp(m)[1]).toBe(10);
    rounds(1);
    expect(hp(m)[1]).toBe(9);
    rounds(2 * VEHICLE.GRAZE);
    expect(m.state(m.cy).shots).toBe(3 * VEHICLE.GRAZE);
    expect(hp(m)[1]).toBe(7);
    // Every round on the hull shows as a hit to the shooter.
    expect(m.state(m.cy).hits).toBe(3 * VEHICLE.GRAZE);
  });

  it('a rover’s lasers graze it the same: two bolts a salvo, 1 hp every two salvos', () => {
    const m = match();
    m.board(m.ann, 0);
    // Blue's rover is 20 m south of red's: Ann looks south at it.
    m.ticks(SNAP_EVERY);
    const south = { yaw: Math.PI, pitch: 0 };
    m.hold(m.ann, ROVER.GUN_COOL * 4, FIRE, south);
    m.hold(m.ann, 1, 0, south);
    m.land();
    expect(hp(m)).toEqual([10, 8, 10, 10]);
  });

  it('the rail gun’s bolt sears it: 1 at the first touch, 1 more each RAIL_DRAIN ticks, RAIL_TICKS after it lets go', () => {
    const m = match();
    gunner(m, { rail: RAIL_MAX });
    m.ticks(SNAP_EVERY);
    m.hold(m.cy, 1, RAIL | FIRE, DOWN);
    expect(hp(m)[1]).toBe(9);
    expect(m.state(m.cy).hits).toBe(1);
    // Held on: no second first touch.
    m.hold(m.cy, RAIL_DRAIN - 2, RAIL | FIRE, DOWN);
    expect(hp(m)[1]).toBe(9);
    m.hold(m.cy, 2, RAIL | FIRE, DOWN);
    expect(hp(m)[1]).toBe(8);
    expect(m.state(m.cy).hits).toBe(1);
    // Let go: it burns RAIL_TICKS more, then no further.
    m.hold(m.cy, RAIL_TICKS + RAIL_DRAIN, 0);
    expect(hp(m)[1]).toBe(8 - RAIL_TICKS / RAIL_DRAIN);
    m.ticks(4 * RAIL_DRAIN);
    expect(hp(m)[1]).toBe(8 - RAIL_TICKS / RAIL_DRAIN);
  });

  it('a grenade takes NADE_HP on the hull, less beside it, nothing behind a wall', () => {
    const LOADED = { rifle: RIFLE_MAX, nades: NADE_MAX };
    const lob = (m: Match, look: Look) => {
      m.hold(m.cy, 1, RIFLE);
      m.ticks(SNAP_EVERY);
      m.hold(m.cy, 1, RIFLE | SPECIAL, look);
      m.land();
    };
    const m = match();
    gunner(m, LOADED);
    lob(m, { pitch: -0.08 });
    expect(hp(m)).toEqual([10, 10 - NADE_HP, 10, 10]);
    expect(m.state(m.cy).hits).toBe(1);

    // At his own feet, 2.5 m from the hull: the blast's fall-off, as on a body.
    const n = match();
    gunner(n, LOADED, REAR - 2.5);
    lob(n, { pitch: -1.5 });
    expect(hp(n)[1]).toBe(10 - Math.ceil(NADE_HP * (1 - 2.4 / 5)));
    expect(n.state(n.cy).hp).toBeLessThan(HP_MAX);

    // Blue's rover behind the wall, the grenade on the wall's near face.
    const o = match();
    Object.assign(o.cars()[1], { x: 32.5, z: 0 });
    gunner(o, LOADED, 24, 0);
    lob(o, { pitch: 0 });
    expect(reach(o.cars()[1], [30, 2.5, 0])).toBeLessThan(2);
    expect(hp(o)[1]).toBe(10);
  });

  it('a cut of the katana takes the cut’s hp, where the cutter saw the hull', () => {
    const m = match();
    gunner(m, { blade: true, ammo: -1 }, REAR - 1);
    m.ticks(SNAP_EVERY);
    const strike = CUTS[CUT.THRUST].strike;
    for (let k = 0; k <= strike; k++) {
      m.hold(m.cy, 1, FORWARD | (k ? 0 : FIRE));
      // He does not walk into it meanwhile.
      Object.assign(m.state(m.cy), { x: REAR - 1, vx: 0 });
    }
    expect(swingOf(m.state(m.cy)).hp).toBe(CUTS[CUT.THRUST].hp);
    expect(hp(m)[1]).toBe(10 - CUTS[CUT.THRUST].hp);
    expect(m.state(m.cy).hits).toBe(1);

    // Out of reach: nothing.
    const n = match();
    gunner(n, { blade: true, ammo: -1 }, REAR - 4);
    n.ticks(SNAP_EVERY);
    for (let k = 0; k <= strike; k++) {
      n.hold(n.cy, 1, k ? 0 : FIRE);
    }
    expect(hp(n)[1]).toBe(10);
    expect(n.state(n.cy).hits).toBe(0);
  });

  it('a ship’s missile bursts on a hull like a grenade', () => {
    const m = match();
    m.board(m.ann, 2);
    const ship = m.cars()[2];
    // Red's ship hangs west of blue's rover, its right pod (the first to fire) 10 m from the hull
    // and level with it, and fires east.
    const hang = () => {
      Object.assign(ship, { x: 0, y: 3, z: 0, vx: 0, vy: 0, vz: 0, yaw: EAST, pitch: 0, roll: 0 });
      const [px, py, pz] = point(ship, PODS[1][0], PODS[1][1], PODS[1][2]);
      Object.assign(ship, { x: REAR - 10 - px, y: 3 + 2.2 - py, z: 20 - pz });
    };
    hang();
    m.ticks(SNAP_EVERY);
    hang();
    m.hold(m.ann, 1, SPECIAL);
    for (let k = 0; k < 120 && m.room['balls'].length; k++) {
      hang();
      m.hold(m.ann, 1, 0);
    }
    expect(ship.nades).toBe(SHIP.MISSILES - 1);
    expect(hp(m)[1]).toBe(10 - NADE_HP);
  });

  it('strikes the katana and the rail gun where the shooter drew the hull, the balls where it is now', () => {
    const m = match();
    gunner(m, { rail: RAIL_MAX, ammo: AMMO_MAX });
    m.ticks(4 * SNAP_EVERY);
    const then = m.room['ticks'];
    // The rover is put 30 m further south: Cy still draws it where it was.
    m.cars()[1].z += 30;
    m.ticks(SNAP_EVERY);
    m.hold(m.cy, 1, RAIL | FIRE, { ...DOWN, view: then });
    expect(hp(m)[1]).toBe(9);
    // A ball flies through the place it has left.
    const n = match();
    gunner(n);
    n.ticks(4 * SNAP_EVERY);
    const before = n.room['ticks'];
    n.cars()[1].z += 30;
    n.ticks(SNAP_EVERY);
    n.hold(n.cy, 1, FIRE, { ...DOWN, view: before });
    n.hold(n.cy, 1, 0, { ...DOWN, view: before });
    n.land();
    expect(n.state(n.cy).shots).toBe(1);
    expect(hp(n)[1]).toBe(10);
  });
});

describe('whose shots a vehicle takes', () => {
  it('is spared by the team whose base it is parked at while it is empty', () => {
    const m = match();
    // Cy (red) at red's rover, Bob (blue) at blue's.
    gunner(m, { ammo: AMMO_MAX }, REAR - 6, 0);
    m.put(m.bob, REAR - 6, 20, { ammo: AMMO_MAX });
    m.shoot(m.cy, 2);
    m.shoot(m.bob, 2);
    expect(hp(m)).toEqual([10, 10, 10, 10]);
    expect([m.state(m.cy).hits, m.state(m.bob).hits]).toEqual([0, 0]);
    // The ball went through: it is no wall to its own side.
    expect(m.state(m.cy).shots).toBe(2);
  });

  it('is of its driver’s team once driven: his mates spare it, his enemies do not, whatever its base', () => {
    const m = match();
    // Ann (red) takes blue's rover.
    m.board(m.ann, 1);
    gunner(m);
    m.put(m.bob, REAR - 6, 21, { ammo: AMMO_MAX });
    m.shoot(m.cy, 2);
    expect(hp(m)[1]).toBe(10);
    m.shoot(m.bob, 2);
    expect(hp(m)[1]).toBe(8);
    expect(m.state(m.ann).hp).toBe(HP_MAX);
  });
});

describe('the hull and its crew', () => {
  it('takes the shot on the hull and spares the crew behind it; a shot over the hull takes the crew', () => {
    const m = match();
    m.board(m.bob, 1);
    m.board(m.dee, 1);
    expect(m.cars()[1]).toMatchObject({ driver: 1, rider: 3 });
    gunner(m);
    m.shoot(m.cy, 2);
    expect(hp(m)[1]).toBe(8);
    expect([m.state(m.bob).hp, m.state(m.dee).hp]).toEqual([HP_MAX, HP_MAX]);
    // From the south side, over the body, into the rider on that side.
    const car = m.cars()[1];
    gunner(m, { ammo: AMMO_MAX }, car.x + 0.1, car.z + 6);
    m.shoot(m.cy, 1, { yaw: 0, pitch: 0.09 });
    expect(hp(m)[1]).toBe(8);
    expect(m.state(m.bob).hp + m.state(m.dee).hp).toBe(2 * HP_MAX - 1);
  });

  it('shields its crew from the rail gun’s bolt and from a blast, and from a cut', () => {
    const m = match();
    m.board(m.bob, 1);
    gunner(m, { rail: RAIL_MAX, rifle: RIFLE_MAX, nades: NADE_MAX });
    m.ticks(SNAP_EVERY);
    m.hold(m.cy, 1, RAIL | FIRE, DOWN);
    expect(hp(m)[1]).toBe(9);
    expect(m.state(m.bob)).toMatchObject({ hp: HP_MAX, slow: 0 });
    m.hold(m.cy, 1, RIFLE);
    m.hold(m.cy, 1, RIFLE | SPECIAL, { pitch: -0.08 });
    m.land();
    expect(hp(m)[1]).toBeLessThanOrEqual(9 - NADE_HP);
    expect(m.state(m.bob).hp).toBe(HP_MAX);
  });
});

describe('a vehicle at 0 HP', () => {
  /** Bob drives blue's rover and Dee rides, the flag in her hands; its hull has 1 hp left; Cy has the gun on it. */
  const doomed = () => {
    const m = match();
    m.board(m.bob, 1);
    m.board(m.dee, 1);
    m.carry(m.dee);
    m.cars()[1].hp = 1;
    gunner(m);
    return m;
  };

  it('blows up: its crew goes down on the spot, the shooter is credited, a carried flag drops', () => {
    const m = doomed();
    expect(m.flag(0).state).toBe(FLAG.CARRIED);
    const hits = m.state(m.cy).hits;
    m.shoot(m.cy);
    const car = m.cars()[1];
    expect(car).toMatchObject({ hp: 0, driver: NOBODY, rider: NOBODY });
    expect(car.wreck).toBeGreaterThan(VEHICLE.WRECK - 30);
    for (const c of [m.bob, m.dee]) {
      expect(m.state(c)).toMatchObject({ hp: 0 });
      expect(m.state(c).down).toBeGreaterThan(0);
      expect(m.state(c).mode).not.toBe(MODE.RIDE);
      // On the spot: by the wreck.
      expect(Math.hypot(m.state(c).x - car.x, m.state(c).z - car.z)).toBeLessThan(3);
    }
    // One hit for the shot on the hull, one for the kill.
    expect(m.state(m.cy).hits).toBe(hits + 2);
    expect(m.flag(0).state).toBe(FLAG.DROPPED);
    // The snapshot tells the wreck, its time in fours.
    m.ticks(SNAP_EVERY);
    const sent = m.snap(m.ann).rovers![1];
    expect(sent).toMatchObject({ hp: 0, driver: NOBODY, rider: NOBODY });
    expect(sent.wreck! % 4).toBe(0);
    expect(sent.wreck! - car.wreck!).toBeLessThan(4);
  });

  it('hurts the bodies near it with a grenade’s blast: enemies of the shooter, not his mates', () => {
    const m = match();
    const car = m.cars()[1];
    car.hp = 1;
    gunner(m);
    // Ann (red) and Bob (blue) each 2.5 m from its centre, on either side.
    m.put(m.ann, car.x, car.z - 2.5);
    m.put(m.bob, car.x, car.z + 2.5);
    const due = blast(W, [car.x, car.y, car.z], m.state(m.bob));
    expect(due).toBeGreaterThan(0);
    m.shoot(m.cy);
    expect(car.wreck).toBeGreaterThan(0);
    expect(m.state(m.bob).hp).toBe(HP_MAX - due);
    expect(m.state(m.ann).hp).toBe(HP_MAX);
    // And an enemy vehicle beside it; one of the shooter's side is spared.
    const n = match();
    n.cars()[1].hp = 1;
    Object.assign(n.cars()[3], { x: 10, z: 26 });
    Object.assign(n.cars()[0], { x: 10, z: 16.5 });
    gunner(n);
    n.shoot(n.cy);
    expect(n.cars()[1].wreck).toBeGreaterThan(0);
    expect(hp(n)[3]).toBeLessThan(10);
    expect(hp(n)[0]).toBe(10);
  });

  it('is a wreck nobody boards, drives or hurts, which stays where it is', () => {
    const m = doomed();
    m.shoot(m.cy);
    const car = m.cars()[1];
    const [x, z] = [car.x, car.z];
    // Ann (red) and, once up again or not, anyone: no seat.
    m.put(m.ann, car.x, car.z + 2);
    m.use(m.ann);
    expect(m.state(m.ann).mode).not.toBe(MODE.RIDE);
    expect(car).toMatchObject({ driver: NOBODY, rider: NOBODY });
    m.hold(m.ann, 30, FORWARD);
    expect(car.driver).toBe(NOBODY);
    // More shots do nothing to it.
    const left = car.wreck!;
    m.shoot(m.cy, 3);
    expect(car.hp).toBe(0);
    expect(car.wreck).toBeLessThan(left);
    expect(Math.hypot(car.x - x, car.z - z)).toBeLessThan(0.05);
  });

  it('skids to a stop within 5 m when it blows up at top speed, and is no obstacle to its dead crew', () => {
    const m = doomed();
    const car = m.cars()[1];
    m.hold(m.bob, 300, FORWARD);
    expect(car.vx).toBeGreaterThan(18);
    const x = car.x;
    m.room['hurt'](car, 1, 2, 0);
    expect(car.wreck).toBe(VEHICLE.WRECK);
    // Bob is down, thrown out at its speed: a wreck's body is no obstacle to him (it does not bend
    // his replay); a player who is up is kept out of it.
    m.hold(m.bob, 20, 0);
    const bob = m.state(m.bob);
    expect(bob.down).toBeGreaterThan(0);
    expect(solid(m.cars(), bob)).toHaveLength(3);
    expect(solid(m.cars(), m.state(m.cy))).toHaveLength(4);
    m.ticks(2 * TICK_HZ);
    expect(car.x - x).toBeGreaterThan(1);
    expect(car.x - x).toBeLessThan(5);
    expect(Math.abs(car.vx)).toBeLessThan(0.01);
  });

  it('is parked afresh on its spawn VEHICLE.WRECK ticks after the blast, whole, and can be boarded', () => {
    const m = doomed();
    // It was driven off its spawn first.
    Object.assign(m.cars()[1], { x: 14, z: 22 });
    gunner(m, { ammo: AMMO_MAX }, REAR - 2, 22);
    m.ticks(SNAP_EVERY);
    m.hold(m.cy, 1, FIRE, DOWN);
    m.hold(m.cy, 1, 0, DOWN);
    for (let k = 0; k < 20 && !m.cars()[1].wreck; k++) {
      m.ticks(1);
    }
    const car = m.cars()[1];
    expect(car.wreck).toBeGreaterThan(VEHICLE.WRECK - 3);
    m.ticks(car.wreck! - 1);
    expect(car).toMatchObject({ hp: 0, wreck: 1 });
    expect(car.x).toBeCloseTo(14, 1);
    m.ticks(1);
    // Back on its spawn, on its springs.
    expect(car).toMatchObject({ x: 10, z: 20, hp: VEHICLE.HP, wreck: 0, vx: 0, vz: 0 });
    expect(car.y).toBeCloseTo(park(W)[1].y, 1);
    m.board(m.ann, 1);
    expect(car.driver).toBe(0);
  });

  it('goes for a ship too: its pilot down, its wreck, and the ship back on its pad', () => {
    const m = match();
    m.board(m.bob, 3);
    const ship = m.cars()[3];
    ship.hp = 1;
    // Cy by its tail, on the ground, shoots up into the hull.
    m.put(m.cy, ship.x - 12, ship.z, { ammo: AMMO_MAX });
    m.shoot(m.cy, 1, { pitch: 0.05 });
    expect(ship).toMatchObject({ hp: 0, driver: NOBODY, nades: 0 });
    expect(ship.wreck).toBeGreaterThan(0);
    expect(m.state(m.bob).down).toBeGreaterThan(0);
    m.put(m.ann, ship.x, ship.z + 3);
    m.use(m.ann);
    expect(m.state(m.ann).mode).not.toBe(MODE.RIDE);
    m.ticks(ship.wreck!);
    expect(ship).toMatchObject({
      x: -40,
      z: 30,
      hp: VEHICLE.HP,
      wreck: 0,
      nades: SHIP.MISSILES,
      driver: NOBODY,
    });
    expect(ship.y).toBeCloseTo(park(W)[3].y, 2);
  });
});

describe('a new match, a new map, an empty room', () => {
  it('parks every vehicle afresh when the next match starts', () => {
    const m = match({ timeLimit: 1 });
    gunner(m);
    m.shoot(m.cy, 2);
    m.board(m.ann, 0);
    m.hold(m.ann, 20, FORWARD);
    Object.assign(m.cars()[3], { hp: 0, wreck: 250 });
    expect(hp(m)).toEqual([10, 8, 10, 0]);
    m.ticks(TICK_HZ + END_SCREEN * TICK_HZ + 2);
    expect(m.snap(m.ann).over).toBe(false);
    expect(m.cars().map(r => [r.x, r.z, r.hp, r.wreck, r.driver])).toEqual(
      park(W).map(r => [r.x, r.z, r.hp, r.wreck, NOBODY]),
    );
    expect(m.room['wear'].every(w => !w.graze && !w.sear)).toBe(true);
  });

  it('parks them afresh when the room empties', () => {
    const m = match();
    gunner(m);
    m.shoot(m.cy, 3);
    expect(hp(m)[1]).toBe(7);
    for (const c of [m.ann, m.bob, m.cy, m.dee]) {
      m.room.disconnect(c);
    }
    expect(m.room['rovers']).toEqual(park(W));
  });
});
