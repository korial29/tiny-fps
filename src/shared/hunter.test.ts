import { describe, expect, it } from 'vitest';
import { duo } from '../../test/teams';
import {
  DISK_COOL,
  HEAT_MAX,
  HUNTER_LASER_COOL,
  HUNTER_LASER_HP,
  HUNTER_LASER_LOCK,
  RAIL_CAP,
  RAIL_MAX,
} from './constants';
import { STRIKE, step } from './gun';
import { KITS, ROLE } from './kit';
import { STILL, spawn } from './physics';
import { encodeInput } from './protocol';
import { Room } from './room';
import { CUT, KEY, TEX } from './types';
import type { Conn, PlayerState } from './types';
import { build } from './world';
import type { WorldDef } from './world';

const HUNTER = KITS[ROLE.HUNTER];
const { RAIL, RIFLE, FIRE, SPECIAL, BLADE, FORWARD } = KEY;
/** Facing +x (east): yaw zero faces -z, and a quarter turn to the right is -π/2. */
const EAST = -Math.PI / 2;

/** A slab at y = 1 with each team's racks side by side, and the spawns far from them. */
const ARENA: WorldDef = {
  brushes: [{ min: [-100, -5, -100], max: [100, 1, 100], top: TEX.TILE, side: TEX.BRICK }],
  teams: [
    {
      ...duo([[0, 1, 0, EAST]])[0],
      base: [-60, 1, 4],
      rack: [-20, 1, 40],
      blade: [-20, 1, 43],
      rail: [-20, 1, 46],
      rifle: [-20, 1, 49],
    },
    {
      ...duo([[40, 1, 0, EAST]])[1],
      base: [60, 1, 4],
      rack: [60, 1, 40],
      rail: [60, 1, 46],
    },
  ],
  floor: -20,
  sun: { dir: [0, 1, 0], color: [1, 1, 1] },
  sky: [
    [0, 0, 1],
    [1, 1, 1],
  ],
};
const world = build(ARENA);

/** One step of the Hunter alone with `keys`, facing east. */
const go = (p: PlayerState, keys: number, n = 1) => {
  let s: number = STRIKE.NONE;
  for (let k = 0; k < n; k++) {
    s = step(p, { seq: k, keys, yaw: EAST, pitch: 0 }, world, 0, true, [], HUNTER);
  }
  return s;
};
const hunter = (over: Partial<PlayerState> = {}): PlayerState =>
  Object.assign(spawn(0, world, 0, 0, HUNTER), over);

describe('the Hunter’s shoulder cannon (the user, 2026-11-23: his third weapon, on key 3)', () => {
  it('is on him from the spawn and comes on key 3 with nothing in it to spend', () => {
    const p = hunter();
    expect(p).toMatchObject({ rail: 0, cap: 0, blade: true, wield: true });
    go(p, RAIL);
    expect(p).toMatchObject({ railed: true, wield: false, reload: 0 });
  });

  it('fires on the click, then once each HUNTER_LASER_COOL ticks held, and never spends, heats or swaps', () => {
    const p = hunter();
    go(p, RAIL);
    const n = 4 * HEAT_MAX;
    const strikes = Array.from({ length: n }, () => go(p, RAIL | FIRE));
    expect(strikes[0]).toBe(STRIKE.RAIL);
    expect(strikes.filter(s => s === STRIKE.RAIL)).toHaveLength(Math.ceil(n / HUNTER_LASER_COOL));
    expect(p.shots).toBe(Math.ceil(n / HUNTER_LASER_COOL));
    expect(p).toMatchObject({ rail: 0, cap: 0, heat: 0, hot: false, reload: 0, railed: true });
  });

  it('has no fists: KEY.FISTS leaves the weapon in hand', () => {
    const p = hunter();
    go(p, BLADE | KEY.FISTS | FIRE);
    expect(p).toMatchObject({ fists: false, wield: true });
    const q = hunter();
    go(q, RAIL | KEY.FISTS);
    expect(q).toMatchObject({ fists: false, railed: true });
  });

  it('has no ring on G', () => {
    const p = hunter();
    go(p, RAIL);
    expect(go(p, RAIL | SPECIAL)).not.toBe(STRIKE.RING);
    expect(p.shots).toBe(0);
  });

  it('takes no other weapon: the rail and rifle racks give him nothing, the gun rack his harpoon bolts', () => {
    // Key 4 (KEY.RIFLE) is his disc: carried, nothing in it, and no rifle, clip or grenade from the rack.
    const p = hunter({ x: -20, z: 46 });
    go(p, RAIL);
    expect(p).toMatchObject({ rail: 0, cap: 0, railed: true });
    Object.assign(p, STILL, { x: -20, z: 49, y: 1, inRifle: false });
    go(p, RIFLE);
    expect(p).toMatchObject({ rifle: 0, clip: 0, rifled: true, nades: 0 });
    // An old marine's rail gun is not kept by a Hunter either.
    Object.assign(p, { rail: RAIL_MAX, cap: RAIL_CAP });
    go(p, 0);
    expect(p).toMatchObject({ rail: 0, cap: 0 });
    Object.assign(p, STILL, { x: -20, z: 40, y: 1, ammo: 1, mag: 0, rack: false });
    go(p, 0);
    expect(p).toMatchObject({ ammo: HUNTER.ammo, mag: HUNTER.mag });
  });
});

describe('the shoulder cannon through the room', () => {
  type Peer = Conn & { id?: number };
  const match = () => {
    const room = new Room({}, ARENA);
    const join = (name: string, role: number): Peer => {
      const c: Peer = { send: () => {} };
      room.connect(c);
      room.receive(c, JSON.stringify({ t: 'join', name, role }));
      return c;
    };
    const hunterC = join('hunter', ROLE.HUNTER);
    const foeC = join('foe', ROLE.MARINE);
    const state = (c: Peer): PlayerState => room['peers'].get(c)!.state;
    let seq = 0;
    const turn = (yaw: number, n: number, keys: number) => {
      for (let k = 0; k < n; k++) {
        room.receive(
          hunterC,
          encodeInput({ seq: seq++, keys, yaw, pitch: 0, view: room['ticks'] }),
        );
        room.tick();
      }
    };
    const hold = (n: number, keys: number) => turn(EAST, n, keys);
    // Face to face on the slab, 12 m apart, the foe square in the cannon's sight.
    Object.assign(state(hunterC), STILL, { x: 0, y: 1, z: 0, yaw: EAST, ground: true });
    Object.assign(state(foeC), STILL, { x: 12, y: 1, z: 0, yaw: -EAST, ground: true });
    return { room, hold, turn, hunter: state(hunterC), foe: state(foeC) };
  };

  it('hits on the click, down the look, for three health (the user, 2026-11-23)', () => {
    const m = match();
    const hp = m.foe.hp;
    m.hold(1, RAIL);
    m.hold(1, RAIL | FIRE);
    expect(m.foe.hp).toBe(hp - HUNTER_LASER_HP);
    expect(m.hunter.hits).toBe(1);
  });

  it('misses a foe off the look until he is locked on, then its shots go at him', () => {
    const m = match();
    // 4° to the side at 12 m: in the lock's cone, out of the straight shot's line.
    Object.assign(m.foe, { z: 12 * Math.tan((4 * Math.PI) / 180) });
    const hp = m.foe.hp;
    m.hold(HUNTER_LASER_LOCK - 2, RAIL | FIRE);
    expect(m.foe.hp).toBe(hp);
    expect(m.hunter.shots).toBeGreaterThan(1);
    m.hold(HUNTER_LASER_COOL + 4, RAIL | FIRE);
    expect(m.foe.hp).toBe(hp - HUNTER_LASER_HP);
  });

  it('loses the lock once the foe leaves the screen, and starts it over (the user, 2026-11-23)', () => {
    const m = match();
    Object.assign(m.foe, { z: 12 * Math.tan((4 * Math.PI) / 180) });
    const hp = m.foe.hp;
    m.hold(HUNTER_LASER_LOCK - 2, RAIL);
    // One tick looking away: he is off the screen and the lock is gone.
    m.turn(EAST + Math.PI / 2, 1, RAIL);
    m.hold(HUNTER_LASER_COOL + 4, RAIL | FIRE);
    expect(m.foe.hp).toBe(hp);
    m.hold(HUNTER_LASER_LOCK, RAIL | FIRE);
    expect(m.foe.hp).toBeLessThan(hp);
  });

  it('keeps the lock on a foe off the cone while he stays on the screen', () => {
    const m = match();
    Object.assign(m.foe, { z: 12 * Math.tan((4 * Math.PI) / 180) });
    const hp = m.foe.hp;
    m.hold(HUNTER_LASER_LOCK - 2, RAIL);
    // 20° off the look: out of the 10° cone that starts a lock, still on the screen.
    m.turn(EAST - (20 * Math.PI) / 180, HUNTER_LASER_COOL + 4, RAIL | FIRE);
    expect(m.foe.hp).toBe(hp - HUNTER_LASER_HP);
  });

  it('does not lock on while the blades are in hand', () => {
    const m = match();
    const hp = m.foe.hp;
    m.hold(HUNTER_LASER_LOCK + 10, BLADE | FIRE);
    m.hold(2, RAIL | FIRE);
    expect(m.foe.hp).toBe(hp);
  });
});

describe('the Hunter’s wrist blades and harpoon (the user, 2026-11-23)', () => {
  it('throws his disc on FIRE from slot 4, once each DISK_COOL ticks held, and not with G and the blades', () => {
    const p = hunter();
    expect(go(p, SPECIAL)).toBe(STRIKE.NONE);
    go(p, RIFLE);
    expect(p).toMatchObject({ rifled: true, wield: false, reload: 0 });
    const strikes = Array.from({ length: DISK_COOL + 1 }, () => go(p, RIFLE | FIRE));
    expect(strikes[0]).toBe(STRIKE.DISK);
    expect(strikes.filter(s => s === STRIKE.DISK)).toHaveLength(2);
  });

  it('has his harpoon from the start, also when he took the class after his spawn', () => {
    // A marine's spawn (no gun until the rack), then the class changes at the next step.
    const p = Object.assign(spawn(0, world, 0, 0, KITS[ROLE.MARINE]), { x: 0, y: 1, z: 0 });
    expect(p.ammo).toBe(-1);
    go(p, 0);
    expect(p).toMatchObject({ ammo: HUNTER.ammo, mag: HUNTER.mag, blade: true });
    go(p, 0);
    expect(p).toMatchObject({ railed: false, wield: false, fists: false });
  });

  it('never thrust: FORWARD with FIRE slashes, and its special is the leap, not the lunge', () => {
    const p = hunter();
    go(p, BLADE | FORWARD | FIRE);
    expect(p).toMatchObject({ wield: true, cut: CUT.SLASH });
    const q = hunter();
    go(q, BLADE | FORWARD | FIRE | SPECIAL);
    expect(q.cut).toBe(CUT.LEAP);
  });

  it('cut across with a side key as before', () => {
    const p = hunter();
    go(p, BLADE | KEY.LEFT | FIRE);
    expect(p.cut).toBe(CUT.LEFT);
  });

  it('fires no burst from the harpoon on G: its special is the scope, the client’s alone', () => {
    const p = hunter();
    go(p, 0);
    expect(p).toMatchObject({ wield: false, mag: 1 });
    expect(go(p, SPECIAL)).toBe(STRIKE.NONE);
    expect(p).toMatchObject({ ammo: HUNTER.ammo, mag: 1, shots: 0 });
    expect(go(p, FIRE)).toBe(STRIKE.SHOT);
    expect(p.mag).toBe(0);
  });
});
