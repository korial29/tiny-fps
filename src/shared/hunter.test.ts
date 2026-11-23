import { describe, expect, it } from 'vitest';
import { duo } from '../../test/teams';
import { HEAT_MAX, HUNTER_LASER_HP, HUNTER_LASER_LOCK, RAIL_CAP, RAIL_MAX } from './constants';
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

  it('fires every step it is held, never spends, never heats and never swaps a capsule', () => {
    const p = hunter();
    go(p, RAIL);
    const strikes = Array.from({ length: 4 * HEAT_MAX }, () => go(p, RAIL | FIRE));
    expect(strikes.every(s => s === STRIKE.RAIL)).toBe(true);
    expect(p).toMatchObject({ rail: 0, cap: 0, heat: 0, hot: false, reload: 0, railed: true });
  });

  it('has no ring on G', () => {
    const p = hunter();
    go(p, RAIL);
    expect(go(p, RAIL | SPECIAL)).not.toBe(STRIKE.RING);
    expect(p.shots).toBe(0);
  });

  it('takes no other weapon: the rail and rifle racks give him nothing, the gun rack his harpoon bolts', () => {
    const p = hunter({ x: -20, z: 46 });
    go(p, RAIL);
    expect(p).toMatchObject({ rail: 0, cap: 0, railed: true });
    Object.assign(p, STILL, { x: -20, z: 49, y: 1, inRifle: false });
    go(p, RIFLE);
    expect(p).toMatchObject({ rifle: -1, rifled: false, nades: 0 });
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
    const hold = (n: number, keys: number) => {
      for (let k = 0; k < n; k++) {
        room.receive(
          hunterC,
          encodeInput({ seq: seq++, keys, yaw: EAST, pitch: 0, view: room['ticks'] }),
        );
        room.tick();
      }
    };
    // Face to face on the slab, 12 m apart, the foe square in the cannon's sight.
    Object.assign(state(hunterC), STILL, { x: 0, y: 1, z: 0, yaw: EAST, ground: true });
    Object.assign(state(foeC), STILL, { x: 12, y: 1, z: 0, yaw: -EAST, ground: true });
    return { room, hold, hunter: state(hunterC), foe: state(foeC) };
  };

  it('hits only once the foe has been held in its sight for the whole lock, then for three health', () => {
    const m = match();
    const hp = m.foe.hp;
    m.hold(HUNTER_LASER_LOCK - 2, RAIL | FIRE);
    expect(m.foe.hp).toBe(hp);
    m.hold(4, RAIL | FIRE);
    expect(m.foe.hp).toBe(Math.max(0, hp - HUNTER_LASER_HP));
    expect(m.hunter.hits).toBe(1);
  });

  it('does not lock on while the blades are in hand', () => {
    const m = match();
    const hp = m.foe.hp;
    m.hold(HUNTER_LASER_LOCK + 10, FIRE);
    m.hold(2, RAIL | FIRE);
    expect(m.foe.hp).toBe(hp);
  });
});

describe('the Hunter’s wrist blades and harpoon (the user, 2026-11-23)', () => {
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
