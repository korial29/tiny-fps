import { describe, expect, it } from 'vitest';
import { duo } from '../../test/teams';
import {
  AMMO_MAX,
  BURST,
  GUN_MAG,
  GUN_RELOAD,
  HARPOON,
  DISK,
  DISK_LOST,
  DISK_RETURN,
  HUNTER_CELLS,
  HUNTER_CELL_TICKS,
  HUNTER_LASER_COOL,
  HUNTER_LASER_HP,
  HUNTER_LASER_LOCK,
  RAIL_CAP,
  RAIL_MAX,
} from './constants';
import { STRIKE, step } from './gun';
import { KITS, ROLE } from './kit';
import { STILL, spawn } from './physics';
import { decodeSnapshot, encodeInput } from './protocol';
import { Room } from './room';
import { CUT, KEY, TEX } from './types';
import type { Flying } from './plasma';
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
  // Out of the way of the duel at the slab's middle.
  ammo: [[5, 1, -20]],
  cells: [[8, 1, -20]],
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
/** What the Hunter has once he found his harpoon, cannon and disc on the racks. */
const ARMED: Partial<PlayerState> = {
  ammo: HUNTER.ammo,
  mag: HUNTER.mag,
  rail: 0,
  cap: HUNTER_CELLS,
  rifle: 0,
  clip: 0,
};
/** A Hunter at his spawn with his blades alone. */
const bare = (over: Partial<PlayerState> = {}): PlayerState =>
  Object.assign(spawn(0, world, 0, 0, HUNTER), over);
/** A Hunter who found all his weapons. */
const hunter = (over: Partial<PlayerState> = {}): PlayerState => bare({ ...ARMED, ...over });

describe('the Hunter’s shoulder cannon (the user, 2026-11-23: his third weapon, on key 3)', () => {
  it('is not on him at the spawn: his blades alone, key 3 leaves them in hand (the user, 2026-11-26)', () => {
    const p = bare();
    expect(p).toMatchObject({ ammo: -1, rail: -1, rifle: -1, blade: true, wield: true });
    go(p, RAIL);
    expect(p).toMatchObject({ railed: false, wield: true });
    go(p, RIFLE);
    expect(p).toMatchObject({ rifled: false, wield: true });
    go(p, 0);
    expect(p).toMatchObject({ wield: true, fists: false });
  });

  it('comes from the rail gun rack, its battery full, and on key 3', () => {
    const p = bare({ x: -20, z: 46 });
    go(p, RAIL);
    expect(p).toMatchObject({ rail: 0, cap: HUNTER_CELLS, railed: true, wield: false, reload: 0 });
  });

  it('fires on the click, then once each HUNTER_LASER_COOL ticks held, a shot of its battery each, and never heats or swaps', () => {
    const p = hunter();
    go(p, RAIL);
    // Its HUNTER_CELLS shots and a beat more, which the battery does not charge in.
    const n = (HUNTER_CELLS + 1) * HUNTER_LASER_COOL;
    const strikes = Array.from({ length: n }, () => go(p, RAIL | FIRE));
    expect(strikes[0]).toBe(STRIKE.RAIL);
    // Held, it fires faster than the battery charges: it runs dry after its HUNTER_CELLS shots.
    expect(HUNTER_LASER_COOL).toBeLessThan(HUNTER_CELL_TICKS);
    expect(strikes.filter(s => s === STRIKE.RAIL)).toHaveLength(HUNTER_CELLS);
    expect(p.shots).toBe(HUNTER_CELLS);
    expect(p).toMatchObject({ cap: 0, heat: 0, hot: false, reload: 0, railed: true });
  });

  it('charges its battery a shot each HUNTER_CELL_TICKS without firing, back to full (the user, 2026-11-23)', () => {
    const p = hunter();
    go(p, RAIL);
    go(p, RAIL | FIRE);
    go(p, RAIL, HUNTER_LASER_COOL);
    go(p, RAIL | FIRE);
    expect(p.cap).toBe(HUNTER_CELLS - 2);
    // Each shot starts the count over: the first one's charge is lost to the second.
    go(p, RAIL, HUNTER_CELL_TICKS - 1);
    expect(p.cap).toBe(HUNTER_CELLS - 2);
    go(p, RAIL);
    expect(p.cap).toBe(HUNTER_CELLS - 1);
    go(p, 0, HUNTER_CELL_TICKS);
    expect(p).toMatchObject({ cap: HUNTER_CELLS, rail: 0 });
    go(p, 0, 3 * HUNTER_CELL_TICKS);
    expect(p).toMatchObject({ cap: HUNTER_CELLS, rail: 0 });
  });

  it('does not fire with its battery empty', () => {
    const p = hunter({ cap: 0, rail: HUNTER_CELL_TICKS });
    go(p, RAIL);
    expect(go(p, RAIL | FIRE)).not.toBe(STRIKE.RAIL);
    expect(p.shots).toBe(0);
  });

  it('has no fists: KEY.FISTS asks for his pistol, and without it leaves his blades in hand', () => {
    const p = hunter();
    go(p, KEY.FISTS | FIRE);
    expect(p).toMatchObject({ fists: false, sided: false, wield: true });
    const q = hunter();
    go(q, RAIL);
    go(q, KEY.FISTS);
    expect(q).toMatchObject({ fists: false, sided: false, railed: false, wield: true });
  });

  it('has no ring on G', () => {
    const p = hunter();
    go(p, RAIL);
    expect(go(p, RAIL | SPECIAL)).not.toBe(STRIKE.RING);
    expect(p.shots).toBe(0);
  });

  it('finds his own weapons on the racks and no standard one (the user, 2026-11-26)', () => {
    // The gun rack: his pistol, as many shots as the marine's gun, and nothing else.
    const p = bare({ x: -20, z: 40 });
    go(p, 0);
    expect(p).toMatchObject({ side: AMMO_MAX, sideMag: GUN_MAG, ammo: -1, rail: -1, rifle: -1 });
    expect(p).toMatchObject({ rack: true, wield: true, sided: false });
    // The katana rack: his harpoon, on arrival only, and its bolts again on the next arrival.
    // Out of the gun rack's circle first (both racks are his `rack`, never overlapping), then
    // there standing: STILL would drop his weapons too.
    Object.assign(p, { x: 0, z: 0, y: 1, vx: 0, vy: 0, vz: 0 });
    go(p, 0);
    expect(p.rack).toBe(false);
    Object.assign(p, { x: -20, z: 43, y: 1, vx: 0, vy: 0, vz: 0 });
    go(p, 0);
    expect(p).toMatchObject({ ammo: HUNTER.ammo, mag: HUNTER.mag, rack: true, wield: false });
    expect(p).toMatchObject({ side: AMMO_MAX, sideMag: GUN_MAG });
    Object.assign(p, { ammo: 1, mag: 0 });
    go(p, 0);
    expect(p).toMatchObject({ ammo: 1, mag: 0 });
    Object.assign(p, STILL, { x: 0, z: 0, y: 1 });
    go(p, 0);
    expect(p.rack).toBe(false);
    Object.assign(p, STILL, { x: -20, z: 43, y: 1 });
    go(p, 0);
    expect(p).toMatchObject({ ammo: HUNTER.ammo, mag: HUNTER.mag });
    // The rail gun rack: his cannon, its battery full, never a rail gun's capsule.
    Object.assign(p, STILL, { x: -20, z: 46, y: 1 });
    go(p, RAIL);
    expect(p).toMatchObject({ rail: 0, cap: HUNTER_CELLS, railed: true });
    // The rifle rack: his disc (key 4, KEY.RIFLE), carried, nothing in it, and no rifle, clip or grenade.
    Object.assign(p, STILL, { x: -20, z: 49, y: 1 });
    go(p, RIFLE);
    expect(p).toMatchObject({ rifle: 0, clip: 0, rifled: true, nades: 0 });
    // An old marine's rail gun is not kept by a Hunter either: no more than his battery's shots.
    Object.assign(p, { rail: RAIL_MAX, cap: RAIL_CAP });
    go(p, 0);
    expect(p).toMatchObject({ rail: 0, cap: HUNTER_CELLS });
  });

  it('gets no second disc from the rack while the first is out', () => {
    const p = hunter({ x: -20, z: 49, inRifle: false, clip: DISK_LOST });
    go(p, RIFLE);
    expect(p).toMatchObject({ rifle: 0, clip: DISK_LOST - 1 });
  });

  it('loses what he found when he dies: his blades alone at the respawn', () => {
    const p = hunter({ hp: 0, down: 1, side: 20, sideMag: 5, sided: true });
    step(p, { seq: 0, keys: 0, yaw: EAST, pitch: 0 }, world, 0, true, [], HUNTER);
    expect(p).toMatchObject({ ammo: -1, rail: -1, rifle: -1, side: -1, blade: true, wield: true });
    expect(p.sided).toBe(false);
  });
});

describe('the Hunter’s pistol (the user, 2026-11-26: the gun with his own skin, on key 2)', () => {
  const MARINE = KITS[ROLE.MARINE];
  /** A Hunter with every weapon and his pistol full. */
  const armed = (over: Partial<PlayerState> = {}) =>
    hunter({ side: AMMO_MAX, sideMag: GUN_MAG, ...over });
  /** A marine with a full gun, where the Hunter stands. */
  const marine = () =>
    Object.assign(spawn(0, world, 0, 0, MARINE), { ammo: AMMO_MAX, mag: GUN_MAG });
  const run = (p: PlayerState, kit: typeof MARINE, keys: number[]) =>
    keys.map((k, n) => step(p, { seq: n, keys: k, yaw: EAST, pitch: 0 }, world, 0, true, [], kit));
  const { FISTS, RELOAD } = KEY;

  it('is in hand on KEY.FISTS, apart from the harpoon, whose bolts it never spends', () => {
    const p = armed();
    go(p, FISTS);
    expect(p).toMatchObject({
      sided: true,
      wield: false,
      railed: false,
      rifled: false,
      fists: false,
    });
    expect(p).toMatchObject({
      ammo: HUNTER.ammo,
      mag: HUNTER.mag,
      side: AMMO_MAX,
      sideMag: GUN_MAG,
    });
    // Back to the harpoon (no weapon key), then to the pistol again.
    go(p, 0);
    expect(p).toMatchObject({ sided: false, wield: false, ammo: HUNTER.ammo });
    go(p, FISTS);
    expect(p.sided).toBe(true);
  });

  it('charges, fires, bursts and reloads exactly as the marine’s gun, step for step', () => {
    // Taps, a held charge let go, a burst on G, a dry battery and its swap, a reload asked for.
    const keys = [
      FIRE,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      ...Array<number>(30).fill(FIRE),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      SPECIAL,
      ...Array<number>(30).fill(0),
      ...Array.from({ length: 120 }, (_, n) => (n % 3 ? 0 : FIRE)),
      RELOAD,
      ...Array<number>(GUN_RELOAD + 4).fill(0),
      FIRE,
      0,
      0,
    ];
    const h = armed();
    const m = marine();
    go(h, FISTS);
    const a = run(
      h,
      HUNTER,
      keys.map(k => k | FISTS),
    );
    const b = run(m, MARINE, keys);
    expect(a).toEqual(b);
    expect(a.filter(s => s === STRIKE.SHOT).length).toBeGreaterThan(BURST + 5);
    expect([h.side, h.sideMag, h.cool, h.shots, h.reload, h.charge, h.burst]).toEqual([
      m.ammo,
      m.mag,
      m.cool,
      m.shots,
      m.reload,
      m.charge,
      m.burst,
    ]);
    // The harpoon was never touched.
    expect(h).toMatchObject({ ammo: HUNTER.ammo, mag: HUNTER.mag, sided: true });
  });

  it('keeps the harpoon its own: a bolt, no burst on G, and the pistol’s shots untouched', () => {
    const p = armed({ sideMag: 7, side: 30 });
    go(p, 0);
    expect(go(p, SPECIAL)).toBe(STRIKE.NONE);
    expect(go(p, FIRE)).toBe(STRIKE.SHOT);
    expect(p).toMatchObject({ ammo: HUNTER.ammo - 1, mag: 0, side: 30, sideMag: 7, sided: false });
  });

  it('fires plasma through the room, not a harpoon bolt', () => {
    const room = new Room({}, ARENA);
    const c: Conn = { send: () => {} };
    room.connect(c);
    room.receive(c, JSON.stringify({ t: 'join', name: 'hunter', role: ROLE.HUNTER }));
    const foe: Conn = { send: () => {} };
    room.connect(foe);
    room.receive(foe, JSON.stringify({ t: 'join', name: 'foe', role: ROLE.MARINE }));
    const p: PlayerState = room['peers'].get(c)!.state;
    Object.assign(p, STILL, ARMED, { side: AMMO_MAX, sideMag: GUN_MAG, x: 0, y: 1, z: 0 });
    const balls = () => (room['balls'] as Flying[]).map(b => b.power);
    let seq = 0;
    const send = (keys: number) => {
      room.receive(c, encodeInput({ seq: seq++, keys, yaw: EAST, pitch: 0, view: room['ticks'] }));
      room.tick();
    };
    send(FISTS);
    send(FISTS | FIRE);
    send(FISTS);
    expect(balls()).toEqual([1]);
    for (let n = 0; n < 20; n++) {
      send(0);
    }
    send(FIRE);
    expect(balls()).toContain(HARPOON);
  });

  it('is the Hunter’s alone: KEY.FISTS is still the marine’s fists, and he never has a pistol', () => {
    const m = marine();
    run(m, MARINE, [KEY.FISTS]);
    expect(m).toMatchObject({ fists: true, sided: false, side: -1 });
    const n = Object.assign(marine(), { side: 12, sideMag: 4, sided: true });
    run(n, MARINE, [0]);
    expect(n).toMatchObject({ side: -1, sideMag: 0, sided: false });
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
    Object.assign(state(hunterC), STILL, ARMED, { x: 0, y: 1, z: 0, yaw: EAST, ground: true });
    Object.assign(state(foeC), STILL, { x: 12, y: 1, z: 0, yaw: -EAST, ground: true });
    return { room, hold, turn, hunter: state(hunterC), foe: state(foeC) };
  };

  it('has no cannon once he joins as the Hunter, the class taken after his spawn', () => {
    const m = match();
    Object.assign(m.hunter, { ammo: -1, rail: -1, rifle: -1 });
    m.hold(1, RAIL);
    expect(m.hunter).toMatchObject({ rail: -1, railed: false, wield: true });
  });

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
    // A few shots on the way (not all: the battery would run dry before the lock).
    const early = 2 * HUNTER_LASER_COOL + 2;
    m.hold(early, RAIL | FIRE);
    expect(m.foe.hp).toBe(hp);
    expect(m.hunter.shots).toBeGreaterThan(1);
    m.hold(HUNTER_LASER_LOCK - 2 - early, RAIL);
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

  it('leaves an ammo pack he cannot use and every rail cell where they are, and fills his harpoon from one', () => {
    const m = match();
    const gone = m.room['gone'] as number[];
    // Full harpoon, his disc in hand, his battery charging: neither pack is his to take.
    Object.assign(m.hunter, { x: 5, z: -20, cap: 1, rail: 9 });
    m.hold(1, 0);
    expect(gone[0]).toBe(0);
    expect(m.hunter.rifle).toBe(0);
    Object.assign(m.hunter, { x: 8, z: -20 });
    m.hold(1, 0);
    expect(gone[1]).toBe(0);
    expect(m.hunter.rail).toBeLessThanOrEqual(HUNTER_CELL_TICKS);
    // Short of bolts, the ammo pack fills the harpoon.
    Object.assign(m.hunter, { x: 5, z: -20, ammo: 2 });
    m.hold(1, 0);
    expect(gone[0]).toBeGreaterThan(0);
    expect(m.hunter).toMatchObject({ ammo: HUNTER.ammo, rifle: 0 });
  });

  it('does not lock on while the blades are in hand', () => {
    const m = match();
    const hp = m.foe.hp;
    m.hold(HUNTER_LASER_LOCK + 10, BLADE | FIRE);
    m.hold(2, RAIL | FIRE);
    expect(m.foe.hp).toBe(hp);
  });

  it('throws his disc again only once he caught it, and the snapshot carries it out (the user, 2026-11-24)', () => {
    const m = match();
    // A disc in flight, out or coming back.
    const discs = () =>
      (m.room['balls'] as Flying[]).filter(
        b => !b.burst && (b.power === DISK || b.power === DISK_RETURN),
      ).length;
    m.hold(1, RIFLE);
    const shots = m.hunter.shots;
    m.hold(1, RIFLE | FIRE);
    expect(m.hunter.shots).toBe(shots + 1);
    expect(m.hunter.clip).toBeGreaterThan(0);
    // Clicking on while it is out throws nothing: once the client throws at will (`cool` has 4 bits
    // on the wire), but `clip` goes whole, and so does the next throw's prediction.
    let snap: ArrayBuffer | undefined;
    for (const c of (m.room['peers'] as Map<Conn, unknown>).keys()) {
      c.send = d => typeof d !== 'string' && (snap = d as ArrayBuffer);
    }
    while (!snap) {
      m.hold(1, RIFLE);
    }
    const sent = decodeSnapshot(snap)!.players.find(q => q.id === m.hunter.id)!;
    expect(sent.clip).toBe(m.hunter.clip);
    expect(sent.clip).toBeGreaterThan(15);
    let n = 0;
    while (m.hunter.clip && n < DISK_LOST) {
      expect(discs()).toBe(1);
      m.hold(1, RIFLE | (n & 1 ? FIRE : 0));
      n++;
    }
    // It hit the foe 12 m away and came back into his hand well before DISK_LOST.
    expect(m.hunter.shots).toBe(shots + 1);
    expect(n).toBeLessThan(DISK_LOST / 2);
    expect(discs()).toBe(0);
    m.hold(1, RIFLE);
    m.hold(1, RIFLE | FIRE);
    expect(m.hunter.shots).toBe(shots + 2);
  });
});

describe('the Hunter’s wrist blades and harpoon (the user, 2026-11-23)', () => {
  it('throws his disc on FIRE from slot 4, again only once it is back, and not with G and the blades', () => {
    const p = hunter();
    expect(go(p, SPECIAL)).toBe(STRIKE.NONE);
    go(p, RIFLE);
    expect(p).toMatchObject({ rifled: true, wield: false, reload: 0 });
    // Out, it cannot be thrown again (the user, 2026-11-24): one not caught (the room's catch sets
    // `clip` to 0) is back in the hand DISK_LOST ticks after the throw.
    const strikes = Array.from({ length: DISK_LOST + 1 }, () => go(p, RIFLE | FIRE));
    expect(strikes[0]).toBe(STRIKE.DISK);
    expect(strikes.map((s, i) => (s === STRIKE.DISK ? i : -1)).filter(i => i >= 0)).toEqual([
      0,
      DISK_LOST,
    ]);
    p.clip = 0;
    expect(go(p, RIFLE | FIRE)).toBe(STRIKE.DISK);
  });

  it('has his blades alone when he took the class after his spawn: the harpoon is on a rack', () => {
    // A marine's spawn (no gun until the rack), then the class changes at the next step.
    const p = Object.assign(spawn(0, world, 0, 0, KITS[ROLE.MARINE]), { x: 0, y: 1, z: 0 });
    expect(p.ammo).toBe(-1);
    go(p, 0);
    expect(p).toMatchObject({ ammo: -1, blade: true, wield: true });
    go(p, 0);
    expect(p).toMatchObject({ railed: false, wield: true, fists: false });
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
