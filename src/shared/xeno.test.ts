import { describe, expect, it } from 'vitest';
import { IDLE, duo } from '../../test/teams';
import {
  BLOW,
  CLING_SPEED,
  HP_MAX,
  POUNCE_COOL,
  POUNCE_HOLD,
  POUNCE_HP,
  POUNCE_MAX,
  POUNCE_MIN,
  POUNCE_PITCH,
  POUNCE_STUN,
  PUNCHES,
  XENO_HP,
} from './constants';
import { STRIKE, step } from './gun';
import { KITS, ROLE } from './kit';
import { ROOFTOPS } from './map';
import { STILL, move } from './physics';
import { FRAG, decodeSnapshot, encodeSnapshot } from './protocol';
import { Room } from './room';
import { pouncing } from './tackle';
import { KEY, MODE, TEX } from './types';
import type { Conn, PlayerState } from './types';
import { build } from './world';
import type { Brush } from './world';

const [MARINE, XENO] = [KITS[ROLE.MARINE], KITS[ROLE.XENO]];
type Vec3 = [number, number, number];
const box = (min: Vec3, max: Vec3): Brush => ({ min, max, top: TEX.TILE, side: TEX.BRICK });
/** A ground at y = 0, a block 5 m high from x = 1 to 4 and z = -10 to 10, and far off a tower 30 m high. */
const pit = build({
  brushes: [
    box([-100, -5, -100], [100, 0, 100]),
    box([1, 0, -10], [4, 5, 10]),
    box([-60, 0, -10], [-50, 30, 10]),
  ],
  teams: duo([[-20, 0, 50, 0]]),
  floor: -50,
  sun: { dir: [0, 1, 0], color: [1, 1, 1] },
  sky: [
    [0, 0, 1],
    [1, 1, 1],
  ],
});
/** Yaws that look toward +x and -x. */
const [EAST, WEST] = [(3 * Math.PI) / 2, Math.PI / 2];
const at = (x: number, y: number, over: Partial<PlayerState> = {}): PlayerState => ({
  id: 0,
  x,
  y,
  z: 0,
  vy: 0,
  yaw: EAST,
  pitch: 0,
  ground: y == 0,
  ...STILL,
  ...over,
});
const go = (p: PlayerState, keys: number, yaw = p.yaw, pitch = 0, kit = XENO) =>
  move(p, { seq: 0, keys, yaw, pitch }, pit, 0, [], kit);

describe('the xenomorph on a wall', () => {
  it('clings to a wall it walks into, climbs it and pulls itself up onto its top', () => {
    const p = at(0, 0);
    const modes = new Set<number>();
    for (let k = 0; k < 200 && !(p.mode === MODE.GROUND && p.y > 4); k++) {
      go(p, KEY.FORWARD);
      modes.add(p.mode);
    }
    expect([...modes]).toEqual(expect.arrayContaining([MODE.CLING, MODE.CLIMB]));
    expect(p.mode).toBe(MODE.GROUND);
    expect(p.y).toBe(5);
    expect(p.x).toBeGreaterThan(1);
    // The marine walks into the same wall and stays at its foot.
    const m = at(0, 0);
    for (let k = 0; k < 200; k++) {
      go(m, KEY.FORWARD, EAST, 0, MARINE);
      expect(m.mode).not.toBe(MODE.CLING);
    }
    expect(m.y).toBe(0);
  });

  it('takes hold of a wall it faces in the air, not one beside it', () => {
    const p = at(0.2, 2, { mode: MODE.AIR, ground: false });
    go(p, KEY.FORWARD);
    expect(p.mode).toBe(MODE.CLING);
    // Along the wall, looking along it: no hold.
    const q = at(0.2, 2, { mode: MODE.AIR, ground: false, yaw: 0 });
    go(q, KEY.FORWARD, 0);
    expect(q.mode).not.toBe(MODE.CLING);
  });

  it('goes down and along it, stays put with no key, lets go on crouch and kicks off on a jump', () => {
    const p = at(0.2, 3, { mode: MODE.AIR, ground: false });
    go(p, KEY.FORWARD);
    expect(p.mode).toBe(MODE.CLING);
    const y = p.y;
    go(p, 0);
    expect(p.y).toBe(y);
    go(p, KEY.BACK);
    expect(p.y).toBeCloseTo(y - CLING_SPEED / 60, 4);
    // Facing +x, the right is +z; looking away from the wall, the right is -z.
    const z = p.z;
    go(p, KEY.RIGHT);
    expect(p.z).toBeGreaterThan(z);
    go(p, KEY.RIGHT, WEST);
    expect(p.z).toBeCloseTo(z, 5);
    expect(p.mode).toBe(MODE.CLING);
    // A jump looking away leaps along the look.
    go(p, KEY.JUMP, WEST);
    expect(p.mode).toBe(MODE.AIR);
    expect(p.vx).toBeLessThan(-5);
    expect(p.vy).toBeGreaterThan(0);
    // It does not take hold of the wall it kicked off before it lands.
    for (let k = 0; k < 5; k++) {
      go(p, KEY.FORWARD, EAST);
      expect(p.mode).not.toBe(MODE.CLING);
    }
    const q = at(0.2, 3, { mode: MODE.AIR, ground: false });
    go(q, KEY.FORWARD);
    go(q, KEY.CROUCH);
    expect(q.mode).toBe(MODE.AIR);
  });

  it('walks down off the wall onto the floor', () => {
    const p = at(0.2, 0.5, { mode: MODE.AIR, ground: false });
    go(p, KEY.FORWARD);
    expect(p.mode).toBe(MODE.CLING);
    for (let k = 0; k < 20 && p.mode === MODE.CLING; k++) {
      go(p, KEY.BACK);
    }
    expect(p.mode).toBe(MODE.GROUND);
    expect(p.y).toBe(0);
  });

  it('climbs a tower as high as it goes, with no time limit', () => {
    const p = at(-49.5, 0, { yaw: WEST });
    for (let k = 0; k < 500 && p.y < 29; k++) {
      go(p, KEY.FORWARD, WEST);
    }
    expect(p.y).toBeGreaterThan(29);
  });
});

describe('the pounce', () => {
  it('charges while DASH is held, then leaps along the look as far as the charge, at least POUNCE_PITCH up', () => {
    const p = at(-20, 0, { z: 50, yaw: 0 });
    for (let k = 0; k < POUNCE_HOLD + 20; k++) {
      go(p, KEY.DASH, 0);
    }
    expect(p.charge).toBe(POUNCE_HOLD);
    expect(p.mode).toBe(MODE.GROUND);
    go(p, 0, 0);
    expect(p.mode).toBe(MODE.AIR);
    expect(p.charge).toBe(0);
    expect(p.dash).toBe(POUNCE_COOL);
    expect(-p.vz).toBeCloseTo(POUNCE_MAX * Math.cos(POUNCE_PITCH), 3);
    expect(p.vy).toBeGreaterThan(0);
    expect(pouncing(p)).toBe(true);
    // A tap is a short one, and the timer holds the next back.
    const q = at(-20, 0, { z: 50, yaw: 0 });
    go(q, KEY.DASH, 0);
    go(q, 0, 0);
    expect(-q.vz).toBeLessThan(POUNCE_MIN * 1.05);
    while (q.mode !== MODE.GROUND) {
      go(q, 0, 0);
    }
    go(q, KEY.DASH, 0);
    expect(q.charge ?? 0).toBe(0);
  });

  it('pounces off a wall too, and the marine dashes where it pounces', () => {
    const p = at(0.2, 3, { mode: MODE.AIR, ground: false });
    go(p, KEY.FORWARD);
    go(p, KEY.DASH, WEST, 0.5);
    go(p, 0, WEST, 0.5);
    expect(p.mode).toBe(MODE.AIR);
    expect(p.vx).toBeLessThan(-5);
    const m = at(-20, 0, { z: 50, yaw: 0 });
    go(m, KEY.DASH, 0, 0, MARINE);
    expect(m.charge ?? 0).toBe(0);
    expect(m.dash).toBeGreaterThan(POUNCE_COOL);
  });

  it('goes on the wire: the cling and the charge', () => {
    const p = {
      ...at(0.2, 3, { mode: MODE.CLING, wall: 1, charge: 20, hp: XENO_HP }),
      ack: 0,
      by: 0,
    };
    const back = decodeSnapshot(encodeSnapshot({ tick: 1, players: [p], ...IDLE }))!.players[0];
    expect([back.mode, back.wall, back.charge, back.hp]).toEqual([MODE.CLING, 1, 20, XENO_HP]);
    for (const mode of Object.values(MODE)) {
      const q = decodeSnapshot(encodeSnapshot({ tick: 1, players: [{ ...p, mode }], ...IDLE }))!;
      expect(q.players[0].mode).toBe(mode);
    }
  });
});

describe('the claws and the tail', () => {
  it('swipes left then right while FIRE goes on, and stings with SPECIAL', () => {
    const p = at(-20, 0, { z: 50, yaw: 0 });
    const cuts: number[] = [];
    let strikes = 0;
    for (let k = 0; k < 60; k++) {
      strikes += +(
        step(p, { seq: 0, keys: KEY.FIRE, yaw: 0, pitch: 0 }, pit, 0, true, [], XENO) === STRIKE.CUT
      );
      if (cuts.at(-1) !== p.cut) {
        cuts.push(p.cut!);
      }
    }
    expect(cuts.slice(0, 3)).toEqual([BLOW.CLAW_L, BLOW.CLAW_R, BLOW.CLAW_L]);
    expect(strikes).toBeGreaterThanOrEqual(3);
    const q = at(-20, 0, { z: 50, yaw: 0 });
    step(q, { seq: 0, keys: KEY.SPECIAL, yaw: 0, pitch: 0 }, pit, 0, true, [], XENO);
    expect(q.cut).toBe(BLOW.TAIL);
    expect(q.swing).toBe(PUNCHES[BLOW.TAIL].ticks);
  });

  it('takes nothing from the racks', () => {
    const { rack, blade, rifle } = ROOFTOPS.teams[0];
    const w = build(ROOFTOPS);
    for (const r of [rack!, blade!, rifle!]) {
      const p = at(r[0], r[1], { z: r[2] });
      step(p, { seq: 0, keys: 0, yaw: 0, pitch: 0 }, w, 0, true, [], XENO);
      expect([p.ammo, p.blade, p.rifle]).toEqual([-1, false, -1]);
    }
    const m = at(rack![0], rack![1], { z: rack![2] });
    step(m, { seq: 0, keys: 0, yaw: 0, pitch: 0 }, w, 0, true, [], MARINE);
    expect(m.ammo).toBeGreaterThan(0);
  });
});

describe('the xenomorph in a room', () => {
  type Pl = { info: { name: string; id: number; team: number }; state: PlayerState };
  type Inner = {
    players(): Pl[];
    punch(p: Pl, view?: number): void;
    cut(p: Pl, view?: number): void;
    tackle(p: Pl, view?: number): void;
    heal(players: Pl[]): void;
  };
  const room = (...roles: number[]) => {
    const r = new Room({}, ROOFTOPS);
    const sent: string[] = [];
    roles.forEach((role, k) => {
      const c: Conn = { send: (m: string | ArrayBuffer) => typeof m === 'string' && sent.push(m) };
      r.connect(c);
      r.receive(c, JSON.stringify({ t: 'join', name: `p${k}`, role }));
    });
    const inner = r as unknown as Inner;
    const ps = roles.map((_, k) => inner.players().find(p => p.info.name == `p${k}`)!);
    return { r, inner, ps, sent };
  };
  /** b a metre in front of a, a looking at him (toward -z). */
  const face = (a: PlayerState, b: PlayerState) => {
    Object.assign(a, { x: 20, y: 10, z: 51, yaw: 0, pitch: 0, mode: MODE.GROUND, stun: 0 });
    Object.assign(b, { x: 20, y: 10, z: 50, yaw: Math.PI, pitch: 0, mode: MODE.GROUND, stun: 0 });
  };

  it('spawns with its own health, and the marine with his', () => {
    const { ps } = room(ROLE.XENO, ROLE.MARINE);
    expect([ps[0].state.hp, ps[1].state.hp]).toEqual([XENO_HP, HP_MAX]);
  });

  it('takes a whole point a claw, three a sting with a stumble, and frags with its own kind', () => {
    const { inner, ps, sent } = room(ROLE.XENO, ROLE.MARINE);
    const [x, m] = ps;
    face(x.state, m.state);
    x.state.cut = BLOW.CLAW_L;
    inner.punch(x);
    expect(m.state.hp).toBe(HP_MAX - 1);
    x.state.cut = BLOW.CLAW_R;
    inner.punch(x);
    inner.punch(x);
    // Claws never stun, as the third punch does.
    expect([m.state.hp, m.state.stun]).toEqual([HP_MAX - 3, 0]);
    x.state.cut = BLOW.TAIL;
    inner.punch(x);
    expect(m.state.hp).toBe(HP_MAX - 6);
    expect(m.state.stun).toBeGreaterThan(0);
    m.state.stun = 0;
    face(x.state, m.state);
    x.state.cut = BLOW.TAIL;
    inner.punch(x);
    expect(m.state.down).toBeGreaterThan(0);
    const frag = sent.map(s => JSON.parse(s)).find(s => s.t == 'frag');
    expect(frag).toMatchObject({ by: x.info.id, who: m.info.id, how: FRAG.CLAW });
  });

  it('burns who strikes it with a blade or a fist with its acid, not another xenomorph', () => {
    const { inner, ps } = room(ROLE.MARINE, ROLE.XENO, ROLE.XENO);
    const [m, x] = ps;
    face(m.state, x.state);
    m.state.cut = BLOW.HOOK;
    inner.punch(m);
    expect(m.state.hp).toBe(HP_MAX - 1);
    expect(x.state.hp).toBe(XENO_HP - 1);
    // The katana too.
    face(m.state, x.state);
    Object.assign(m.state, { blade: true, wield: true, cut: 0, swing: 1 });
    inner.cut(m);
    expect(m.state.hp).toBe(HP_MAX - 2);
    expect(x.state.hp).toBeLessThan(XENO_HP - 1);
  });

  it('pins an enemy it pounces on: health, a long stumble, his flag dropped; then its pounce is over', () => {
    const { inner, ps } = room(ROLE.XENO, ROLE.MARINE);
    const [x, m] = ps;
    face(x.state, m.state);
    Object.assign(x.state, { mode: MODE.AIR, dash: POUNCE_COOL, vx: 0, vz: -12 });
    inner.tackle(x);
    expect(m.state.hp).toBe(HP_MAX - POUNCE_HP);
    expect(m.state.stun).toBe(POUNCE_STUN);
    expect(pouncing(x.state)).toBe(false);
    // Once: the pounce is spent.
    inner.tackle(x);
    expect(m.state.hp).toBe(HP_MAX - POUNCE_HP);
  });

  it('wears no armour and heals up to its own health', () => {
    const { inner, ps } = room(ROLE.XENO);
    const [x] = ps;
    const [vx, vy, vz] = ROOFTOPS.vests![0];
    Object.assign(x.state, { x: vx, y: vy, z: vz, armor: 0 });
    inner.heal(inner.players());
    expect(x.state.armor ?? 0).toBe(0);
    const [px, py, pz] = ROOFTOPS.packs![0];
    Object.assign(x.state, { x: px, y: py, z: pz, hp: XENO_HP - 1 });
    inner.heal(inner.players());
    expect(x.state.hp).toBe(XENO_HP);
  });
});
