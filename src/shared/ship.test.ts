import { describe, expect, it } from 'vitest';
import * as ride from '../../test/ride';
import { box, land } from '../../test/slope';
import { duo } from '../../test/teams';
import { TICK_HZ, VEHICLE } from './constants';
import { MOON } from './moon';
import { move } from './physics';
import { decodeSnapshot, encodeInput } from './protocol';
import { Room } from './room';
import { drive, hull, nearby, park } from './rover';
import { SHIP, dock, limits, pilot, struck } from './ship';
import { KEY, MODE, NOBODY } from './types';
import type { Conn, Input, PlayerState, Rover } from './types';
import { build } from './world';
import type { Spawn, World } from './world';

const EAST = (3 * Math.PI) / 2;
/** A flat land (bound 300 m round the origin) with a ship at rest on (0, 0), its nose to the east. */
const field = (brushes = [] as ReturnType<typeof box>[], ships: Spawn[] = [[0, 0, 0, EAST]]) =>
  build({ ...land(undefined, brushes).def, ships });

const keys = (k: number, yaw = EAST, pitch = 0): Input => ({ keys: k, yaw, pitch, seq: 0 });
/** `n` steps of the stick, or with nobody at it. */
const fly = (r: Rover, w: World, n: number, i?: Input) => {
  for (let k = 0; k < n; k++) {
    pilot(r, i, w);
  }
};
const speed = (r: Rover) => Math.hypot(r.vx, r.vy, r.vz);

describe('a ship in flight (pilot)', () => {
  it('rests on its skids on the pad with nobody aboard, and is solid to a player on foot', () => {
    const w = field();
    const [r] = park(w);
    expect(r).toMatchObject({ ship: true, hp: VEHICLE.HP, wreck: 0, nades: SHIP.MISSILES });
    expect(r.y).toBeCloseTo(SHIP.DROP, 6);
    fly(r, w, 120);
    expect(r.y).toBeCloseTo(SHIP.DROP, 3);
    expect([r.x, r.z, r.steer]).toEqual([0, 0, -1]);
    // A runner walking into its flank stops at the hull.
    const p = { ...MOON_PLAYER, x: 0, y: 0, z: 6 };
    for (let k = 0; k < 120; k++) {
      move(p, { keys: KEY.FORWARD, yaw: 0, pitch: 0, seq: k }, w, 0, [hull(r)]);
    }
    expect(p.z).toBeGreaterThan(SHIP.R);
  });

  it('takes off on Space, hovers with no key held, and lands on C', () => {
    const w = field();
    const [r] = park(w);
    fly(r, w, 90, keys(KEY.JUMP));
    expect(r.y).toBeGreaterThan(8);
    expect(r.steer).toBe(0);
    fly(r, w, 240, keys(0));
    const y = r.y;
    fly(r, w, 120, keys(0));
    expect(Math.abs(r.y - y)).toBeLessThan(0.01);
    fly(r, w, 600, keys(KEY.CROUCH));
    expect(r.y).toBeCloseTo(SHIP.DROP, 3);
    expect(r.steer).toBe(-1);
  });

  it('flies where the look points: the nose turns to the yaw and pitch, thrust goes along it to the top speed', () => {
    const w = field();
    const [r] = park(w);
    fly(r, w, 60, keys(KEY.JUMP));
    // North (yaw 0 looks to -z), nose up a little.
    fly(r, w, 300, keys(KEY.FORWARD, 0, 0.3));
    expect(Math.min(r.yaw, 2 * Math.PI - r.yaw)).toBeLessThan(0.01);
    expect(r.pitch).toBeCloseTo(0.3, 2);
    expect(r.vz).toBeLessThan(-30);
    expect(r.vy).toBeGreaterThan(10);
    expect(speed(r)).toBeLessThanOrEqual(SHIP.VMAX + 0.01);
    // Shift boosts past it (back south: the edge is 264 m north).
    fly(r, w, 420, keys(KEY.FORWARD | KEY.SPRINT, Math.PI, -0.1));
    expect(speed(r)).toBeGreaterThan(SHIP.VMAX * 1.3);
  });

  it('banks into a turn and levels out of it', () => {
    const w = field();
    const [r] = park(w);
    fly(r, w, 60, keys(KEY.JUMP));
    // A turn to the left: the left side goes down (roll < 0).
    fly(r, w, 20, keys(KEY.FORWARD, EAST + 1.2));
    expect(r.roll).toBeLessThan(-0.2);
    fly(r, w, 240, keys(KEY.FORWARD, EAST + 1.2));
    expect(Math.abs(r.roll)).toBeLessThan(0.01);
  });

  it('never climbs past the ceiling: the climb fades under it, a push brings it back down', () => {
    const w = field();
    const [r] = park(w);
    let top = 0;
    for (let k = 0; k < 60 * TICK_HZ; k++) {
      pilot(r, keys(KEY.JUMP | KEY.FORWARD | KEY.SPRINT, EAST, SHIP.PMAX), w);
      top = Math.max(top, r.y);
    }
    expect(top).toBeLessThanOrEqual(SHIP.CEIL + SHIP.OVER);
    expect(r.y).toBeGreaterThan(SHIP.CEIL - SHIP.WARN);
    expect(r.y).toBeLessThan(SHIP.CEIL + 1);
    expect(limits(r, w)[0]).toBeGreaterThan(0.9);
  });

  it('never leaves the crater: the way out fades near its edge, a push brings it back in', () => {
    const w = field();
    const [r] = park(w);
    fly(r, w, 120, keys(KEY.JUMP));
    let far = 0;
    for (let k = 0; k < 40 * TICK_HZ; k++) {
      pilot(r, keys(KEY.FORWARD | KEY.SPRINT, EAST), w);
      far = Math.max(far, r.x);
    }
    const edge = SHIP.EDGE * 300;
    expect(far).toBeLessThanOrEqual(edge + SHIP.OVER);
    expect(r.x).toBeGreaterThan(edge - SHIP.WARN);
    expect(r.x).toBeLessThan(edge + 2);
    expect(limits(r, w)[1]).toBeGreaterThan(0.9);
    // Inside, no warning.
    expect(limits({ x: 0, y: 30, z: 0 }, w)).toEqual([0, 0]);
  });

  it('stops on a wall and under a roof, as a solid', () => {
    // A wall 30 m east, and a slab 6 m over the ground from 35 m west on.
    const w = field([box([30, 0, -20], [32, 40, 20]), box([-120, 6, -10], [-35, 7, 10])]);
    const [r] = park(w);
    fly(r, w, 30, keys(KEY.JUMP));
    fly(r, w, 300, keys(KEY.FORWARD, EAST));
    expect(r.x).toBeLessThan(30 - SHIP.R + 0.01);
    // Low under the slab, then up into it: its top stays under the slab's bottom.
    const [s] = park(w);
    fly(s, w, 150, keys(KEY.BACK, EAST));
    expect(s.x).toBeLessThan(-40);
    fly(s, w, 120, keys(KEY.JUMP, EAST));
    expect(s.y - SHIP.DROP + SHIP.H).toBeLessThanOrEqual(6.001);
    expect(s.y).toBeGreaterThan(SHIP.DROP + 1);
  });

  it('falls to the ground with nobody at the stick, and drive() flies it as a ship', () => {
    const w = field();
    const [r] = park(w);
    fly(r, w, 120, keys(KEY.JUMP));
    const flown = { ...r };
    fly(r, w, 60 * TICK_HZ);
    expect(r.y).toBeCloseTo(SHIP.DROP, 3);
    drive(flown, undefined, w);
    const again = { ...flown };
    pilot(again, undefined, w);
    drive(flown, undefined, w);
    expect(flown).toEqual(again);
  });

  it('is hit by a shot along the hull, and by none over it or short of it', () => {
    const [r] = dock([[0, 0, 0, EAST]]);
    expect(struck(r, [-30, SHIP.DROP, 0], [1, 0, 0], 100)).toBeCloseTo(30 - 4.5 - SHIP.HIT, 3);
    expect(struck(r, [-30, 20, 0], [1, 0, 0], 100)).toBe(Infinity);
    expect(struck(r, [-30, SHIP.DROP, 0], [1, 0, 0], 20)).toBe(Infinity);
  });

  it('falls to the ground as a wreck, its engines off, where the tick takes it', () => {
    const w = field();
    const [r] = park(w);
    fly(r, w, 120, keys(KEY.JUMP));
    fly(r, w, 60, keys(KEY.FORWARD));
    expect(r.y).toBeGreaterThan(10);
    Object.assign(r, { hp: 0, wreck: VEHICLE.WRECK, driver: NOBODY });
    const [x, y] = [r.x, r.y];
    fly(r, w, 3 * TICK_HZ);
    // It keeps its way and comes down.
    expect(r.x).toBeGreaterThan(x + 1);
    expect(r.y).toBeLessThan(y);
    fly(r, w, 20 * TICK_HZ);
    expect(r.y).toBeCloseTo(SHIP.DROP, 3);
    // Nobody gets in, and it is in the way like any hull.
    expect(nearby(r, { x: r.x, y: 0, z: r.z + 2 })).toBe(false);
    expect(hull(r).h).toBe(SHIP.H);
  });

  it('stands on each pad of Tranquility, nose to the other base', () => {
    const [red, blue] = park(build(MOON)).filter(r => r.ship);
    expect([red.x, red.z, red.yaw]).toEqual([40, 220, 0]);
    expect([blue.x, blue.z]).toEqual([40, 60]);
    expect(blue.yaw).toBeCloseTo(Math.PI, 6);
  });
});

/** A player on foot, standing still: what move() needs. */
const MOON_PLAYER = {
  ...({} as PlayerState),
  id: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  yaw: 0,
  pitch: 0,
  mode: MODE.GROUND,
  ground: true,
  t: 0,
  edge: 0,
  held: 0,
  jumps: 1,
  airDash: 1,
  dash: 0,
  coyote: 0,
  buffer: 0,
  stun: 0,
  ev: 0,
  fall: 0,
} as PlayerState;

describe('Room: the ships', () => {
  /** A flat land with red's spawn by a ship at the origin, blue's 120 m north by another. */
  const W = build({
    ...land().def,
    teams: duo([[4, 0, 0, EAST]], [[4, 0, -120, EAST]]),
    ships: [
      [0, 0, 0, EAST],
      [0, 0, -120, EAST],
    ],
  });
  const peer = () => {
    const c: Conn & { bins: ArrayBuffer[] } = {
      bins: [],
      send: d => typeof d !== 'string' && c.bins.push(d),
    };
    return c;
  };
  const seqs = new Map<Conn, number>();
  const send = (room: Room, c: Conn, k = 0, n = 1, yaw = EAST, pitch = 0) => {
    for (let i = 0; i < n; i++) {
      const seq = seqs.get(c) ?? 0;
      seqs.set(c, seq + 1);
      room.receive(c, encodeInput({ seq, keys: k, yaw, pitch }));
      room.tick();
    }
  };
  const use = (room: Room, c: Conn) => {
    send(room, c, KEY.USE);
    send(room, c);
  };
  const setup = () => {
    const room = new Room({}, W.def);
    const [a, b] = [peer(), peer()];
    for (const c of [a, b]) {
      room.connect(c);
      room.receive(c, JSON.stringify({ t: 'join', name: 'p' }));
    }
    const st = (c: Conn): PlayerState => room['peers'].get(c)!.state;
    const ships = (): Rover[] => room['rovers'];
    return { room, a, b, st, ships };
  };

  it('seats a pilot with E, one seat only, and lets him out beside the cockpit', () => {
    const { room, a, b, st, ships } = setup();
    use(room, a);
    expect(st(a).mode).toBe(MODE.RIDE);
    expect(ships()[0].driver).toBe(0);
    // Nobody rides along.
    Object.assign(st(b), { x: 3, y: 0, z: 2 });
    use(room, b);
    expect(st(b).mode).not.toBe(MODE.RIDE);
    expect(ships()[0].rider).toBe(NOBODY);
    // He takes off, and gets out in flight: he falls from where the cockpit is.
    send(room, a, KEY.JUMP, 60);
    const y = ships()[0].y;
    use(room, a);
    expect(st(a).mode).toBe(MODE.AIR);
    expect(st(a).y).toBeGreaterThan(y - SHIP.DROP - 0.5);
    expect(ships()[0].driver).toBe(NOBODY);
  });

  it('fires the lasers on a click and a missile on G, its missiles loading back', () => {
    const { room, a, ships } = setup();
    use(room, a);
    send(room, a, KEY.JUMP, 30);
    send(room, a, KEY.FIRE, 1);
    const balls = () => decodeSnapshot(a.bins.at(-1)!)!.balls ?? [];
    send(room, a, 0, 1);
    expect(balls().filter(b => b.power === 6).length).toBeGreaterThanOrEqual(2);
    send(room, a, KEY.SPECIAL, 1);
    expect(ships()[0].nades).toBe(SHIP.MISSILES - 1);
    // G held: one more each MISSILE_COOL inputs.
    send(room, a, KEY.SPECIAL, SHIP.MISSILE_COOL);
    expect(ships()[0].nades).toBe(SHIP.MISSILES - 2);
    send(room, a, 0, SHIP.RELOAD);
    expect(ships()[0].nades).toBe(SHIP.MISSILES - 1);
  });

  it("loses health to an enemy pilot's lasers, blows up with its pilot, falls, and is back on its pad", () => {
    const { room, a, b, st, ships } = setup();
    use(room, a);
    use(room, b);
    // Both up 20 m; blue's ship comes over, 40 m north of red's, and fires south at it.
    send(room, a, KEY.JUMP, 70);
    const [red, blue] = ships();
    Object.assign(blue, {
      x: red.x,
      y: red.y,
      z: red.z - 40,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: Math.PI,
      pitch: 0,
    });
    let n = 0;
    while (red.hp! > 0 && n++ < 60 * TICK_HZ) {
      send(room, b, KEY.FIRE, 1, Math.PI);
      Object.assign(blue, { x: red.x, y: red.y, z: red.z - 40, vx: 0, vy: 0, vz: 0 });
    }
    // Every VEHICLE.GRAZE bolts on the hull took 1: forty in all, twenty salvos.
    expect(n).toBeGreaterThanOrEqual(((VEHICLE.HP * VEHICLE.GRAZE) / 2 - 1) * SHIP.GUN_COOL);
    expect(n).toBeLessThan(30 * SHIP.GUN_COOL);
    expect(red.hp).toBe(0);
    expect(red.wreck).toBeGreaterThan(VEHICLE.WRECK - 3);
    expect(red.driver).toBe(NOBODY);
    expect(st(a)).toMatchObject({ hp: 0, mode: MODE.AIR });
    expect(st(a).down).toBeGreaterThan(0);
    // The wreck falls where it is, with no seat, and is back whole on its pad 5 s after the blast.
    const y = red.y;
    for (let k = red.wreck! - 1; k > 0; k--) {
      room.tick();
    }
    expect(red.wreck).toBe(1);
    expect(red.y).toBeLessThan(y - 5);
    Object.assign(st(b), { x: red.x + 3, y: red.y - SHIP.DROP, z: red.z, mode: MODE.GROUND });
    blue.driver = NOBODY;
    use(room, b);
    expect(red.driver).toBe(NOBODY);
    expect(red).toMatchObject({ x: 0, z: 0, hp: VEHICLE.HP, wreck: 0, nades: SHIP.MISSILES });
    expect(red.y).toBeCloseTo(SHIP.DROP, 6);
  });

  it('does not let a flag carrier fly', () => {
    const { room, a, ships } = setup();
    room['ctf'].carrying = () => 0;
    use(room, a);
    expect(ships()[0].driver).toBe(NOBODY);
  });
});

describe('the ship, predicted against the room', () => {
  /** A flat land with the player's spawn at the origin and a ship 2.5 m east of it, its nose to the east. */
  const lot = build({
    ...land(undefined, [box([60, 0, -40], [64, 30, 40])]).def,
    teams: duo([[0, 0, 0, 0]], [[0, 0, 60, 0]]),
    ships: [[2.5, 0, 0, EAST]],
  });
  /** He gets in, takes off, flies about, into the wall, climbs, sinks and lands. */
  const flight = (): ride.Keys[] => {
    const out: ride.Keys[] = [];
    const add = (n: number, keys: number, yaw = EAST, pitch = 0) => {
      for (let k = 0; k < n; k++) {
        out.push({
          keys,
          yaw: yaw + Math.sin(out.length / 30) * 0.4,
          pitch: pitch + Math.sin(out.length / 17) * 0.2,
        });
      }
    };
    add(5, 0);
    add(3, KEY.USE);
    add(60, KEY.JUMP);
    add(240, KEY.FORWARD | KEY.SPRINT);
    add(60, KEY.LEFT | KEY.FORWARD, EAST + 0.8, 0.4);
    add(120, KEY.BACK | KEY.RIGHT, EAST - 0.5);
    add(300, KEY.CROUCH);
    return out;
  };

  it('replays the pilot and his ship to the bit, whatever the lag', () => {
    for (const [name, lag] of ride.LAGS) {
      const r = ride.drive(lot, flight(), lag);
      expect(r.differing, name).toEqual([]);
      expect(r.final, name).toEqual([]);
      expect(r.checked, name).toBeGreaterThan(50);
      expect(r.pred.riding(), name).toEqual({ rover: 0, seat: 0 });
    }
  });
});
